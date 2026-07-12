#include "portal/PortalServer.h"

#include <ArduinoJson.h>
#include <WiFi.h>

#include "FirmwareVersion.h"
#include "ProductConfig.h"
#include "backend/BackendClient.h"
#include "config/ConfigStore.h"
#include "network/WiFiManager.h"
#include "ota/OtaManager.h"
#include "sensors/SensorManager.h"
#include "utils/StringUtils.h"

PortalServer::PortalServer() : server_(80) {}

void PortalServer::begin(DeviceConfig &config,
                         RuntimeStatus &status,
                         ConfigStore &store,
                         WiFiManager &wifi,
                         SensorManager &sensors,
                         BackendClient &backend,
                         OtaManager &ota) {
  config_ = &config;
  status_ = &status;
  store_ = &store;
  wifi_ = &wifi;
  sensors_ = &sensors;
  backend_ = &backend;
  ota_ = &ota;
  view_.begin(config, status, store, wifi, sensors, backend);
}

void PortalServer::startSetupPortal() {
  if (wifi_ == nullptr || status_ == nullptr) return;

  setupMode_ = true;
  status_->portalMode = true;
  wifi_->startSetupAccessPoint();
  dnsServer_.start(
      ProductConfig::DNS_PORT,
      "*",
      WiFi.softAPIP());

  registerRoutes();
  if (!serverStarted_) {
    server_.begin();
    serverStarted_ = true;
  }

  Serial.print("PortalServer: setup portal http://");
  Serial.println(WiFi.softAPIP());
}

void PortalServer::startLocalAdmin() {
  if (status_ == nullptr) return;

  setupMode_ = false;
  status_->portalMode = false;

  registerRoutes();
  if (!serverStarted_) {
    server_.begin();
    serverStarted_ = true;
  }

  Serial.print("PortalServer: local admin http://");
  Serial.print(WiFi.localIP());
  Serial.println("/");
  Serial.println("PortalServer: local admin is PIN protected");
}

void PortalServer::loop() {
  if (setupMode_) dnsServer_.processNextRequest();
  if (serverStarted_) server_.handleClient();
}

bool PortalServer::isSetupMode() const {
  return setupMode_;
}

void PortalServer::registerRoutes() {
  if (routesRegistered_) return;

  server_.on("/", HTTP_GET, [this]() { handleRoot(); });
  server_.on("/wifi-scan", HTTP_GET, [this]() { handleWiFiScan(); });
  server_.on("/wifi-save", HTTP_POST, [this]() { handleWiFiSave(); });
  server_.on("/wifi-clear", HTTP_POST, [this]() { handleWiFiClear(); });
  server_.on("/wifi-ip-relearn", HTTP_POST,
             [this]() { handleWiFiIpRelearn(); });
  server_.on("/device-save", HTTP_POST, [this]() { handleDeviceSave(); });
  server_.on("/ota-save", HTTP_POST, [this]() { handleOtaSave(); });
  server_.on("/ota-check", HTTP_POST, [this]() { handleOtaCheck(); });
  server_.on("/ota-install", HTTP_POST, [this]() { handleOtaInstall(); });
  server_.on("/json", HTTP_GET, [this]() { handleJson(); });
  server_.on("/test", HTTP_GET, [this]() { handleTest(); });
  server_.on("/reset", HTTP_POST, [this]() { handleReset(); });
  server_.on("/restart", HTTP_POST, [this]() { handleRestart(); });
  server_.on("/generate_204", HTTP_GET, [this]() { handleCaptive(); });
  server_.on("/gen_204", HTTP_GET, [this]() { handleCaptive(); });
  server_.on("/hotspot-detect.html", HTTP_GET, [this]() { handleCaptive(); });
  server_.on("/fwlink", HTTP_GET, [this]() { handleCaptive(); });
  server_.onNotFound([this]() { handleNotFound(); });

  routesRegistered_ = true;
}

void PortalServer::handleRoot() {
  if (!setupMode_ && !isAdminAuthorized()) {
    sendLocalAdminLogin();
    return;
  }

  syncViewContext();
  server_.send(
      200,
      "text/html; charset=utf-8",
      view_.dashboardPage());
}

