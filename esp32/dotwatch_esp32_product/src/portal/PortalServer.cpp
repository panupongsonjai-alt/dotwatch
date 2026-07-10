#include "portal/PortalServer.h"

#include <ArduinoJson.h>
#include <WiFi.h>

#include "FirmwareVersion.h"
#include "ProductConfig.h"
#include "backend/BackendClient.h"
#include "config/ConfigStore.h"
#include "network/WiFiManager.h"
#include "portal/PortalAssets.h"
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
  if (!setupMode_ && !isAdminAuthorized()) {
    sendLocalAdminLogin();
    return;
  }

  String body;
  body.reserve(30000);

  body += "<section id='overview' class='dashboard-page is-active' data-page-title='ESP32 Overview'>";
  body += "<div class='card overview-hero'>";
  body += "<div class='hero'><div><div class='kicker'>Device Overview</div>";
  body += "<h1>ESP32 พร้อมสำหรับ dotWatch</h1>";
  body += "<p class='muted'>ดูสถานะ Wi-Fi, Backend, Sensor และความพร้อมของอุปกรณ์จากหน้าเดียว</p></div>";
  body += "<span id='appStateBadge' class='badge " + statusBadgeClass() + "'>";
  body += StringUtils::appStateText(status_->state);
  body += "</span></div>";
  body += statusCardsHtml();
  body += "</div>";

  body += "<div class='overview-grid'>";
  body += "<div class='card'><div class='card-head'><div><div class='kicker'>Quick Access</div><h2>การตั้งค่าที่ใช้บ่อย</h2><p class='muted'>เปิดเฉพาะส่วนที่ต้องการโดยไม่ต้องเลื่อนหาหน้ายาว</p></div></div>";
  body += "<div class='quick-actions'>";
  body += "<button class='quick-action' type='button' data-page-target='wifi'><b>เปลี่ยน Wi-Fi</b><span>สแกน เลือก และทดสอบเครือข่ายใหม่</span></button>";
  body += "<button class='quick-action' type='button' data-page-target='device'><b>Device Settings</b><span>ตรวจ Backend URL, Device Code และ Secret</span></button>";
  body += "<button class='quick-action' type='button' data-page-target='sensor'><b>ดูค่า Sensor</b><span>Temperature, Humidity และ Send Interval</span></button>";
  body += "<button class='quick-action' type='button' data-page-target='system'><b>System Operations</b><span>ดู JSON หรือ Restart อุปกรณ์</span></button>";
  body += "</div></div>";

  const bool backendOk = status_->lastHttpStatus >= 200 && status_->lastHttpStatus < 300;
  body += "<div class='card'><div class='card-head'><div><div class='kicker'>Health Check</div><h2>สถานะระบบหลัก</h2><p class='muted'>รายละเอียดอ้างอิงจากสถานะเดิมของ Firmware</p></div></div><div class='health-list'>";
  body += "<div class='health-row'><i class='health-dot " + String(wifi_->isConnected() ? "ok" : "bad") + "'></i><strong>Wi-Fi Connection</strong><span id='healthWifi'>" + String(wifi_->isConnected() ? "Connected" : "Disconnected") + "</span></div>";
  body += "<div class='health-row'><i class='health-dot " + String(backendOk ? "ok" : "bad") + "'></i><strong>Backend Connection</strong><span id='healthBackend'>" + StringUtils::htmlEscape(lastSendLabel()) + "</span></div>";
  body += "<div class='health-row'><i class='health-dot " + String(status_->sensorReadingAvailable ? "ok" : "warn") + "'></i><strong>Sensor Reading</strong><span id='healthSensor'>" + String(status_->sensorReadingAvailable ? "Available" : "Waiting") + "</span></div>";
  body += "<div class='health-row'><i class='health-dot " + String(backend_->hasEffectiveCa() ? "ok" : "warn") + "'></i><strong>TLS Certificate</strong><span id='healthTls'>" + StringUtils::htmlEscape(backend_->tlsCaSourceText()) + "</span></div>";
  body += "</div></div></div></section>";

  body += wifiSectionHtml();
  body += deviceSectionHtml();
  body += advancedSectionsHtml();
  body += operationsHtml();

  server_.send(
      200,
      "text/html; charset=utf-8",
      pageShell("dotWatch ESP32", body));
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
        pageShell(
            "Wi-Fi Error",
            "<section class='card'><h2>ชื่อ Wi-Fi ไม่ถูกต้อง</h2><div class='notice'>กรุณาเลือกหรือกรอกชื่อ Wi-Fi ความยาวไม่เกิน 32 ตัวอักษร</div><div class='button-row'><a class='btn btn-secondary' href='/" + authQuery() + "#wifi'>กลับไปตั้งค่า Wi-Fi</a></div></section>"));
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
        pageShell(
            "Wi-Fi Error",
            "<section class='card'><h2>รหัสผ่าน Wi-Fi ไม่ถูกต้อง</h2><div class='notice'>รหัสผ่าน WPA/WPA2 ต้องมี 8–63 ตัวอักษร หรือเว้นว่างสำหรับเครือข่าย Open</div><div class='button-row'><a class='btn btn-secondary' href='/" + authQuery() + "#wifi'>กลับไปตั้งค่า Wi-Fi</a></div></section>"));
    return;
  }

  const bool keepBackups = server_.hasArg("keepWifiBackups");
  if (!store_->stageWiFi(*config_, ssid, password, keepBackups)) {
    server_.send(
        500,
        "text/html; charset=utf-8",
        pageShell(
            "Wi-Fi Save Error",
            "<section class='card'><h2>บันทึก Wi-Fi ไม่สำเร็จ</h2><div class='notice'>ไม่สามารถบันทึก Pending Wi-Fi ลง NVS ได้ กรุณาลองใหม่</div></section>"));
    return;
  }

  String notice = "ระบบจะลองเชื่อมต่อ <strong>";
  notice += StringUtils::htmlEscape(ssid);
  notice += "</strong> หลัง Restart หากเชื่อมไม่สำเร็จจะย้อนกลับ Wi-Fi เดิมโดยอัตโนมัติ";

  server_.send(
      200,
      "text/html; charset=utf-8",
      pageShell(
          "กำลังเปลี่ยน Wi-Fi",
          restartPage(
              "Wi-Fi staged safely",
              "กำลังทดสอบ Wi-Fi ใหม่",
              "ESP32 จะ Restart ภายใน 2 วินาที",
              notice)));
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
      pageShell(
          "ล้าง Wi-Fi",
          restartPage(
              "Wi-Fi reset",
              "ล้างเฉพาะ Wi-Fi แล้ว",
              "Backend, Device Code, Device Secret และ Sensor ยังอยู่ครบ",
              notice)));
  delay(1500);
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
        pageShell(
            "Invalid PIN",
            "<section class='card'><h2>Local Admin PIN ไม่ถูกต้อง</h2><div class='notice'>PIN ต้องมีอย่างน้อย 4 ตัวอักษร</div></section>"));
    return;
  }

  if (next.tlsCaCert.length() > 0 &&
      next.tlsCaCert.indexOf("BEGIN CERTIFICATE") < 0) {
    server_.send(
        400,
        "text/html; charset=utf-8",
        pageShell(
            "Invalid Root CA",
            "<section class='card'><h2>Root CA ไม่ถูกต้อง</h2><div class='notice'>ต้องเป็น PEM ที่มี BEGIN CERTIFICATE หรือพิมพ์ CLEAR เพื่อลบ Portal CA</div></section>"));
    return;
  }

  if (!store_->save(next)) {
    server_.send(
        500,
        "text/html; charset=utf-8",
        pageShell(
            "Save Error",
            "<section class='card'><h2>บันทึก Device ไม่สำเร็จ</h2><div class='notice'>ไม่สามารถเขียนข้อมูลลง NVS ได้</div></section>"));
    return;
  }

  *config_ = next;
  sensors_->reconfigure(*config_);

  server_.send(
      200,
      "text/html; charset=utf-8",
      pageShell(
          "บันทึก Device",
          restartPage(
              "Device settings saved",
              "บันทึกการตั้งค่าแล้ว",
              "ESP32 จะ Restart เพื่อใช้ Backend, Device และ Sensor ใหม่")));
  delay(1500);
  ESP.restart();
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

  String output;
  serializeJsonPretty(document, output);
  server_.send(200, "application/json; charset=utf-8", output);
}

