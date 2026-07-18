#include "portal/PortalServer.h"

#include <ArduinoJson.h>
#include <ESP8266WiFi.h>

#include "FirmwareVersion.h"
#include "ProductConfig.h"
#include "portal/PortalAssets.h"
#include "backend/BackendClient.h"
#include "config/ConfigStore.h"
#include "network/WiFiManager.h"
#include "sensors/SensorManager.h"
#include "utils/StringUtils.h"

PortalServer::PortalServer() : server_(80) {}

void PortalServer::begin(DeviceConfig &config,
                         RuntimeStatus &status,
                         ConfigStore &store,
                         WiFiManager &wifi,
                         SensorManager &sensors,
                         BackendClient &backend) {
  config_ = &config;
  status_ = &status;
  store_ = &store;
  wifi_ = &wifi;
  sensors_ = &sensors;
  backend_ = &backend;
  view_.begin(config, status, store, wifi, sensors, backend);
}

void PortalServer::startSetupPortal(bool autoCloseWhenReady) {
  if (wifi_ == nullptr || status_ == nullptr) return;

  setupMode_ = true;
  setupAutoCloseWhenReady_ = autoCloseWhenReady;
  setupStartedAt_ = millis();
  status_->portalMode = true;
  clearAdminSession();
  if (!wifi_->startSetupAccessPoint()) {
    setupMode_ = false;
    setupAutoCloseWhenReady_ = false;
    setupStartedAt_ = 0;
    status_->portalMode = false;
    Serial.println("PortalServer: setup portal start failed");
    return;
  }
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

void PortalServer::stopSetupPortal() {
  if (!setupMode_) return;

  dnsServer_.stop();
  if (wifi_ != nullptr) wifi_->stopSetupAccessPoint();
  setupMode_ = false;
  setupAutoCloseWhenReady_ = false;
  setupStartedAt_ = 0;
  if (status_ != nullptr) status_->portalMode = false;
  clearAdminSession();

  Serial.println("PortalServer: setup portal closed");
}

void PortalServer::startLocalAdmin() {
  if (status_ == nullptr) return;

  if (setupMode_) stopSetupPortal();
  setupMode_ = false;
  setupAutoCloseWhenReady_ = false;
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
  if (setupMode_) {
    dnsServer_.processNextRequest();
    if (setupStartedAt_ > 0 &&
        millis() - setupStartedAt_ >= ProductConfig::SETUP_PORTAL_TIMEOUT_MS) {
      Serial.println("PortalServer: setup portal timed out");
      stopSetupPortal();
    }
  }
  if (serverStarted_) server_.handleClient();
}

bool PortalServer::isSetupMode() const {
  return setupMode_;
}

bool PortalServer::shouldAutoCloseWhenReady() const {
  return setupMode_ && setupAutoCloseWhenReady_;
}

void PortalServer::registerRoutes() {
  if (routesRegistered_) return;

  server_.collectHeaders("Cookie");

  server_.on("/", HTTP_GET, [this]() { handleRoot(); });
  server_.on("/login", HTTP_POST, [this]() { handleLogin(); });
  server_.on("/logout", HTTP_POST, [this]() { handleLogout(); });
  server_.on("/portal.css", HTTP_GET, [this]() { handlePortalCss(); });
  server_.on("/portal.js", HTTP_GET, [this]() { handlePortalJs(); });
  server_.on("/wifi-scan", HTTP_GET, [this]() { handleWiFiScan(); });
  server_.on("/wifi-save", HTTP_POST, [this]() { handleWiFiSave(); });
  server_.on("/wifi-clear", HTTP_POST, [this]() { handleWiFiClear(); });
  server_.on("/device-save", HTTP_POST, [this]() { handleDeviceSave(); });
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
  if (!isAdminAuthorized()) {
    sendLocalAdminLogin();
    return;
  }

  syncViewContext();
  server_.send(
      200,
      "text/html; charset=utf-8",
      view_.dashboardPage());
}


void PortalServer::handleLogin() {
  if (isLoginBlocked()) {
    sendLocalAdminLogin(
        429,
        "เข้าสู่ระบบผิดหลายครั้ง กรุณารอ 5 นาทีแล้วลองใหม่");
    return;
  }

  String provided = server_.hasArg("pin") ? server_.arg("pin") : "";
  provided.trim();
  if (!constantTimeEquals(provided, effectiveAdminPin())) {
    recordFailedLogin();
    sendLocalAdminLogin(401, "Local Admin PIN ไม่ถูกต้อง");
    return;
  }

  resetFailedLoginState();
  issueAdminSession();
  server_.sendHeader("Location", "/", true);
  server_.send(303, "text/plain; charset=utf-8", "Signed in");
}

void PortalServer::handleLogout() {
  clearAdminSession();
  server_.sendHeader(
      "Set-Cookie",
      String(ProductConfig::ADMIN_SESSION_COOKIE) +
          "=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
  server_.sendHeader("Location", "/", true);
  server_.send(303, "text/plain; charset=utf-8", "Signed out");
}

void PortalServer::handlePortalCss() {
  server_.sendHeader("Cache-Control", "public, max-age=86400");
  server_.send_P(200, "text/css; charset=utf-8", DOTWATCH_PORTAL_CSS);
}

void PortalServer::handlePortalJs() {
  server_.sendHeader("Cache-Control", "public, max-age=86400");
  server_.send_P(200, "application/javascript; charset=utf-8", DOTWATCH_PORTAL_JS);
}

void PortalServer::handleWiFiScan() {
  if (!isAdminAuthorized()) {
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
            "ไม่สามารถบันทึก Pending Wi-Fi ลง LittleFS ได้ กรุณาลองใหม่"));
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
          "ESP8266 จะ Restart ภายใน 2 วินาที",
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

void PortalServer::handleDeviceSave() {
  if (!requireAdmin()) return;

  DeviceConfig next = *config_;
  const String previousAdminPin = config_->adminPin;

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

  if (!ProductConfig::isValidDhtPin(next.dhtPin)) {
    next.dhtPin = ProductConfig::DEFAULT_DHT_PIN;
  }

  if (next.adminPin.length() > 0 && next.adminPin.length() < ProductConfig::ADMIN_PIN_MIN_LENGTH) {
    server_.send(
        400,
        "text/html; charset=utf-8",
        renderNoticePage(
            "Invalid PIN",
            "Local Admin PIN ไม่ถูกต้อง",
            "PIN ต้องมีอย่างน้อย 8 ตัวอักษร"));
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
            "ไม่สามารถเขียนข้อมูลลง LittleFS ได้"));
    return;
  }

  *config_ = next;
  if (previousAdminPin != config_->adminPin) clearAdminSession();
  sensors_->reconfigure(*config_);

  server_.send(
      200,
      "text/html; charset=utf-8",
      renderRestartPage(
          "บันทึก Device",
          "Device settings saved",
          "บันทึกการตั้งค่าแล้ว",
          "ESP8266 จะ Restart เพื่อใช้ Backend, Device และ Sensor ใหม่"));
  delay(1500);
  ESP.restart();
}