void PortalServer::handleWiFiScan() {
  if (!setupMode_ && !isAdminAuthorized()) {
    server_.send(
        403,
        "application/json; charset=utf-8",
        "{\"ok\":false,\"message\":\"Local Admin PIN required\"}");
    return;
  }

  ScannedNetwork results[ProductConfig::WIFI_SCAN_MAX];
  const int count = wifi_->scan(results, ProductConfig::WIFI_SCAN_MAX);

  JsonDocument document;
  document["ok"] = true;
  document["count"] = count;
  JsonArray networks = document["networks"].to<JsonArray>();

  for (int index = 0; index < count; index++) {
    JsonObject item = networks.add<JsonObject>();
    item["ssid"] = results[index].ssid;
    item["rssi"] = results[index].rssi;
    item["quality"] = StringUtils::signalQualityPercent(results[index].rssi);
    item["secure"] = results[index].secure;
    item["current"] = results[index].current;
    item["remembered"] = results[index].remembered;
  }

  String output;
  serializeJson(document, output);
  server_.sendHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  server_.send(200, "application/json; charset=utf-8", output);
}

void PortalServer::handleWiFiSave() {
  if (!requireAdmin()) return;

  String ssid = server_.hasArg("wifiSsid")
                    ? server_.arg("wifiSsid")
                    : "";
  String password = server_.hasArg("wifiPassword")
                        ? server_.arg("wifiPassword")
                        : "";
  ssid.trim();

  if (ssid.length() == 0 || ssid.length() > 32) {
    server_.send(
        400,
        "text/html; charset=utf-8",
        renderNoticePage(
            "Wi-Fi Error",
            "ชื่อ Wi-Fi ไม่ถูกต้อง",
            "กรุณาเลือกหรือกรอกชื่อ Wi-Fi ความยาวไม่เกิน 32 ตัวอักษร",
            "/" + authQuery() + "#wifi",
            "กลับไปตั้งค่า Wi-Fi"));
    return;
  }

  if (password.length() == 0 && ssid == config_->wifiSsid) {
    password = config_->wifiPassword;
  }

  if (password.length() > 63 ||
      (password.length() > 0 && password.length() < 8)) {
    server_.send(
        400,
        "text/html; charset=utf-8",
        renderNoticePage(
            "Wi-Fi Error",
            "รหัสผ่าน Wi-Fi ไม่ถูกต้อง",
            "รหัสผ่าน WPA/WPA2 ต้องมี 8–63 ตัวอักษร หรือเว้นว่างสำหรับเครือข่าย Open",
            "/" + authQuery() + "#wifi",
            "กลับไปตั้งค่า Wi-Fi"));
    return;
  }

  const bool keepBackups = server_.hasArg("keepWifiBackups");
  if (!store_->stageWiFi(*config_, ssid, password, keepBackups)) {
    server_.send(
        500,
        "text/html; charset=utf-8",
        renderNoticePage(
            "Wi-Fi Save Error",
            "บันทึก Wi-Fi ไม่สำเร็จ",
            "ไม่สามารถบันทึก Pending Wi-Fi ลง NVS ได้ กรุณาลองใหม่"));
    return;
  }

  String notice = "ระบบจะลองเชื่อมต่อ <strong>";
  notice += StringUtils::htmlEscape(ssid);
  notice += "</strong> หลัง Restart หากเชื่อมไม่สำเร็จจะย้อนกลับ Wi-Fi เดิมโดยอัตโนมัติ";

  server_.send(
      200,
      "text/html; charset=utf-8",
      renderRestartPage(
          "กำลังเปลี่ยน Wi-Fi",
          "Wi-Fi staged safely",
          "กำลังทดสอบ Wi-Fi ใหม่",
          "ESP32 จะ Restart ภายใน 2 วินาที",
          notice));
  delay(1700);
  ESP.restart();
}

void PortalServer::handleWiFiClear() {
  if (!requireAdmin()) return;

  store_->clearWiFi(*config_);

  String notice = "หลัง Restart ให้เชื่อม <strong>";
  notice += StringUtils::htmlEscape(wifi_->setupSsid());
  notice += "</strong> รหัส <strong>";
  notice += StringUtils::htmlEscape(wifi_->setupPassword());
  notice += "</strong> แล้วเปิด http://192.168.4.1/";

  server_.send(
      200,
      "text/html; charset=utf-8",
      renderRestartPage(
          "ล้าง Wi-Fi",
          "Wi-Fi reset",
          "ล้างเฉพาะ Wi-Fi แล้ว",
          "Backend, Device Code, Device Secret และ Sensor ยังอยู่ครบ",
          notice));
  delay(1500);
  ESP.restart();
}