void PortalServer::handleTest() {
  if (!requireAdmin()) return;

  MetricSnapshot snapshot;
  const bool ok = sensors_->read(snapshot, *config_);

  String body;
  body += "<section class='card'><div class='kicker'>Live sensor</div><h2>ทดสอบอ่านค่า</h2><p class='muted'>ค่าที่แสดงใช้ mapping เดียวกับ payload ที่ส่งเข้า dotWatch.</p>";
  if (ok) {
    body += "<div class='status-grid'>";
    body += "<div class='stat'><small>metric_1</small><strong>" + String(snapshot.temperature, 2) + " °C</strong></div>";
    body += "<div class='stat'><small>metric_2</small><strong>" + String(snapshot.humidity, 2) + " %</strong></div>";
    body += "<div class='stat'><small>metric_3</small><strong>" + String(snapshot.rssi) + " dBm</strong></div>";
    body += "<div class='stat'><small>Source</small><strong>" + String(snapshot.fallbackUsed ? "Dummy fallback" : "DHT sensor") + "</strong></div>";
    body += "</div>";
  } else {
    body += "<div class='notice'>อ่าน DHT ไม่สำเร็จ และปิด Dummy fallback อยู่</div>";
  }
  body += "<div class='button-row'><a class='btn btn-secondary' href='/" + authQuery() + "'>กลับหน้าหลัก</a><a class='btn btn-secondary' href='/json" + authQuery() + "'>Status JSON</a></div></section>";

  server_.send(
      200,
      "text/html; charset=utf-8",
      pageShell("Sensor Test", body));
}

