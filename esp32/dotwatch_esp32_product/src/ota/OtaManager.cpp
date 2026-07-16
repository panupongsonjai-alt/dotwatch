#include "ota/OtaManager.h"

#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <Update.h>
#include <WiFi.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>
#include <esp_err.h>
#include <esp_ota_ops.h>
#include <mbedtls/base64.h>
#include <mbedtls/pk.h>
#include <mbedtls/sha256.h>

#include "FirmwareVersion.h"
#include "OtaSigningKey.h"
#include "ProductConfig.h"
#include "backend/BackendClient.h"
#include "utils/StringUtils.h"
#include "security/SecurityPosture.h"

void OtaManager::begin(DeviceConfig &config,
                       RuntimeStatus &status,
                       BackendClient &backend) {
  config_ = &config;
  status_ = &status;
  backend_ = &backend;

  status_->otaState = config.otaEnabled ? "IDLE" : "DISABLED";
  status_->otaMessage = config.otaEnabled
                            ? "พร้อมตรวจสอบ Firmware ผ่านอินเทอร์เน็ต"
                            : "ปิด Internet OTA อยู่";
  status_->otaBusy = false;
  resetAvailableRelease();
  loadAntiRollbackFloor();
  scheduleNextCheck(ProductConfig::OTA_FIRST_CHECK_DELAY_MS);
  confirmRunningFirmware();
}

void OtaManager::tick(bool wifiConnected, bool setupMode) {
  if (config_ == nullptr || status_ == nullptr || backend_ == nullptr) return;

  if (!config_->otaEnabled) {
    status_->otaState = "DISABLED";
    status_->otaMessage = "ปิด Internet OTA อยู่";
    status_->otaBusy = false;
    return;
  }

  if (status_->otaBusy || !wifiConnected || setupMode) return;

  const unsigned long now = millis();
  const bool due = static_cast<long>(now - status_->otaNextCheckAtMs) >= 0;

  if (installRequested_) {
    installRequested_ = false;
    installAvailableUpdate();
    return;
  }

  if (!checkRequested_ && !due) return;
  checkRequested_ = false;

  if (checkForUpdate() &&
      status_->otaUpdateAvailable &&
      config_->otaAutoInstall &&
      (release_.autoInstall || release_.mandatory)) {
    installRequested_ = true;
  }
}

void OtaManager::requestCheck() {
  if (config_ == nullptr || status_ == nullptr) return;
  if (!config_->otaEnabled || status_->otaBusy) return;
  checkRequested_ = true;
  status_->otaState = "QUEUED";
  status_->otaMessage = "รับคำสั่งตรวจสอบ Firmware แล้ว";
}

bool OtaManager::requestInstall() {
  if (config_ == nullptr || status_ == nullptr) return false;
  if (!config_->otaEnabled || status_->otaBusy) return false;
  if (!release_.valid || !status_->otaUpdateAvailable) return false;
  installRequested_ = true;
  status_->otaState = "INSTALL_QUEUED";
  status_->otaMessage = "รับคำสั่งติดตั้ง Firmware แล้ว";
  return true;
}

bool OtaManager::busy() const {
  return status_ != nullptr && status_->otaBusy;
}

const OtaRelease &OtaManager::release() const {
  return release_;
}