void PortalServer::handleWiFiIpRelearn() {
  if (!requireAdmin()) return;

  const String ssid = wifi_->currentSsid().length() > 0
                          ? wifi_->currentSsid()
                          : config_->wifiSsid;
  if (!wifi_->forgetCurrentIpLease()) {
    server_.send(
        400,
        "text/html; charset=utf-8",
        renderNoticePage(
            "IP Relearn Error",
            "ยังไม่สามารถลืม Fixed IP ได้",
            "ไม่พบ Wi-Fi ปัจจุบันหรือข้อมูล IP ที่บันทึกไว้",
            "/" + authQuery() + "#wifi",
            "กลับหน้า Wi-Fi"));
    return;
  }

  String notice = "หลัง Restart ระบบจะใช้ DHCP หนึ่งครั้งเพื่อรับ IP ของ <strong>";
  notice += StringUtils::htmlEscape(ssid);
  notice += "</strong> แล้วจำ IP นั้นเป็น Fixed IP ใหม่โดยอัตโนมัติ";

  server_.send(
      200,
      "text/html; charset=utf-8",
      renderRestartPage(
          "เรียนรู้ Fixed IP ใหม่",
          "First IP relearn",
          "ลืม Fixed IP เดิมแล้ว",
          "ESP32 จะ Restart ภายใน 2 วินาที",
          notice));
  delay(1700);
  ESP.restart();
}

void PortalServer::handleDeviceSave() {
  if (!requireAdmin()) return;

  DeviceConfig next = *config_;

  if (server_.hasArg("apiUrl")) {
    next.apiUrl = StringUtils::normalizeApiUrl(server_.arg("apiUrl"));
  }
  if (server_.hasArg("deviceCode")) {
    next.deviceCode = server_.arg("deviceCode");
  }
  if (server_.hasArg("deviceSecret") &&
      server_.arg("deviceSecret").length() > 0) {
    next.deviceSecret = server_.arg("deviceSecret");
  }
  if (server_.hasArg("adminPin") &&
      server_.arg("adminPin").length() > 0) {
    next.adminPin = server_.arg("adminPin");
  }
  if (server_.hasArg("tlsCaCert")) {
    String tlsInput = server_.arg("tlsCaCert");
    tlsInput.trim();
    if (tlsInput == "CLEAR") {
      next.tlsCaCert = "";
    } else if (tlsInput.length() > 0) {
      next.tlsCaCert = server_.arg("tlsCaCert");
    }
  }
  if (server_.hasArg("dhtPin")) {
    next.dhtPin = server_.arg("dhtPin").toInt();
  }
  if (server_.hasArg("dhtType")) {
    next.dhtType = server_.arg("dhtType").toInt() == 22 ? 22 : 11;
  }
  if (server_.hasArg("sendIntervalSec")) {
    int intervalSeconds = server_.arg("sendIntervalSec").toInt();
    if (intervalSeconds < 10) intervalSeconds = 10;
    next.sendIntervalMs =
        static_cast<unsigned long>(intervalSeconds) * 1000UL;
  }
  if (server_.hasArg("fallbackDummy")) {
    next.fallbackDummy = server_.arg("fallbackDummy") == "true";
  }

  next.deviceCode.trim();
  next.deviceSecret.trim();
  next.adminPin.trim();
  next.tlsCaCert.trim();

  if (next.dhtPin < 0 || next.dhtPin > 39) {
    next.dhtPin = ProductConfig::DEFAULT_DHT_PIN;
  }

  if (next.adminPin.length() > 0 && next.adminPin.length() < 4) {
    server_.send(
        400,
        "text/html; charset=utf-8",
        renderNoticePage(
            "Invalid PIN",
            "Local Admin PIN ไม่ถูกต้อง",
            "PIN ต้องมีอย่างน้อย 4 ตัวอักษร"));
    return;
  }

  if (next.tlsCaCert.length() > 0 &&
      next.tlsCaCert.indexOf("BEGIN CERTIFICATE") < 0) {
    server_.send(
        400,
        "text/html; charset=utf-8",
        renderNoticePage(
            "Invalid Root CA",
            "Root CA ไม่ถูกต้อง",
            "ต้องเป็น PEM ที่มี BEGIN CERTIFICATE หรือพิมพ์ CLEAR เพื่อลบ Portal CA"));
    return;
  }

  if (!store_->save(next)) {
    server_.send(
        500,
        "text/html; charset=utf-8",
        renderNoticePage(
            "Save Error",
            "บันทึก Device ไม่สำเร็จ",
            "ไม่สามารถเขียนข้อมูลลง NVS ได้"));
    return;
  }

  *config_ = next;
  sensors_->reconfigure(*config_);

  server_.send(
      200,
      "text/html; charset=utf-8",
      renderRestartPage(
          "บันทึก Device",
          "Device settings saved",
          "บันทึกการตั้งค่าแล้ว",
          "ESP32 จะ Restart เพื่อใช้ Backend, Device และ Sensor ใหม่"));
  delay(1500);
  ESP.restart();
}


