#include "portal/PortalServer.h"

#include <ArduinoJson.h>
#include <WiFi.h>

#include "FirmwareVersion.h"
#include "ProductConfig.h"
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

  view_.setRequestContext(setupMode_, currentPinValue());
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
        renderPage(
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
        renderPage(
            "Wi-Fi Error",
            "<section class='card'><h2>รหัสผ่าน Wi-Fi ไม่ถูกต้อง</h2><div class='notice'>รหัสผ่าน WPA/WPA2 ต้องมี 8–63 ตัวอักษร หรือเว้นว่างสำหรับเครือข่าย Open</div><div class='button-row'><a class='btn btn-secondary' href='/" + authQuery() + "#wifi'>กลับไปตั้งค่า Wi-Fi</a></div></section>"));
    return;
  }

  const bool keepBackups = server_.hasArg("keepWifiBackups");
  if (!store_->stageWiFi(*config_, ssid, password, keepBackups)) {
    server_.send(
        500,
        "text/html; charset=utf-8",
        renderPage(
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
      renderPage(
          "กำลังเปลี่ยน Wi-Fi",
          view_.restartPage(
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
      renderPage(
          "ล้าง Wi-Fi",
          view_.restartPage(
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
        renderPage(
            "Invalid PIN",
            "<section class='card'><h2>Local Admin PIN ไม่ถูกต้อง</h2><div class='notice'>PIN ต้องมีอย่างน้อย 4 ตัวอักษร</div></section>"));
    return;
  }

  if (next.tlsCaCert.length() > 0 &&
      next.tlsCaCert.indexOf("BEGIN CERTIFICATE") < 0) {
    server_.send(
        400,
        "text/html; charset=utf-8",
        renderPage(
            "Invalid Root CA",
            "<section class='card'><h2>Root CA ไม่ถูกต้อง</h2><div class='notice'>ต้องเป็น PEM ที่มี BEGIN CERTIFICATE หรือพิมพ์ CLEAR เพื่อลบ Portal CA</div></section>"));
    return;
  }

  if (!store_->save(next)) {
    server_.send(
        500,
        "text/html; charset=utf-8",
        renderPage(
            "Save Error",
            "<section class='card'><h2>บันทึก Device ไม่สำเร็จ</h2><div class='notice'>ไม่สามารถเขียนข้อมูลลง NVS ได้</div></section>"));
    return;
  }

  *config_ = next;
  sensors_->reconfigure(*config_);

  server_.send(
      200,
      "text/html; charset=utf-8",
      renderPage(
          "บันทึก Device",
          view_.restartPage(
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
    body += "<div class='stat'><small>Source</small><strong>" + String(snapshot.fallbackUsed ? "Dummy fallback" : "DHT sensor") + "</strong></div>";
    body += "</div>";
  } else {
    body += "<div class='notice'>อ่าน DHT ไม่สำเร็จ และปิด Dummy fallback อยู่</div>";
  }
  body += "<div class='button-row'><a class='btn btn-secondary' href='/" + authQuery() + "'>กลับหน้าหลัก</a><a class='btn btn-secondary' href='/json" + authQuery() + "'>Status JSON</a></div></section>";

  server_.send(
      200,
      "text/html; charset=utf-8",
      renderPage("Sensor Test", body));
}

void PortalServer::handleReset() {
  if (!requireAdmin()) return;

  store_->clearAll();
  server_.send(
      200,
      "text/html; charset=utf-8",
      renderPage(
          "Factory Reset",
          view_.restartPage(
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
      renderPage(
          "Restart",
          view_.restartPage(
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

String PortalServer::authQuery() {
  if (setupMode_ || !server_.hasArg("pin")) return "";
  return "?pin=" + currentPinValue();
}

void PortalServer::sendLocalAdminLogin(int statusCode,
                                       const String &message) {
  view_.setRequestContext(false, "");
  server_.send(
      statusCode,
      "text/html; charset=utf-8",
      view_.loginPage(message, config_->adminPin.length() == 0));
}

String PortalServer::renderPage(const String &title,
                                const String &body) {
  view_.setRequestContext(setupMode_, currentPinValue());
  return view_.pageShell(title, body);
}