bool OtaManager::checkForUpdate() {
  status_->otaBusy = true;
  status_->otaState = "CHECKING";
  status_->otaMessage = "กำลังตรวจสอบ Firmware ล่าสุด";
  status_->otaProgressPercent = 0;
  status_->otaDownloadedBytes = 0;
  status_->otaTotalBytes = 0;
  status_->otaLastCheckAtMs = millis();
  scheduleNextCheck(config_->otaCheckIntervalMs);
  resetAvailableRelease();

  if (WiFi.status() != WL_CONNECTED) {
    markError("Wi-Fi not connected");
    return false;
  }
  if (config_->deviceCode.length() == 0 ||
      config_->deviceSecret.length() == 0) {
    markError("Device Code/Secret ยังไม่ครบ");
    return false;
  }

  String endpoint = baseUrl() + ProductConfig::OTA_CHECK_PATH;
  endpoint += "?modelKey=" + String(DOTWATCH_MODEL_KEY);
  endpoint += "&currentVersion=" + String(DOTWATCH_FIRMWARE_VERSION);
  endpoint += "&currentBuild=" + String(DOTWATCH_FIRMWARE_BUILD);
  endpoint += "&channel=" + config_->otaChannel;

  HTTPClient http;
  WiFiClient plainClient;
  WiFiClientSecure secureClient;
  if (!beginHttp(http, plainClient, secureClient, endpoint)) {
    markError("เริ่ม HTTPS OTA request ไม่สำเร็จ");
    return false;
  }

  http.setTimeout(ProductConfig::OTA_HTTP_TIMEOUT_MS);
  http.addHeader("Accept", "application/json");
  http.addHeader("User-Agent", String("dotth-esp32-ota/") + DOTWATCH_FIRMWARE_VERSION);
  http.addHeader("x-device-code", config_->deviceCode);
  http.addHeader("x-device-secret", config_->deviceSecret);
  http.addHeader("x-firmware-version", DOTWATCH_FIRMWARE_VERSION);
  http.addHeader("x-firmware-build", String(DOTWATCH_FIRMWARE_BUILD));
  http.addHeader("x-model-key", DOTWATCH_MODEL_KEY);

  const int httpStatus = http.GET();
  const String response = http.getString();
  http.end();

  Serial.print("OtaManager: check status=");
  Serial.println(httpStatus);
  if (response.length() > 0) {
    Serial.print("OtaManager: check response=");
    Serial.println(response);
  }

  if (httpStatus < 200 || httpStatus >= 300) {
    markError(response.length() > 0
                  ? response
                  : String("OTA check HTTP ") + httpStatus);
    reportEvent("check_failed", status_->otaMessage, httpStatus);
    return false;
  }

  JsonDocument document;
  const DeserializationError jsonError = deserializeJson(document, response);
  if (jsonError) {
    markError(String("OTA manifest JSON invalid: ") + jsonError.c_str());
    reportEvent("check_failed", status_->otaMessage, httpStatus);
    return false;
  }

  const bool updateAvailable = document["updateAvailable"] | false;
  if (!updateAvailable) {
    resetAvailableRelease();
    status_->otaState = "UP_TO_DATE";
    status_->otaMessage = "Firmware เป็นเวอร์ชันล่าสุดแล้ว";
    status_->otaBusy = false;
    reportEvent("up_to_date", status_->otaMessage, httpStatus);
    return true;
  }

  JsonObject release = document["release"].as<JsonObject>();
  OtaRelease next;
  next.modelKey = String((const char *)(release["modelKey"] | ""));
  next.channel = String((const char *)(release["channel"] | "stable"));
  next.version = String((const char *)(release["version"] | ""));
  next.firmwareUrl = String((const char *)(release["firmwareUrl"] | ""));
  next.file = String((const char *)(release["file"] | ""));
  next.sha256 = String((const char *)(release["sha256"] | ""));
  next.releaseNotes = String((const char *)(release["releaseNotes"] | ""));
  next.releaseNotesSha256 = String((const char *)(release["releaseNotesSha256"] | ""));
  next.publishedAt = String((const char *)(release["publishedAt"] | ""));
  next.signatureAlgorithm = String((const char *)(release["signatureAlgorithm"] | ""));
  next.signatureKeyId = String((const char *)(release["signatureKeyId"] | ""));
  next.signature = String((const char *)(release["signature"] | ""));
  next.buildNumber = release["buildNumber"] | 0UL;
  next.size = release["size"] | 0UL;
  next.mandatory = release["mandatory"] | false;
  next.autoInstall = release["autoInstall"] | false;

  next.modelKey.trim();
  next.channel.trim();
  next.version.trim();
  next.firmwareUrl.trim();
  next.file.trim();
  next.sha256.trim();
  next.sha256.toLowerCase();
  next.releaseNotesSha256.trim();
  next.releaseNotesSha256.toLowerCase();
  next.publishedAt.trim();
  next.signatureAlgorithm.trim();
  next.signatureKeyId.trim();
  next.signature.trim();

  if (next.modelKey != DOTWATCH_MODEL_KEY ||
      next.buildNumber <= minimumAcceptedBuild() ||
      next.version.length() == 0 ||
      next.firmwareUrl.length() == 0 ||
      next.file.length() == 0 ||
      next.sha256.length() != 64 ||
      next.releaseNotesSha256.length() != 64 ||
      next.size == 0 ||
      next.size > ProductConfig::OTA_MAX_FIRMWARE_BYTES) {
    markError("OTA manifest ไม่ผ่าน model/build/anti-rollback/url/SHA-256/size");
    reportEvent("manifest_rejected", status_->otaMessage, httpStatus);
    return false;
  }

  String signatureReason;
  if (!verifyReleaseSignature(next, signatureReason)) {
    markError(String("OTA signature ไม่ผ่าน: ") + signatureReason);
    reportEvent("signature_rejected", status_->otaMessage, httpStatus);
    return false;
  }

  next.valid = true;
  release_ = next;
  status_->otaUpdateAvailable = true;
  status_->otaAvailableVersion = next.version;
  status_->otaAvailableBuild = next.buildNumber;
  status_->otaReleaseNotes = next.releaseNotes;
  status_->otaMandatory = next.mandatory;
  status_->otaTotalBytes = next.size;
  status_->otaState = "UPDATE_AVAILABLE";
  status_->otaMessage = String("พบ Firmware ใหม่ ") + next.version;
  status_->otaBusy = false;

  Serial.print("OtaManager: update available version=");
  Serial.print(next.version);
  Serial.print(" build=");
  Serial.print(next.buildNumber);
  Serial.print(" size=");
  Serial.println(next.size);
  reportEvent("update_available", status_->otaMessage, httpStatus);
  return true;
}