void PortalServer::handleJson() {
  if (!isAdminAuthorized()) {
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
  document["rssi"] = wifi_->currentRssi();
  document["rememberedWifiProfiles"] =
      store_->knownWiFiProfileCount(*config_);
  document["pendingWifi"] = config_->hasPendingWifi;
  document["apiUrl"] = config_->apiUrl;
  document["deviceCode"] = config_->deviceCode;
  document["deviceSecretMasked"] = StringUtils::maskSecret(config_->deviceSecret);
  document["adminPinSet"] =
      config_->adminPin.length() > 0;
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
          "ESP8266 จะ Restart และเปิด Setup AP ใหม่"));
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
          "กำลัง Restart ESP8266",
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
  if (adminSessionToken_.length() == 0 || adminSessionExpiresAt_ == 0) {
    return false;
  }

  if (static_cast<long>(adminSessionExpiresAt_ - millis()) <= 0) {
    clearAdminSession();
    return false;
  }

  const String provided = sessionCookieValue();
  if (!constantTimeEquals(provided, adminSessionToken_)) return false;

  // Sliding expiration keeps an actively used local session alive while still
  // limiting the lifetime of a copied cookie.
  adminSessionExpiresAt_ = millis() + ProductConfig::ADMIN_SESSION_TTL_MS;
  return true;
}