void PortalServer::handleOtaSave() {
  if (!requireAdmin()) return;

  DeviceConfig next = *config_;
  if (server_.hasArg("otaBaseUrl")) {
    next.otaBaseUrl = server_.arg("otaBaseUrl");
    next.otaBaseUrl.trim();
    while (next.otaBaseUrl.endsWith("/")) {
      next.otaBaseUrl.remove(next.otaBaseUrl.length() - 1);
    }
  }
  if (server_.hasArg("otaChannel")) {
    next.otaChannel = server_.arg("otaChannel");
    next.otaChannel.trim();
  }
  next.otaEnabled = server_.hasArg("otaEnabled");
  next.otaAutoInstall = server_.hasArg("otaAutoInstall");

  if (server_.hasArg("otaCheckIntervalMinutes")) {
    long minutes = server_.arg("otaCheckIntervalMinutes").toInt();
    if (minutes < 15) minutes = 15;
    if (minutes > 1440) minutes = 1440;
    next.otaCheckIntervalMs = static_cast<unsigned long>(minutes) * 60UL * 1000UL;
  }

  if (next.otaChannel.length() == 0) {
    next.otaChannel = ProductConfig::DEFAULT_OTA_CHANNEL;
  }
  if (next.otaBaseUrl.length() > 0 &&
      !next.otaBaseUrl.startsWith("https://") &&
      !next.otaBaseUrl.startsWith("http://")) {
    server_.send(
        400,
        "text/html; charset=utf-8",
        renderNoticePage(
            "OTA Settings",
            "OTA Base URL ไม่ถูกต้อง",
            "ต้องขึ้นต้นด้วย https:// หรือ http:// หรือเว้นว่างเพื่อใช้ Backend API URL",
            "/" + authQuery() + "#firmware",
            "กลับหน้า Firmware Update"));
    return;
  }

  if (!store_->save(next)) {
    server_.send(
        500,
        "text/html; charset=utf-8",
        renderNoticePage(
            "OTA Settings",
            "บันทึก OTA Settings ไม่สำเร็จ",
            "ไม่สามารถเขียนค่า OTA ลง NVS ได้",
            "/" + authQuery() + "#firmware",
            "กลับหน้า Firmware Update"));
    return;
  }

  *config_ = next;
  server_.sendHeader("Location", "/" + authQuery() + "#firmware", true);
  server_.send(303, "text/plain; charset=utf-8", "OTA settings saved");
}

void PortalServer::handleOtaCheck() {
  if (!requireAdmin()) return;
  if (ota_ == nullptr || !config_->otaEnabled) {
    server_.send(409, "application/json; charset=utf-8",
                 "{\"ok\":false,\"message\":\"Internet OTA is disabled\"}");
    return;
  }
  ota_->requestCheck();
  server_.send(202, "application/json; charset=utf-8",
               "{\"ok\":true,\"message\":\"OTA check queued\"}");
}

void PortalServer::handleOtaInstall() {
  if (!requireAdmin()) return;
  if (ota_ == nullptr || !ota_->requestInstall()) {
    server_.send(409, "application/json; charset=utf-8",
                 "{\"ok\":false,\"message\":\"No verified update is ready. Run Check first.\"}");
    return;
  }
  server_.send(202, "application/json; charset=utf-8",
               "{\"ok\":true,\"message\":\"OTA install queued\"}");
}