bool OtaManager::installAvailableUpdate() {
  if (!release_.valid || !status_->otaUpdateAvailable) {
    markError("ยังไม่มี Firmware ที่พร้อมติดตั้ง กรุณากด Check ก่อน");
    return false;
  }
  if (WiFi.status() != WL_CONNECTED) {
    markError("Wi-Fi disconnected before OTA install");
    return false;
  }

  status_->otaBusy = true;
  status_->state = AppState::UPDATING;
  status_->otaState = "DOWNLOADING";
  status_->otaMessage = String("กำลังดาวน์โหลด ") + release_.version;
  status_->otaProgressPercent = 0;
  status_->otaDownloadedBytes = 0;
  status_->otaTotalBytes = release_.size;

  reportEvent("download_started", status_->otaMessage);

  HTTPClient http;
  WiFiClient plainClient;
  WiFiClientSecure secureClient;
  if (!beginHttp(http, plainClient, secureClient, release_.firmwareUrl)) {
    markError("เริ่ม Firmware download ไม่สำเร็จ");
    reportEvent("install_failed", status_->otaMessage);
    return false;
  }

  http.setTimeout(ProductConfig::OTA_HTTP_TIMEOUT_MS);
  http.addHeader("Accept", "application/octet-stream");
  http.addHeader("User-Agent", String("dotth-esp32-ota/") + DOTWATCH_FIRMWARE_VERSION);
  http.addHeader("x-device-code", config_->deviceCode);
  http.addHeader("x-device-secret", config_->deviceSecret);
  http.addHeader("x-model-key", DOTWATCH_MODEL_KEY);

  const int httpStatus = http.GET();
  if (httpStatus < 200 || httpStatus >= 300) {
    const String response = http.getString();
    http.end();
    markError(response.length() > 0
                  ? response
                  : String("Firmware download HTTP ") + httpStatus);
    reportEvent("install_failed", status_->otaMessage, httpStatus);
    return false;
  }

  const int announcedLength = http.getSize();
  if (announcedLength > 0 &&
      static_cast<uint32_t>(announcedLength) != release_.size) {
    http.end();
    markError("Content-Length ไม่ตรงกับ manifest");
    reportEvent("install_failed", status_->otaMessage, httpStatus);
    return false;
  }

  if (!Update.begin(release_.size, U_FLASH)) {
    const String error = String("OTA partition ไม่พร้อม: ") + Update.errorString();
    http.end();
    markError(error);
    reportEvent("install_failed", status_->otaMessage, httpStatus);
    return false;
  }

  mbedtls_sha256_context shaContext;
  mbedtls_sha256_init(&shaContext);
  if (mbedtls_sha256_starts_ret(&shaContext, 0) != 0) {
    Update.abort();
    http.end();
    markError("เริ่ม SHA-256 ไม่สำเร็จ");
    reportEvent("install_failed", status_->otaMessage, httpStatus);
    return false;
  }

  WiFiClient *stream = http.getStreamPtr();
  uint8_t buffer[ProductConfig::OTA_DOWNLOAD_BUFFER_SIZE];
  uint32_t totalRead = 0;
  unsigned long lastDataAt = millis();
  bool streamOk = true;

  while (totalRead < release_.size) {
    const size_t available = stream->available();
    if (available > 0) {
      const size_t remaining = release_.size - totalRead;
      const size_t readSize = min(
          min(available, sizeof(buffer)),
          static_cast<size_t>(remaining));
      const size_t bytesRead = stream->readBytes(buffer, readSize);
      if (bytesRead == 0) {
        delay(1);
        continue;
      }

      if (mbedtls_sha256_update_ret(&shaContext, buffer, bytesRead) != 0) {
        streamOk = false;
        status_->otaMessage = "คำนวณ SHA-256 ไม่สำเร็จ";
        break;
      }

      const size_t bytesWritten = Update.write(buffer, bytesRead);
      if (bytesWritten != bytesRead) {
        streamOk = false;
        status_->otaMessage = String("เขียน OTA partition ไม่สำเร็จ: ") +
                              Update.errorString();
        break;
      }

      totalRead += bytesRead;
      lastDataAt = millis();
      status_->otaDownloadedBytes = totalRead;
      status_->otaProgressPercent = static_cast<uint8_t>(
          min(100UL, (totalRead * 100UL) / release_.size));

      if ((totalRead % (64UL * 1024UL)) < bytesRead) {
        Serial.print("OtaManager: download ");
        Serial.print(status_->otaProgressPercent);
        Serial.println("%");
      }
      delay(1);
      continue;
    }

    if (!http.connected() ||
        millis() - lastDataAt > ProductConfig::OTA_STREAM_IDLE_TIMEOUT_MS) {
      streamOk = false;
      status_->otaMessage = "Firmware stream ขาดหายหรือหมดเวลา";
      break;
    }
    delay(2);
  }

  uint8_t digest[32] = {0};
  const int finishResult = mbedtls_sha256_finish_ret(&shaContext, digest);
  mbedtls_sha256_free(&shaContext);
  http.end();

  if (!streamOk || finishResult != 0 || totalRead != release_.size) {
    Update.abort();
    if (status_->otaMessage.length() == 0) {
      status_->otaMessage = "ดาวน์โหลด Firmware ไม่ครบ";
    }
    markError(status_->otaMessage);
    reportEvent("install_failed", status_->otaMessage, httpStatus);
    return false;
  }

  const String actualSha256 = sha256Hex(digest);
  if (!actualSha256.equalsIgnoreCase(release_.sha256)) {
    Update.abort();
    markError("SHA-256 ไม่ตรง ระบบยกเลิก Firmware ใหม่");
    Serial.print("OtaManager: expected sha256=");
    Serial.println(release_.sha256);
    Serial.print("OtaManager: actual sha256=");
    Serial.println(actualSha256);
    reportEvent("install_failed", status_->otaMessage, httpStatus);
    return false;
  }

  status_->otaState = "VERIFYING";
  status_->otaMessage = "ลายเซ็นและ SHA-256 ถูกต้อง กำลังสลับ OTA partition";
  status_->otaProgressPercent = 100;

  if (!Update.end(false) || !Update.isFinished()) {
    const String error = String("ปิด OTA image ไม่สำเร็จ: ") + Update.errorString();
    markError(error);
    reportEvent("install_failed", status_->otaMessage, httpStatus);
    return false;
  }

  status_->otaState = "REBOOTING";
  status_->otaMessage = String("ติดตั้ง ") + release_.version +
                        " สำเร็จ กำลัง Restart";
  reportEvent("installed_rebooting", status_->otaMessage, httpStatus);
  Serial.println("OtaManager: OTA installed; restarting in 2 seconds");
  delay(2000);
  ESP.restart();
  return true;
}