bool PortalServer::requireAdmin() {
  if (isAdminAuthorized()) return true;
  sendLocalAdminLogin(401, "กรุณาเข้าสู่ระบบ Local Admin ก่อนดำเนินการ");
  return false;
}

String PortalServer::effectiveAdminPin() const {
  if (config_ == nullptr) return "";

  String pin = config_->adminPin;
  pin.trim();
  return pin;
}

String PortalServer::generateSessionToken() const {
  static constexpr char HEX_CHARS[] = "0123456789abcdef";

  String token;
  token.reserve(40);

  for (uint8_t index = 0; index < 40; index++) {
    const uint8_t randomIndex =
        static_cast<uint8_t>(random(0, 16));

    token += HEX_CHARS[randomIndex];
  }

  return token;
}

String PortalServer::sessionCookieValue() {
  String cookie = server_.header("Cookie");
  if (cookie.length() == 0) return "";

  const String prefix = String(ProductConfig::ADMIN_SESSION_COOKIE) + "=";
  int start = cookie.indexOf(prefix);
  if (start < 0) return "";
  start += prefix.length();

  int end = cookie.indexOf(';', start);
  if (end < 0) end = cookie.length();

  String value = cookie.substring(start, end);
  value.trim();
  return value;
}

void PortalServer::issueAdminSession() {
  adminSessionToken_ = generateSessionToken();
  adminSessionExpiresAt_ = millis() + ProductConfig::ADMIN_SESSION_TTL_MS;

  server_.sendHeader(
      "Set-Cookie",
      String(ProductConfig::ADMIN_SESSION_COOKIE) + "=" +
          adminSessionToken_ +
          "; Path=/; HttpOnly; SameSite=Strict; Max-Age=" +
          String(ProductConfig::ADMIN_SESSION_TTL_MS / 1000UL));
}

void PortalServer::clearAdminSession() {
  adminSessionToken_ = "";
  adminSessionExpiresAt_ = 0;
}

bool PortalServer::isLoginBlocked() const {
  return loginBlockedUntil_ > 0 &&
         static_cast<long>(loginBlockedUntil_ - millis()) > 0;
}

void PortalServer::recordFailedLogin() {
  const unsigned long now = millis();
  if (failedLoginWindowStartedAt_ == 0 ||
      now - failedLoginWindowStartedAt_ >
          ProductConfig::ADMIN_LOGIN_WINDOW_MS) {
    failedLoginWindowStartedAt_ = now;
    failedLoginCount_ = 0;
  }

  failedLoginCount_++;
  if (failedLoginCount_ >= ProductConfig::ADMIN_LOGIN_MAX_ATTEMPTS) {
    loginBlockedUntil_ = now + ProductConfig::ADMIN_LOGIN_BLOCK_MS;
    failedLoginWindowStartedAt_ = 0;
    failedLoginCount_ = 0;
  }
}

void PortalServer::resetFailedLoginState() {
  failedLoginWindowStartedAt_ = 0;
  loginBlockedUntil_ = 0;
  failedLoginCount_ = 0;
}

bool PortalServer::constantTimeEquals(const String &left,
                                      const String &right) const {
  const size_t maxLength = left.length() > right.length()
                               ? left.length()
                               : right.length();
  uint8_t difference = static_cast<uint8_t>(left.length() ^ right.length());
  for (size_t index = 0; index < maxLength; index++) {
    const uint8_t leftValue = index < left.length() ? left[index] : 0;
    const uint8_t rightValue = index < right.length() ? right[index] : 0;
    difference |= leftValue ^ rightValue;
  }
  return difference == 0;
}

String PortalServer::currentPinValue() {
  return "";
}

String PortalServer::authQuery() {
  return "";
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
  const bool showDefaultPinHint =
      config_ != nullptr && config_->adminPin == config_->setupApPassword;
  server_.send(
      statusCode,
      "text/html; charset=utf-8",
      view_.loginPage(message, showDefaultPinHint));
}