void PortalServer::handleJson() {
  if (!setupMode_ && !isAdminAuthorized()) {
    JsonDocument publicDocument;
    publicDocument["firmwareVersion"] = DOTWATCH_FIRMWARE_VERSION;
    publicDocument["modelKey"] = DOTWATCH_MODEL_KEY;
    publicDocument["state"] = StringUtils::appStateText(status_->state);
    publicDocument["wifiConnected"] = wifi_->isConnected();
    publicDocument["ip"] = wifi_->currentIp();
    publicDocument["localAdminProtected"] = true;
    publicDocument["message"] = "Open / and enter Local Admin PIN for full status.";
    String output;
    serializeJsonPretty(publicDocument, output);
    server_.send(200, "application/json; charset=utf-8", output);
    return;
  }

  JsonDocument document;
  document["productName"] = DOTWATCH_PRODUCT_NAME;
  document["firmwareVersion"] = DOTWATCH_FIRMWARE_VERSION;
  document["configSchemaVersion"] = config_->schemaVersion;
  document["modelKey"] = DOTWATCH_MODEL_KEY;
  document["state"] = StringUtils::appStateText(status_->state);
  document["portalMode"] = setupMode_;
  document["setupApSsid"] = setupMode_ ? wifi_->setupSsid() : "";
  document["wifiConnected"] = wifi_->isConnected();
  document["wifiSsid"] = wifi_->currentSsid();
  document["ip"] = wifi_->currentIp();
  document["ipMode"] = wifi_->currentIpMode();
  document["lockedIp"] = wifi_->lockedIp();
  document["rememberFirstIp"] = ProductConfig::WIFI_REMEMBER_FIRST_IP;
  document["rssi"] = wifi_->currentRssi();
  document["rememberedWifiProfiles"] =
      store_->knownWiFiProfileCount(*config_);
  document["pendingWifi"] = config_->hasPendingWifi;
  document["apiUrl"] = config_->apiUrl;
  document["deviceCode"] = config_->deviceCode;
  document["deviceSecretMasked"] = StringUtils::maskSecret(config_->deviceSecret);
  document["adminPinSet"] = config_->adminPin.length() >= 4;
  document["tlsMode"] = backend_->tlsModeText();
  document["tlsCaSource"] = backend_->tlsCaSourceText();
  document["dhtPin"] = config_->dhtPin;
  document["dhtType"] = sensors_->profileName(*config_);
  document["sendIntervalSeconds"] = config_->sendIntervalMs / 1000UL;
  document["fallbackDummy"] = config_->fallbackDummy;
  document["sensorReadingAvailable"] = status_->sensorReadingAvailable;
  if (status_->sensorReadingAvailable) {
    document["temperature"] = status_->lastTemperature;
    document["humidity"] = status_->lastHumidity;
    document["sensorReadingAgeSeconds"] =
        (millis() - status_->lastSensorReadAtMs) / 1000UL;
  } else {
    document["temperature"] = nullptr;
    document["humidity"] = nullptr;
    document["sensorReadingAgeSeconds"] = nullptr;
  }
  document["uptime"] = StringUtils::uptimeText();
  document["lastSendStatus"] = status_->lastSendStatus;
  document["lastSendError"] = status_->lastSendError;
  document["lastHttpStatus"] = status_->lastHttpStatus;
  document["totalSendOk"] = status_->totalSendOk;
  document["totalSendFail"] = status_->totalSendFail;
  document["lastSensorError"] = status_->lastSensorError;
  document["lastSensorFallbackUsed"] = status_->lastSensorFallbackUsed;
  document["statusLedPin"] = ProductConfig::STATUS_LED_PIN;
  document["resetButtonPin"] = ProductConfig::RESET_BUTTON_PIN;
  document["firmwareBuild"] = DOTWATCH_FIRMWARE_BUILD;
  document["otaEnabled"] = config_->otaEnabled;
  document["otaAutoInstall"] = config_->otaAutoInstall;
  document["otaBaseUrl"] = config_->otaBaseUrl.length() > 0
                               ? config_->otaBaseUrl
                               : config_->apiUrl;
  document["otaChannel"] = config_->otaChannel;
  document["otaCheckIntervalMinutes"] = config_->otaCheckIntervalMs / 60000UL;
  document["otaState"] = status_->otaState;
  document["otaMessage"] = status_->otaMessage;
  document["otaUpdateAvailable"] = status_->otaUpdateAvailable;
  document["otaAvailableVersion"] = status_->otaAvailableVersion;
  document["otaAvailableBuild"] = status_->otaAvailableBuild;
  document["otaReleaseNotes"] = status_->otaReleaseNotes;
  document["otaMandatory"] = status_->otaMandatory;
  document["otaProgressPercent"] = status_->otaProgressPercent;
  document["otaDownloadedBytes"] = status_->otaDownloadedBytes;
  document["otaTotalBytes"] = status_->otaTotalBytes;
  document["otaBusy"] = status_->otaBusy;
  document["otaLastCheckAgeSeconds"] = status_->otaLastCheckAtMs > 0
                                           ? (millis() - status_->otaLastCheckAtMs) / 1000UL
                                           : 0;
  document["otaNextCheckInSeconds"] =
      static_cast<long>(status_->otaNextCheckAtMs - millis()) > 0
          ? (status_->otaNextCheckAtMs - millis()) / 1000UL
          : 0;

  String output;
  serializeJsonPretty(document, output);
  server_.send(200, "application/json; charset=utf-8", output);
}