bool OtaManager::reportEvent(const String &event,
                             const String &message,
                             int httpStatus) {
  if (config_ == nullptr || backend_ == nullptr) return false;
  if (WiFi.status() != WL_CONNECTED) return false;

  const String endpoint = baseUrl() + ProductConfig::OTA_REPORT_PATH;
  HTTPClient http;
  WiFiClient plainClient;
  WiFiClientSecure secureClient;
  if (!beginHttp(http, plainClient, secureClient, endpoint)) return false;

  JsonDocument document;
  document["event"] = event;
  document["message"] = message;
  document["modelKey"] = DOTWATCH_MODEL_KEY;
  document["firmwareVersion"] = DOTWATCH_FIRMWARE_VERSION;
  document["firmwareBuild"] = DOTWATCH_FIRMWARE_BUILD;
  document["availableVersion"] = release_.version;
  document["availableBuild"] = release_.buildNumber;
  document["signatureKeyId"] = release_.signatureKeyId;
  document["antiRollbackFloor"] = antiRollbackFloor_;
  document["httpStatus"] = httpStatus;
  document["freeHeap"] = ESP.getFreeHeap();
  document["uptimeMs"] = millis();
  document["secureBootEnabled"] = SecurityPosture::secureBootEnabled();
  document["flashEncryptionEnabled"] = SecurityPosture::flashEncryptionEnabled();
  document["chipRevision"] = SecurityPosture::chipRevision();

  String body;
  serializeJson(document, body);

  http.setTimeout(ProductConfig::OTA_HTTP_TIMEOUT_MS);
  http.addHeader("Accept", "application/json");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("User-Agent", String("dotth-esp32-ota/") + DOTWATCH_FIRMWARE_VERSION);
  http.addHeader("x-device-code", config_->deviceCode);
  http.addHeader("x-device-secret", config_->deviceSecret);
  http.addHeader("x-model-key", DOTWATCH_MODEL_KEY);
  const int status = http.POST(body);
  http.end();
  return status >= 200 && status < 300;
}