void PortalServer::handleReset() {
  if (!requireAdmin()) return;

  store_->clearAll();
  server_.send(
      200,
      "text/html; charset=utf-8",
      pageShell(
          "Factory Reset",
          restartPage(
              "Factory reset",
              "ล้างการตั้งค่าทั้งหมดแล้ว",
              "ESP32 จะ Restart และเปิด Setup AP ใหม่")));
  delay(1500);
  ESP.restart();
}

void PortalServer::handleRestart() {
  if (!requireAdmin()) return;

  server_.send(
      200,
      "text/html; charset=utf-8",
      pageShell(
          "Restart",
          restartPage(
              "Device restart",
              "กำลัง Restart ESP32",
              "รอประมาณ 15–30 วินาทีแล้วเปิด Local IP หรือ Dashboard อีกครั้ง")));
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
  String code = config_ != nullptr ? config_->deviceCode : "";
  code.replace("-", "");
  code.replace("_", "");
  code.trim();
  if (code.length() >= 6) return code.substring(code.length() - 6);
  return "123456";
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

String PortalServer::pinHiddenInput() {
  if (setupMode_) return "";
  return "<input type='hidden' name='pin' value='" + currentPinValue() + "'>";
}

String PortalServer::authQuery() {
  if (setupMode_ || !server_.hasArg("pin")) return "";
  return "?pin=" + currentPinValue();
}

void PortalServer::sendLocalAdminLogin(int statusCode,
                                       const String &message) {
  String body;
  body += "<section class='card login-card'><div class='login-logo'>⚙</div><div class='kicker'>Protected setup</div><h1>เข้าสู่ ESP32 Device Console</h1>";
  body += "<p class='muted'>กรอก Local Admin PIN เพื่อเปิด Dashboard, เปลี่ยน Wi-Fi และตรวจสถานะอุปกรณ์</p>";

  if (config_->adminPin.length() == 0) {
    body += "<div class='notice info' style='margin-top:12px'>ค่าเริ่มต้นคือ 6 ตัวท้ายของ Device Code จนกว่าจะตั้ง Custom PIN</div>";
  }
  if (message.length() > 0) {
    body += "<div class='notice' style='margin-top:10px'>" + StringUtils::htmlEscape(message) + "</div>";
  }

  body += "<form method='GET' action='/' style='margin-top:16px'><div class='field'><label>Local Admin PIN</label><input type='password' name='pin' inputmode='numeric' autocomplete='current-password' placeholder='เช่น 123456'></div><div class='button-row'><button class='btn-primary' type='submit'>เปิด ESP32 Dashboard</button><a class='btn btn-secondary' href='/json'>ดู Public Status</a></div></form></section>";

  server_.send(
      statusCode,
      "text/html; charset=utf-8",
      pageShell("ESP32 Local Admin", body));
}

String PortalServer::pageShell(const String &title,
                               const String &body) {
  String html;
  html.reserve(body.length() + 22000);
  html += "<!doctype html><html lang='th'><head><meta charset='utf-8'>";
  html += "<meta name='viewport' content='width=device-width,initial-scale=1,viewport-fit=cover'>";
  html += "<meta name='theme-color' content='#020617'>";
  html += "<title>" + StringUtils::htmlEscape(title) + "</title><style>";
  html += DOTWATCH_PORTAL_CSS;
  html += "</style></head><body>";

  if (title == "ESP32 Local Admin") {
    html += "<div class='login-shell'><aside class='login-brand-panel'><div class='login-brand'><div class='brand-mark'>dW</div><div><h1>dotWatch</h1><p>ESP32 Product Console</p></div></div><div class='login-brand-copy'><div class='kicker'>Local Device Management</div><h2>จัดการ ESP32 ในรูปแบบเดียวกับ Dashboard</h2><p>ใช้รายละเอียดและระบบเดิมของ Firmware แต่จัดโครงสร้างใหม่ให้อ่านง่าย แยกเมนูชัดเจน และเหมาะกับการใช้งานจริง</p></div><div class='help'>";
    html += DOTWATCH_MODEL_NAME;
    html += " · ";
    html += DOTWATCH_FIRMWARE_VERSION;
    html += "</div></aside><main class='login-main'>";
    html += body;
    html += "</main></div></body></html>";
    return html;
  }

  html += "<div class='portal-layout'><aside class='portal-sidebar'>";
  html += "<div class='portal-brand'><div class='brand-mark'>dW</div><div class='brand-copy'><strong>dotWatch</strong><span>";
  html += DOTWATCH_FIRMWARE_VERSION;
  html += "</span></div></div>";
  html += "<div class='portal-nav-label'>Device Console</div><nav class='portal-nav'>";
  html += "<a class='portal-nav-item is-active' href='#overview' data-page-target='overview' data-page-title='ESP32 Overview' data-page-subtitle='ภาพรวมสถานะอุปกรณ์และการเชื่อมต่อ'><span class='nav-icon'>▦</span><span>Overview</span></a>";
  html += "<a class='portal-nav-item' href='#wifi' data-page-target='wifi' data-page-title='Wi-Fi Setup' data-page-subtitle='เปลี่ยนเครือข่ายด้วยระบบทดสอบและ Rollback'><span class='nav-icon'>⌁</span><span>Wi-Fi</span></a>";
  html += "<a class='portal-nav-item' href='#device' data-page-target='device' data-page-title='Device Connection' data-page-subtitle='เชื่อม Device Code และ Backend ของ dotWatch'><span class='nav-icon'>◇</span><span>Device</span></a>";
  html += "<a class='portal-nav-item' href='#sensor' data-page-target='sensor' data-page-title='Sensor Monitor' data-page-subtitle='ดูค่าปัจจุบันและกำหนดรอบส่งข้อมูล'><span class='nav-icon'>∿</span><span>Sensor</span></a>";
  html += "<a class='portal-nav-item' href='#security' data-page-target='security' data-page-title='Security' data-page-subtitle='จัดการ Local Admin PIN และ Root CA'><span class='nav-icon'>◆</span><span>Security</span></a>";
  html += "<a class='portal-nav-item' href='#system' data-page-target='system' data-page-title='System Operations' data-page-subtitle='ดู JSON, Restart และ Factory Reset'><span class='nav-icon'>⚙</span><span>System</span></a>";
  html += "</nav><div class='portal-sidebar-status'><div class='sidebar-status-head'><small>Device Status</small><i id='sidebarStateDot' class='sidebar-status-dot " + statusBadgeClass() + "'></i></div><strong id='sidebarDeviceCode'>";
  html += StringUtils::htmlEscape(config_->deviceCode.length() ? config_->deviceCode : String("ยังไม่ได้ตั้ง Device"));
  html += "</strong><span id='sidebarDeviceIp'>" + StringUtils::htmlEscape(wifi_->currentIp()) + "</span></div></aside>";
  html += "<button id='portalOverlay' class='portal-overlay' type='button' aria-label='ปิดเมนู'></button>";

  html += "<div class='portal-workspace'><header class='portal-header'><div class='portal-header-main'><button id='portalMenuButton' class='portal-menu-button' type='button' aria-label='เปิดเมนู'>☰</button><div class='portal-header-copy'><small>ESP32 Product Console</small><h1 id='portalPageTitle'>ESP32 Overview</h1><p id='portalPageSubtitle'>ภาพรวมสถานะอุปกรณ์และการเชื่อมต่อ</p></div></div><div class='portal-header-actions'>";
  html += "<span id='headerStateBadge' class='badge " + statusBadgeClass() + "'>" + StringUtils::appStateText(status_->state) + "</span>";
  html += "<a class='btn btn-secondary' href='/" + authQuery() + "#overview'><span class='header-label'>Refresh</span> ↻</a>";
  html += "<a class='btn btn-secondary' href='/json" + authQuery() + "'><span class='header-label'>JSON</span> { }</a>";
  html += "</div></header><main class='portal-content'>";
  html += body;
  html += "</main><footer class='portal-footer'>";
  html += DOTWATCH_MODEL_NAME;
  html += " · Modular Product Core · Hold BOOT 6 seconds for Factory Reset</footer></div></div><script>";
  html += DOTWATCH_PORTAL_JS;
  html += "</script></body></html>";
  return html;
}

String PortalServer::statusBadgeClass() const {
  if (status_->state == AppState::ONLINE) return "ok";
  if (status_->state == AppState::DEGRADED ||
      status_->state == AppState::RECOVERY) {
    return "bad";
  }
  return "warn";
}

String PortalServer::lastSendLabel() const {
  if (status_->lastSendStatus == "ok") return "ส่งสำเร็จ";
  if (status_->lastSendStatus == "error") return "ส่งไม่สำเร็จ";
  return "ยังไม่เคยส่ง";
}

String PortalServer::readinessLabel() const {
  int ready = 0;
  if (wifi_->isConnected()) ready++;
  if (config_->apiUrl.length() > 0) ready++;
  if (config_->deviceCode.length() > 0 &&
      config_->deviceSecret.length() > 0) {
    ready++;
  }
  if (backend_->hasEffectiveCa()) ready++;
  if (status_->lastSendStatus == "ok") ready++;
  return String(ready) + "/5 พร้อมใช้งาน";
}

String PortalServer::statusCardsHtml() const {
  const int rssi = wifi_->currentRssi();
  String html;
  html += "<div class='status-grid'>";
  html += "<div class='stat'><small>Readiness</small><strong id='statusReadiness'>" + readinessLabel() + "</strong></div>";
  html += "<div class='stat'><small>Wi-Fi</small><strong id='statusWifi'>" + StringUtils::htmlEscape(wifi_->currentSsid().length() ? wifi_->currentSsid() : String("ยังไม่เชื่อมต่อ")) + "</strong></div>";
  html += "<div class='stat'><small>IP Address</small><strong id='statusIp'>" + StringUtils::htmlEscape(wifi_->currentIp()) + "</strong></div>";
  html += "<div class='stat'><small>Signal</small><strong id='statusSignal'>" + String(wifi_->isConnected() ? StringUtils::signalQualityText(rssi) + " · " + String(rssi) + " dBm" : String("Setup Mode")) + "</strong></div>";
  html += "<div class='stat'><small>Device Code</small><strong id='statusDeviceCode'>" + StringUtils::htmlEscape(config_->deviceCode.length() ? config_->deviceCode : String("ยังไม่ได้ตั้ง")) + "</strong></div>";
  html += "<div class='stat'><small>Backend</small><strong id='statusBackend'>" + StringUtils::htmlEscape(lastSendLabel()) + "</strong></div>";
  html += "<div class='stat'><small>Last Send</small><strong id='statusLastSend'>HTTP " + String(status_->lastHttpStatus) + "</strong></div>";
  html += "<div class='stat'><small>Uptime</small><strong id='statusUptime'>" + StringUtils::uptimeText() + "</strong></div>";
  html += "</div>";

  if (status_->lastSendError.length() > 0) {
    html += "<div class='notice' style='margin-top:12px'><strong>ปัญหาล่าสุด:</strong> " + StringUtils::htmlEscape(status_->lastSendError) + "</div>";
  }
  return html;
}

String PortalServer::wifiSectionHtml() {
  String html;
  html.reserve(7200);

  html += "<section id='wifi' class='dashboard-page' data-page-title='Wi-Fi Setup'><div class='card'><div class='section-head'><div><div class='kicker'>Network Setup</div><h2>เปลี่ยน Wi-Fi อย่างปลอดภัย</h2><p class='muted'>ระบบเก็บค่าใหม่ไว้ทดสอบก่อนบันทึกจริง หากเชื่อมไม่สำเร็จจะย้อนกลับ Wi-Fi เดิม</p></div><span id='wifiBadge' class='badge ";
  html += wifi_->isConnected() ? "ok'>Connected" : "warn'>Setup";
  html += "</span></div>";

  html += "<div class='current-wifi'>";
  html += "<div><small>Wi-Fi ปัจจุบัน</small><strong id='currentWifi'>" + StringUtils::htmlEscape(wifi_->currentSsid().length() ? wifi_->currentSsid() : String("ยังไม่ได้ตั้ง")) + "</strong></div>";
  html += "<div><small>IP Address</small><strong id='currentIp'>" + StringUtils::htmlEscape(wifi_->currentIp()) + "</strong></div>";
  html += "<div><small>Remembered</small><strong id='rememberedWifi'>" + String(store_->knownWiFiProfileCount(*config_)) + " networks</strong></div>";
  html += "</div>";

  html += "<div class='steps'>";
  html += "<div class='step'><b>1</b><div><strong>สแกนและเลือก</strong><span>เลือกชื่อ Wi-Fi จากรายการ</span></div></div>";
  html += "<div class='step'><b>2</b><div><strong>ใส่รหัสผ่าน</strong><span>เว้นว่างสำหรับ Open Wi-Fi</span></div></div>";
  html += "<div class='step'><b>3</b><div><strong>Restart และ Rollback</strong><span>Wi-Fi เดิมไม่หายเมื่อรหัสผิด</span></div></div>";
  html += "</div>";

  if (setupMode_) {
    html += "<div class='notice info' style='margin-bottom:12px'>Setup AP: <strong>" + StringUtils::htmlEscape(wifi_->setupSsid()) + "</strong> · Password: <strong>" + StringUtils::htmlEscape(wifi_->setupPassword()) + "</strong> · URL: http://192.168.4.1/</div>";
  }

  html += "<div class='wifi-layout'><div class='panel'>";
  html += "<form method='POST' action='/wifi-save' onsubmit='return confirmWifiChange()'>" + pinHiddenInput();
  html += "<div class='form-grid'>";
  html += "<div class='field full'><label>ชื่อ Wi-Fi (SSID)</label><input id='wifiSsid' name='wifiSsid' maxlength='32' autocomplete='off' value='" + StringUtils::htmlEscape(config_->wifiSsid) + "' placeholder='เลือกจากรายการ หรือพิมพ์เอง'></div>";
  html += "<div class='field full'><label>รหัสผ่าน Wi-Fi</label><div class='password-row'><input id='wifiPassword' type='password' name='wifiPassword' maxlength='63' autocomplete='new-password' placeholder='เว้นว่างไว้เมื่อใช้ Wi-Fi เดิม'><button id='passwordToggle' class='btn-secondary' type='button' onclick='togglePassword()'>แสดง</button></div><div id='selectedWifi' class='help'>เลือก Wi-Fi จากรายการเพื่อกรอกชื่ออัตโนมัติ</div></div>";
  html += "</div><label class='check'><input type='checkbox' name='keepWifiBackups' value='true' checked><span>เก็บ Wi-Fi เดิมเป็นเครือข่ายสำรอง</span></label>";
  html += "<button class='btn-primary' type='submit' style='width:100%'>บันทึกและทดสอบหลัง Restart</button></form>";
  html += "<form method='POST' action='/wifi-clear' onsubmit='return confirm(\"ล้าง Wi-Fi ที่จำไว้ทั้งหมดหรือไม่?\")' style='margin-top:9px'>" + pinHiddenInput() + "<button class='btn-danger' type='submit' style='width:100%'>ล้างเฉพาะ Wi-Fi</button></form>";
  html += "</div>";

  html += "<div class='panel'><div class='scan-head'><div><h3>Wi-Fi ใกล้เคียง</h3><div class='help'>รายชื่อที่ ESP32 มองเห็นจริง</div></div><button id='scanButton' class='btn-secondary' type='button' onclick='scanWifi()'>สแกนใหม่</button></div><div id='scanStatus' class='scan-status'>กำลังเตรียมสแกน...</div><div id='networkList' class='network-list'><div class='empty'>กำลังโหลดรายชื่อ Wi-Fi</div></div></div></div>";
  html += "</div></section>";
  return html;
}

String PortalServer::deviceSectionHtml() {
  String html;
  html += "<section id='device' class='dashboard-page' data-page-title='Device Connection'><div class='card'><div class='section-head'><div><div class='kicker'>Device Settings</div><h2>เชื่อม dotWatch Backend</h2><p class='muted'>แก้เฉพาะเมื่อเปลี่ยน Backend หรือผูก ESP32 กับ Device ใหม่</p></div><span id='deviceBadge' class='badge ";
  html += store_->hasDeviceCredentials(*config_) ? "ok'>Configured" : "warn'>Required";
  html += "</span></div>";
  html += "<form method='POST' action='/device-save'>" + pinHiddenInput();
  html += "<div class='form-grid'>";
  html += "<div class='field full'><label>Backend API URL</label><input id='apiUrl' name='apiUrl' value='" + StringUtils::htmlEscape(config_->apiUrl) + "' placeholder='https://dotwatch-backend.onrender.com'></div>";
  html += "<div class='field'><label>Device Code</label><input id='deviceCode' name='deviceCode' value='" + StringUtils::htmlEscape(config_->deviceCode) + "' placeholder='DW-ESP32-...'></div>";
  html += "<div class='field'><label>Device Secret</label><input type='password' name='deviceSecret' value='' placeholder='เว้นว่างเพื่อใช้ Secret เดิม'></div>";
  html += "</div><div id='deviceSecretMasked' class='help' style='margin-top:8px'>Secret ปัจจุบัน: " + StringUtils::htmlEscape(StringUtils::maskSecret(config_->deviceSecret)) + "</div>";
  html += "<div class='button-row'><button class='btn-primary' type='submit'>บันทึก Device Settings</button></div>";
  html += "</form></div></section>";
  return html;
}

String PortalServer::advancedSectionsHtml() {
  String html;

  const String temperatureText = status_->sensorReadingAvailable
                                     ? String(status_->lastTemperature, 1)
                                     : String("--");
  const String humidityText = status_->sensorReadingAvailable
                                  ? String(status_->lastHumidity, 1)
                                  : String("--");

  html += "<section id='sensor' class='dashboard-page' data-page-title='Sensor Monitor'><div class='card'><div class='section-head'><div><div class='kicker'>Live Sensor</div><h2>Temperature และ Humidity</h2><p class='muted'>แสดงค่าล่าสุดจาก Sensor และตั้งรอบส่งข้อมูลเข้า dotWatch</p></div><span class='badge " + String(status_->sensorReadingAvailable ? "ok'>Live" : "warn'>Waiting") + "</span></div>";
  html += "<form method='POST' action='/device-save'>" + pinHiddenInput();
  html += "<input type='hidden' name='apiUrl' value='" + StringUtils::htmlEscape(config_->apiUrl) + "'><input type='hidden' name='deviceCode' value='" + StringUtils::htmlEscape(config_->deviceCode) + "'>";
  html += "<div class='sensor-live-grid'>";
  html += "<div class='sensor-live-card'><div class='sensor-live-name'>Temperature</div><div class='sensor-live-value'><strong id='sensorTemperature'>" + temperatureText + "</strong><span>°C</span></div></div>";
  html += "<div class='sensor-live-card'><div class='sensor-live-name'>Humidity</div><div class='sensor-live-value'><strong id='sensorHumidity'>" + humidityText + "</strong><span>%</span></div></div>";
  html += "</div>";
  html += "<div id='sensorLiveStatus' class='sensor-live-status'>";
  html += status_->sensorReadingAvailable ? "ค่าล่าสุดจาก Sensor · อัปเดตอัตโนมัติ" : "กำลังรอค่าจาก Sensor";
  html += "</div>";
  html += "<div class='form-grid sensor-settings-grid'><div class='field'><label>Send Interval</label><select id='sendInterval' name='sendIntervalSec'>";
  const int intervals[] = {10, 20, 30, 60, 120};
  for (int index = 0; index < 5; index++) {
    html += "<option value='" + String(intervals[index]) + "'";
    if (config_->sendIntervalMs / 1000UL == static_cast<unsigned long>(intervals[index])) html += " selected";
    html += ">" + String(intervals[index]) + " sec</option>";
  }
  html += "</select></div></div><div class='button-row'><button class='btn-primary' type='submit'>บันทึกรอบส่งข้อมูล</button></div></form></div></section>";

  html += "<section id='security' class='dashboard-page' data-page-title='Security'><div class='card'><div class='section-head'><div><div class='kicker'>Local Security</div><h2>Admin PIN และ Root CA</h2><p class='muted'>รายละเอียดเดิมถูกจัดใหม่ให้แยกจากการตั้งค่าทั่วไปและอ่านง่ายขึ้น</p></div></div>";
  html += "<form method='POST' action='/device-save'>" + pinHiddenInput();
  html += "<input type='hidden' name='apiUrl' value='" + StringUtils::htmlEscape(config_->apiUrl) + "'><input type='hidden' name='deviceCode' value='" + StringUtils::htmlEscape(config_->deviceCode) + "'>";
  html += "<div class='security-grid'><div class='panel'><div class='field'><label>Local Admin PIN ใหม่</label><input type='password' name='adminPin' value='' placeholder='เว้นว่างเพื่อใช้ PIN เดิม'><div class='help'>ใช้สำหรับเปิด Local Device Console เมื่อ ESP32 เชื่อม Wi-Fi แล้ว</div></div></div>";
  html += "<div class='panel'><div class='field'><label>Root CA Certificate</label><textarea name='tlsCaCert' placeholder='เว้นว่างเพื่อใช้ค่าเดิม/Embedded CA · พิมพ์ CLEAR เพื่อลบ Portal CA'></textarea><div id='tlsInfo' class='help'>TLS: " + StringUtils::htmlEscape(backend_->tlsModeText()) + " · Source: " + StringUtils::htmlEscape(backend_->tlsCaSourceText()) + "</div></div></div></div>";
  html += "<div class='button-row'><button class='btn-primary' type='submit'>บันทึก Security Settings</button></div></form></div></section>";

  return html;
}

String PortalServer::operationsHtml() {
  String html;
  html += "<section id='system' class='dashboard-page' data-page-title='System Operations'><div class='card'><div class='section-head'><div><div class='kicker'>Operations</div><h2>ตรวจสอบและดูแลอุปกรณ์</h2><p class='muted'>เครื่องมือสำหรับตรวจงานติดตั้ง แก้ปัญหา และเริ่มตั้งค่าใหม่</p></div></div><div class='system-grid'>";
  html += "<div class='operation-card'><h3>Status JSON</h3><p>เปิดข้อมูลสถานะจาก Firmware สำหรับตรวจสอบ Wi-Fi, Backend, TLS และ Sensor</p><div class='button-row'><a class='btn btn-secondary' href='/json" + authQuery() + "'>ดู Status JSON</a></div></div>";
  html += "<div class='operation-card'><h3>Restart ESP32</h3><p>Restart อุปกรณ์โดยไม่ล้าง Wi-Fi, Device Code หรือการตั้งค่าเดิม</p><form method='POST' action='/restart' class='button-row'>" + pinHiddenInput() + "<button class='btn-secondary' type='submit'>Restart ESP32</button></form></div>";
  html += "<div class='operation-card danger-card' style='grid-column:1/-1'><h3>Factory Reset</h3><p>ล้าง Wi-Fi, Backend, Device Code/Secret, PIN และ Sensor Settings ทั้งหมด ใช้เมื่อเริ่มติดตั้งใหม่เท่านั้น</p><form method='POST' action='/reset' onsubmit='return confirm(\"ล้างการตั้งค่าทั้งหมดของ ESP32 หรือไม่?\")' class='button-row'>" + pinHiddenInput() + "<button class='btn-danger' type='submit'>Factory Reset Config</button></form></div>";
  html += "</div></div></section>";
  return html;
}

String PortalServer::restartPage(const String &kicker,
                                 const String &title,
                                 const String &message,
                                 const String &extraNotice) const {
  String html;
  html += "<section class='card restart'><div class='restart-icon'>✓</div><div class='kicker'>" + StringUtils::htmlEscape(kicker) + "</div><h1>" + StringUtils::htmlEscape(title) + "</h1><p class='muted'>" + StringUtils::htmlEscape(message) + "</p>";
  if (extraNotice.length() > 0) {
    html += "<div class='notice info'>" + extraNotice + "</div>";
  }
  html += "<div class='restart-steps'><div class='restart-step'><b>1</b><div><strong>รอ 15–30 วินาที</strong><div class='help'>ไฟสถานะจะกระพริบระหว่างเชื่อมต่อ</div></div></div><div class='restart-step'><b>2</b><div><strong>เชื่อมโทรศัพท์หรือคอมกลับเข้า Wi-Fi</strong><div class='help'>หาก Wi-Fi ใหม่ล้มเหลว ระบบจะย้อนกลับเครือข่ายเดิม</div></div></div><div class='restart-step'><b>3</b><div><strong>เปิด Dashboard หรือ Local IP</strong><div class='help'>ตรวจว่าอุปกรณ์ Online และเริ่มส่งข้อมูล</div></div></div></div></section>";
  return html;
}