void PortalServer::handleTest() {
  if (!requireAdmin()) return;

  MetricSnapshot snapshot;
  const bool ok = sensors_->read(snapshot, *config_);

  server_.send(
      200,
      "text/html; charset=utf-8",
      renderSensorTestPage(snapshot, ok));
}

void PortalServer::handleReset() {
  if (!requireAdmin()) return;

  store_->clearAll();
  server_.send(
      200,
      "text/html; charset=utf-8",
      renderRestartPage(
          "Factory Reset",
          "Factory reset",
          "ล้างการตั้งค่าทั้งหมดแล้ว",
          "ESP32 จะ Restart และเปิด Setup AP ใหม่"));
  delay(1500);
  ESP.restart();
}

void PortalServer::handleRestart() {
  if (!requireAdmin()) return;

  server_.send(
      200,
      "text/html; charset=utf-8",
      renderRestartPage(
          "Restart",
          "Device restart",
          "กำลัง Restart ESP32",
          "รอประมาณ 15–30 วินาทีแล้วเปิด Local IP หรือ Dashboard อีกครั้ง"));
  delay(1200);
  ESP.restart();
}

void PortalServer::handleCaptive() {
  server_.sendHeader("Location", "http://192.168.4.1/", true);
  server_.send(302, "text/plain", "");
}

void PortalServer::handleNotFound() {
  if (setupMode_) {
    handleCaptive();
    return;
  }
  server_.send(404, "text/plain; charset=utf-8", "Not found");
}

bool PortalServer::isAdminAuthorized() {
  if (setupMode_) return true;
  if (!server_.hasArg("pin")) return false;

  String provided = server_.arg("pin");
  provided.trim();
  return provided == effectiveAdminPin();
}

bool PortalServer::requireAdmin() {
  if (isAdminAuthorized()) return true;
  sendLocalAdminLogin(403, "PIN ไม่ถูกต้อง หรือยังไม่ได้กรอก PIN");
  return false;
}

String PortalServer::defaultAdminPin() const {
  return "admin";
}

String PortalServer::effectiveAdminPin() const {
  if (config_ != nullptr) {
    String pin = config_->adminPin;
    pin.trim();
    if (pin.length() >= 4) return pin;
  }
  return defaultAdminPin();
}

String PortalServer::currentPinValue() {
  if (setupMode_ || !server_.hasArg("pin")) return "";
  return StringUtils::htmlEscape(server_.arg("pin"));
}

String PortalServer::authQuery() {
  if (setupMode_ || !server_.hasArg("pin")) return "";
  return "?pin=" + currentPinValue();
}

void PortalServer::syncViewContext() {
  view_.setRequestContext(setupMode_, currentPinValue());
}

String PortalServer::renderNoticePage(const String &pageTitle,
                                      const String &heading,
                                      const String &message,
                                      const String &backHref,
                                      const String &backLabel) {
  syncViewContext();
  return view_.noticePage(pageTitle, heading, message, backHref, backLabel);
}

String PortalServer::renderRestartPage(const String &pageTitle,
                                       const String &kicker,
                                       const String &heading,
                                       const String &message,
                                       const String &extraNotice) {
  syncViewContext();
  return view_.pageShell(
      pageTitle,
      view_.restartPage(kicker, heading, message, extraNotice));
}

String PortalServer::renderSensorTestPage(const MetricSnapshot &snapshot,
                                          bool readingOk) {
  syncViewContext();
  return view_.sensorTestPage(
      snapshot,
      readingOk,
      "/" + authQuery(),
      "/json" + authQuery());
}

void PortalServer::sendLocalAdminLogin(int statusCode,
                                       const String &message) {
  view_.setRequestContext(false, "");
  const bool showDefaultPinHint = config_ == nullptr ||
                                  config_->adminPin.length() == 0;
  server_.send(
      statusCode,
      "text/html; charset=utf-8",
      view_.loginPage(message, showDefaultPinHint));
}