bool OtaManager::beginHttp(HTTPClient &http,
                           WiFiClient &plainClient,
                           WiFiClientSecure &secureClient,
                           const String &url) {
  if (url.startsWith("https://")) {
    if (backend_->hasEffectiveCa()) {
      secureClient.setCACert(backend_->effectiveCa());
    } else {
#if DOTWATCH_ALLOW_INSECURE_TLS_FALLBACK
      secureClient.setInsecure();
#else
      return false;
#endif
    }
    return http.begin(secureClient, url);
  }
  if (url.startsWith("http://")) {
    return http.begin(plainClient, url);
  }
  return false;
}

String OtaManager::baseUrl() const {
  if (config_ == nullptr) return "";
  const String configured = config_->otaBaseUrl.length() > 0
                                ? config_->otaBaseUrl
                                : config_->apiUrl;
  return StringUtils::normalizeApiUrl(configured);
}

String OtaManager::sha256Hex(const uint8_t digest[32]) const {
  static const char hex[] = "0123456789abcdef";
  String output;
  output.reserve(64);
  for (size_t index = 0; index < 32; index++) {
    output += hex[(digest[index] >> 4) & 0x0F];
    output += hex[digest[index] & 0x0F];
  }
  return output;
}

String OtaManager::sha256TextHex(const String &value) const {
  uint8_t digest[32] = {0};
  const int result = mbedtls_sha256_ret(
      reinterpret_cast<const unsigned char *>(value.c_str()),
      value.length(),
      digest,
      0);
  return result == 0 ? sha256Hex(digest) : "";
}

bool OtaManager::isSafeSignedField(const String &value, size_t maxLength) const {
  if (value.length() == 0 || value.length() > maxLength) return false;
  for (size_t index = 0; index < value.length(); index++) {
    const char character = value.charAt(index);
    if (character == '\r' || character == '\n' || character == '\0') return false;
  }
  return true;
}

String OtaManager::canonicalReleasePayload(const OtaRelease &release) const {
  String payload;
  payload.reserve(640);
  payload += "dotwatch-ota-release-v1\n";
  payload += "algorithm=";
  payload += release.signatureAlgorithm;
  payload += "\nkeyId=";
  payload += release.signatureKeyId;
  payload += "\nmodelKey=";
  payload += release.modelKey;
  payload += "\nchannel=";
  payload += release.channel;
  payload += "\nversion=";
  payload += release.version;
  payload += "\nbuildNumber=";
  payload += String(release.buildNumber);
  payload += "\nfile=";
  payload += release.file;
  payload += "\nsize=";
  payload += String(release.size);
  payload += "\nsha256=";
  payload += release.sha256;
  payload += "\nmandatory=";
  payload += release.mandatory ? "1" : "0";
  payload += "\nautoInstall=";
  payload += release.autoInstall ? "1" : "0";
  payload += "\npublishedAt=";
  payload += release.publishedAt;
  payload += "\nreleaseNotesSha256=";
  payload += release.releaseNotesSha256;
  payload += "\n";
  return payload;
}

bool OtaManager::verifyReleaseSignature(const OtaRelease &release,
                                        String &reason) const {
#if !DOTWATCH_OTA_SIGNING_KEY_CONFIGURED
  reason = "ยังไม่ได้กำหนด OTA release public key";
  return false;
#else
  if (release.signatureAlgorithm != "ecdsa-p256-sha256") {
    reason = "signature algorithm ไม่รองรับ";
    return false;
  }
  if (release.signatureKeyId != DOTWATCH_OTA_SIGNING_KEY_ID) {
    reason = "signature key id ไม่ตรง";
    return false;
  }
  if (!isSafeSignedField(release.modelKey, 96) ||
      !isSafeSignedField(release.channel, 32) ||
      !isSafeSignedField(release.version, 128) ||
      !isSafeSignedField(release.file, 180) ||
      !isSafeSignedField(release.publishedAt, 64) ||
      !isSafeSignedField(release.signatureKeyId, 96) ||
      !isSafeSignedField(release.signatureAlgorithm, 48)) {
    reason = "signed metadata มีอักขระหรือความยาวไม่ถูกต้อง";
    return false;
  }
  if (!release.file.endsWith(".bin")) {
    reason = "signed firmware filename ไม่ถูกต้อง";
    return false;
  }

  const String actualNotesSha256 = sha256TextHex(release.releaseNotes);
  if (actualNotesSha256.length() != 64 ||
      !actualNotesSha256.equalsIgnoreCase(release.releaseNotesSha256)) {
    reason = "release notes hash ไม่ตรง";
    return false;
  }

  const String payload = canonicalReleasePayload(release);
  uint8_t payloadDigest[32] = {0};
  if (mbedtls_sha256_ret(
          reinterpret_cast<const unsigned char *>(payload.c_str()),
          payload.length(),
          payloadDigest,
          0) != 0) {
    reason = "คำนวณ signed payload SHA-256 ไม่สำเร็จ";
    return false;
  }

  uint8_t signatureBytes[96] = {0};
  size_t signatureLength = 0;
  const int decodeResult = mbedtls_base64_decode(
      signatureBytes,
      sizeof(signatureBytes),
      &signatureLength,
      reinterpret_cast<const unsigned char *>(release.signature.c_str()),
      release.signature.length());
  if (decodeResult != 0 || signatureLength < 64 || signatureLength > 80) {
    reason = "signature base64/length ไม่ถูกต้อง";
    return false;
  }

  mbedtls_pk_context publicKey;
  mbedtls_pk_init(&publicKey);
  const int parseResult = mbedtls_pk_parse_public_key(
      &publicKey,
      reinterpret_cast<const unsigned char *>(DOTWATCH_OTA_SIGNING_PUBLIC_KEY_PEM),
      strlen(DOTWATCH_OTA_SIGNING_PUBLIC_KEY_PEM) + 1);
  if (parseResult != 0) {
    mbedtls_pk_free(&publicKey);
    reason = String("อ่าน OTA public key ไม่สำเร็จ: ") + parseResult;
    return false;
  }

  const int verifyResult = mbedtls_pk_verify(
      &publicKey,
      MBEDTLS_MD_SHA256,
      payloadDigest,
      sizeof(payloadDigest),
      signatureBytes,
      signatureLength);
  mbedtls_pk_free(&publicKey);

  if (verifyResult != 0) {
    reason = String("ECDSA verify failed: ") + verifyResult;
    return false;
  }

  reason = "";
  return true;
#endif
}

void OtaManager::loadAntiRollbackFloor() {
  Preferences preferences;
  if (!preferences.begin(ProductConfig::NVS_NAMESPACE, true)) {
    antiRollbackFloor_ = DOTWATCH_FIRMWARE_BUILD;
    return;
  }
  antiRollbackFloor_ = preferences.getULong("otaFloor", 0);
  preferences.end();
  if (antiRollbackFloor_ < DOTWATCH_FIRMWARE_BUILD) {
    antiRollbackFloor_ = DOTWATCH_FIRMWARE_BUILD;
  }
}

void OtaManager::persistAntiRollbackFloor(uint32_t buildNumber) {
  if (buildNumber <= antiRollbackFloor_) return;

  Preferences preferences;
  if (!preferences.begin(ProductConfig::NVS_NAMESPACE, false)) return;
  const size_t written = preferences.putULong("otaFloor", buildNumber);
  preferences.end();

  if (written > 0) {
    antiRollbackFloor_ = buildNumber;
    Serial.print("OtaManager: anti-rollback floor=");
    Serial.println(antiRollbackFloor_);
  }
}

uint32_t OtaManager::minimumAcceptedBuild() const {
  return max(static_cast<uint32_t>(DOTWATCH_FIRMWARE_BUILD), antiRollbackFloor_);
}

void OtaManager::resetAvailableRelease() {
  release_ = OtaRelease();
  if (status_ == nullptr) return;
  status_->otaUpdateAvailable = false;
  status_->otaAvailableVersion = "";
  status_->otaAvailableBuild = 0;
  status_->otaReleaseNotes = "";
  status_->otaMandatory = false;
  status_->otaDownloadedBytes = 0;
  status_->otaTotalBytes = 0;
  status_->otaProgressPercent = 0;
}

void OtaManager::markError(const String &message) {
  if (status_ == nullptr) return;
  if (status_->state == AppState::UPDATING) status_->state = AppState::DEGRADED;
  status_->otaState = "ERROR";
  status_->otaMessage = message;
  status_->otaBusy = false;
  status_->otaProgressPercent = 0;
  scheduleNextCheck(config_ != nullptr
                        ? config_->otaCheckIntervalMs
                        : ProductConfig::OTA_DEFAULT_CHECK_INTERVAL_MS);
  Serial.print("OtaManager: error=");
  Serial.println(message);
}

void OtaManager::scheduleNextCheck(unsigned long delayMs) {
  if (status_ == nullptr) return;
  status_->otaNextCheckAtMs = millis() + delayMs;
}

void OtaManager::confirmRunningFirmware() {
  const esp_partition_t *running = esp_ota_get_running_partition();
  if (running == nullptr) return;

  esp_ota_img_states_t state;
  const esp_err_t result = esp_ota_get_state_partition(running, &state);
  if (result != ESP_OK) {
    Serial.print("OtaManager: running image state unavailable=");
    Serial.println(esp_err_to_name(result));
    return;
  }

  if (state == ESP_OTA_IMG_PENDING_VERIFY) {
    const esp_err_t confirmResult = esp_ota_mark_app_valid_cancel_rollback();
    Serial.print("OtaManager: pending image confirmation result=");
    Serial.println(esp_err_to_name(confirmResult));
    if (confirmResult != ESP_OK) return;
  }

  // Persist only after the running image is confirmed healthy. This preserves
  // the ability to retry a failed candidate while preventing later downgrade.
  persistAntiRollbackFloor(DOTWATCH_FIRMWARE_BUILD);
}
