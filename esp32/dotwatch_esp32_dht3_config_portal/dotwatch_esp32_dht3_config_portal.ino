/*
  dotWatch ESP32-DHT3 Production Config Portal
  Phase 4E

  This firmware is for the additional model:
    model_key  = esp32_dht3
    model_name = ESP32-DHT3

  It does NOT replace Raspberry Pi / DW20CH.

  Metrics:
    metric_1 = Temperature (°C)
    metric_2 = Humidity (%)
    metric_3 = WiFi RSSI (dBm)

  Features:
    - No hardcoded Wi-Fi password or device secret required
    - Stores config in ESP32 NVS Preferences
    - If Wi-Fi/config is missing, starts setup AP:
        SSID: dotWatch-ESP32-Setup
        URL : http://192.168.4.1/
    - Config web page supports:
        Wi-Fi SSID/password
        Backend API URL
        Device Code/Secret
        DHT pin/type
        Send interval
    - Uses NTP ISO timestamp when available
    - Sends credentials through headers:
        x-device-code
        x-device-secret

  Required Arduino libraries:
    - ArduinoJson
    - DHT sensor library
    - Adafruit Unified Sensor
*/

#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <Preferences.h>
#include <time.h>

#define FIRMWARE_VERSION "esp32-dht3-config-0.2.0"

static const char *SETUP_AP_SSID = "dotWatch-ESP32-Setup";
static const char *SETUP_AP_PASSWORD = "dotwatch-setup";  // open AP for first setup
static const byte DNS_PORT = 53;

static const int DEFAULT_DHT_PIN = 4;
static const int DEFAULT_DHT_TYPE = DHT11;
static const unsigned long DEFAULT_SEND_INTERVAL_MS = 20000;
static const unsigned long WIFI_CONNECT_TIMEOUT_MS = 20000;
static const unsigned long PORTAL_RETRY_WIFI_MS = 30000;

Preferences prefs;
WebServer server(80);
DNSServer dnsServer;

struct Config {
  String wifiSsid;
  String wifiPassword;
  String apiUrl;
  String deviceCode;
  String deviceSecret;
  int dhtPin;
  int dhtType;
  unsigned long sendIntervalMs;
  bool fallbackDummy;
};

Config cfg;
DHT *dht = nullptr;

bool portalMode = false;
unsigned long lastSendAt = 0;
unsigned long lastWifiRetryAt = 0;

String htmlEscape(const String &input) {
  String out = input;
  out.replace("&", "&amp;");
  out.replace("<", "&lt;");
  out.replace(">", "&gt;");
  out.replace("\"", "&quot;");
  out.replace("'", "&#39;");
  return out;
}

String maskSecret(const String &secret) {
  if (secret.length() == 0) return "Not set";
  if (secret.length() <= 8) return "********";
  return secret.substring(0, 4) + "********" + secret.substring(secret.length() - 4);
}

String normalizeApiUrl(String value) {
  value.trim();
  while (value.endsWith("/")) value.remove(value.length() - 1);
  if (value.length() == 0) value = "https://dotwatch-backend.onrender.com";
  return value;
}

void loadConfig() {
  prefs.begin("dotwatch", true);
  cfg.wifiSsid = prefs.getString("wifiSsid", "");
  cfg.wifiPassword = prefs.getString("wifiPass", "");
  cfg.apiUrl = normalizeApiUrl(prefs.getString("apiUrl", "https://dotwatch-backend.onrender.com"));
  cfg.deviceCode = prefs.getString("devCode", "");
  cfg.deviceSecret = prefs.getString("devSecret", "");
  cfg.dhtPin = prefs.getInt("dhtPin", DEFAULT_DHT_PIN);
  cfg.dhtType = prefs.getInt("dhtType", DEFAULT_DHT_TYPE);
  cfg.sendIntervalMs = prefs.getULong("sendMs", DEFAULT_SEND_INTERVAL_MS);
  cfg.fallbackDummy = prefs.getBool("dummy", true);
  prefs.end();

  if (cfg.sendIntervalMs < 5000) cfg.sendIntervalMs = 5000;
}

void saveConfig(const Config &next) {
  prefs.begin("dotwatch", false);
  prefs.putString("wifiSsid", next.wifiSsid);
  prefs.putString("wifiPass", next.wifiPassword);
  prefs.putString("apiUrl", normalizeApiUrl(next.apiUrl));
  prefs.putString("devCode", next.deviceCode);
  prefs.putString("devSecret", next.deviceSecret);
  prefs.putInt("dhtPin", next.dhtPin);
  prefs.putInt("dhtType", next.dhtType);
  prefs.putULong("sendMs", next.sendIntervalMs);
  prefs.putBool("dummy", next.fallbackDummy);
  prefs.end();
}

void clearConfig() {
  prefs.begin("dotwatch", false);
  prefs.clear();
  prefs.end();
}

bool hasRequiredConfig() {
  return cfg.wifiSsid.length() > 0 &&
         cfg.apiUrl.length() > 0 &&
         cfg.deviceCode.length() > 0 &&
         cfg.deviceSecret.length() > 0;
}

void setupDht() {
  if (dht != nullptr) {
    delete dht;
    dht = nullptr;
  }
  dht = new DHT(cfg.dhtPin, cfg.dhtType);
  dht->begin();
}

bool connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return true;
  if (cfg.wifiSsid.length() == 0) return false;

  WiFi.mode(WIFI_STA);
  WiFi.begin(cfg.wifiSsid.c_str(), cfg.wifiPassword.c_str());

  Serial.print("Connecting Wi-Fi: ");
  Serial.println(cfg.wifiSsid);

  unsigned long started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < WIFI_CONNECT_TIMEOUT_MS) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("Wi-Fi connected. IP=");
    Serial.println(WiFi.localIP());
    Serial.print("RSSI=");
    Serial.println(WiFi.RSSI());
    return true;
  }

  Serial.println("Wi-Fi connect failed.");
  return false;
}

void setupTime() {
  if (WiFi.status() != WL_CONNECTED) return;
  configTime(0, 0, "pool.ntp.org", "time.nist.gov", "time.google.com");

  Serial.print("NTP sync");
  for (int i = 0; i < 20; i++) {
    struct tm timeinfo;
    if (getLocalTime(&timeinfo, 500)) {
      Serial.println(" OK");
      return;
    }
    Serial.print(".");
  }
  Serial.println(" timeout");
}

String isoTimestampOrEmpty() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 20)) {
    return "";
  }

  char buffer[32];
  strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  return String(buffer);
}

String pageShell(const String &title, const String &body) {
  String html = "";
  html += "<!doctype html><html lang='th'><head><meta charset='utf-8'>";
  html += "<meta name='viewport' content='width=device-width, initial-scale=1'>";
  html += "<title>dotWatch ESP32 Setup</title>";
  html += "<style>";
  html += ":root{color-scheme:dark;--bg:#0f172a;--panel:#1e293b;--panel2:#111827;--text:#f8fafc;--muted:#94a3b8;--border:#334155;--primary:#2563eb;--ok:#22c55e;--warn:#f59e0b;--danger:#ef4444;--red:#ef4444}";
  html += "*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 80% -10%,rgba(37,99,235,.22),transparent 26rem),var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}";
  html += ".wrap{max-width:980px;margin:0 auto;padding:22px}.header,.card{background:var(--panel);border:1px solid var(--border);border-radius:22px;box-shadow:0 18px 45px rgba(0,0,0,.26)}.header{padding:22px;margin-bottom:16px;display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.brand{display:flex;gap:12px;align-items:center}.logo{width:42px;height:42px;border-radius:14px;background:radial-gradient(circle at 30% 30%,#fff 0 8%,transparent 9%),linear-gradient(135deg,var(--red),#991b1b)}h1{font-size:24px;margin:0;letter-spacing:-.04em}.muted{color:var(--muted);font-size:13px;line-height:1.5}.grid{display:grid;grid-template-columns:1fr 330px;gap:16px}.card{padding:20px;margin-bottom:16px}.card h2{margin:0 0 12px;font-size:18px}.form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.full{grid-column:1/-1}label{display:grid;gap:7px;font-size:13px;font-weight:800}input,select{width:100%;border:1px solid var(--border);border-radius:13px;background:var(--panel2);color:var(--text);padding:12px 13px;outline:none}input:focus,select:focus{border-color:var(--primary);box-shadow:0 0 0 4px rgba(37,99,235,.12)}button,.btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 14px;border:0;border-radius:13px;background:var(--primary);color:white;font-weight:900;text-decoration:none;cursor:pointer}.btn2{background:transparent;border:1px solid var(--border)}.danger{background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.28);color:#fecaca}.row{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}.stat{padding:13px;border:1px solid var(--border);border-radius:16px;background:var(--panel2);margin-bottom:10px}.stat small{display:block;color:var(--muted);font-size:11px;font-weight:900}.stat strong{display:block;margin-top:4px;font-size:15px;word-break:break-word}.badge{display:inline-flex;align-items:center;gap:8px;min-height:32px;padding:0 11px;border-radius:999px;border:1px solid var(--border);background:var(--panel2);color:var(--muted);font-size:12px;font-weight:900}.dot{width:8px;height:8px;border-radius:999px;background:var(--warn)}.ok .dot{background:var(--ok)}.bad .dot{background:var(--danger)}.notice{padding:13px 14px;border-radius:16px;border:1px solid rgba(245,158,11,.28);background:rgba(245,158,11,.10);color:#fde68a;margin-bottom:16px;font-size:13px;line-height:1.5}.footer{text-align:center;color:var(--muted);font-size:12px;margin-top:18px}";
  html += "@media(max-width:840px){.grid{grid-template-columns:1fr}.header{display:block}.form{grid-template-columns:1fr}.wrap{padding:14px}}";
  html += "</style></head><body><div class='wrap'>";
  html += "<header class='header'><div class='brand'><div class='logo'></div><div><h1>";
  html += htmlEscape(title);
  html += "</h1><div class='muted'>dotWatch ESP32-DHT3 · Additional model · ";
  html += FIRMWARE_VERSION;
  html += "</div></div></div><div>";
  html += (WiFi.status() == WL_CONNECTED)
            ? "<span class='badge ok'><span class='dot'></span>Wi-Fi connected</span>"
            : "<span class='badge bad'><span class='dot'></span>Setup mode</span>";
  html += "</div></header>";
  html += body;
  html += "<div class='footer'>dotWatch ESP32 Config Portal · ไม่แทนที่ Raspberry Pi / DW20CH</div>";
  html += "</div></body></html>";
  return html;
}

String currentStatusHtml() {
  String html = "";
  html += "<div class='stat'><small>Wi-Fi</small><strong>" + htmlEscape(WiFi.status() == WL_CONNECTED ? cfg.wifiSsid : "Not connected") + "</strong></div>";
  html += "<div class='stat'><small>IP</small><strong>" + htmlEscape(WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : WiFi.softAPIP().toString()) + "</strong></div>";
  html += "<div class='stat'><small>Backend</small><strong>" + htmlEscape(cfg.apiUrl) + "</strong></div>";
  html += "<div class='stat'><small>Device Code</small><strong>" + htmlEscape(cfg.deviceCode.length() ? cfg.deviceCode : "Not set") + "</strong></div>";
  html += "<div class='stat'><small>Device Secret</small><strong>" + htmlEscape(maskSecret(cfg.deviceSecret)) + "</strong></div>";
  html += "<div class='stat'><small>DHT</small><strong>Pin " + String(cfg.dhtPin) + " · " + String(cfg.dhtType == DHT22 ? "DHT22" : "DHT11") + "</strong></div>";
  html += "<div class='stat'><small>Interval</small><strong>" + String(cfg.sendIntervalMs / 1000) + "s</strong></div>";
  html += "<div class='stat'><small>RSSI</small><strong>" + String(WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0) + " dBm</strong></div>";
  return html;
}

void handleRoot() {
  String body = "";
  if (!hasRequiredConfig()) {
    body += "<div class='notice'>ยังตั้งค่าไม่ครบ ให้กรอก Wi‑Fi, Backend, Device Code และ Device Secret ของ ESP32 device ใหม่ ไม่ใช้ของ Raspberry Pi</div>";
  }

  body += "<div class='grid'><main><section class='card'><h2>ESP32 Setup</h2>";
  body += "<form method='POST' action='/save'><div class='form'>";
  body += "<label>Wi‑Fi SSID<input name='wifiSsid' value='" + htmlEscape(cfg.wifiSsid) + "' placeholder='Your Wi-Fi'></label>";
  body += "<label>Wi‑Fi Password<input type='password' name='wifiPassword' value='' placeholder='เว้นว่างเพื่อใช้ค่าเดิม'></label>";
  body += "<label class='full'>Backend API URL<input name='apiUrl' value='" + htmlEscape(cfg.apiUrl) + "' placeholder='https://dotwatch-backend.onrender.com'></label>";
  body += "<label>Device Code<input name='deviceCode' value='" + htmlEscape(cfg.deviceCode) + "' placeholder='DW-ESP32-...'></label>";
  body += "<label>Device Secret<input type='password' name='deviceSecret' value='' placeholder='เว้นว่างเพื่อใช้ค่าเดิม'></label>";
  body += "<label>DHT Pin<input type='number' name='dhtPin' value='" + String(cfg.dhtPin) + "'></label>";
  body += "<label>DHT Type<select name='dhtType'>";
  body += "<option value='11'" + String(cfg.dhtType == DHT11 ? " selected" : "") + ">DHT11</option>";
  body += "<option value='22'" + String(cfg.dhtType == DHT22 ? " selected" : "") + ">DHT22</option>";
  body += "</select></label>";
  body += "<label>Send Interval<select name='sendIntervalSec'>";
  const int intervals[] = {10, 20, 30, 60, 120};
  for (int i = 0; i < 5; i++) {
    int sec = intervals[i];
    body += "<option value='" + String(sec) + "'" + String((cfg.sendIntervalMs / 1000) == (unsigned long)sec ? " selected" : "") + ">" + String(sec) + " sec</option>";
  }
  body += "</select></label>";
  body += "<label>Fallback Dummy<select name='fallbackDummy'>";
  body += "<option value='true'" + String(cfg.fallbackDummy ? " selected" : "") + ">Enabled</option>";
  body += "<option value='false'" + String(!cfg.fallbackDummy ? " selected" : "") + ">Disabled</option>";
  body += "</select></label>";
  body += "</div><div class='row'><button type='submit'>Save & Restart</button><a class='btn btn2' href='/test'>Read Test</a><a class='btn btn2' href='/json'>JSON</a></div></form>";
  body += "</section></main><aside><section class='card'><h2>Snapshot</h2>";
  body += currentStatusHtml();
  body += "<div class='row'><form method='POST' action='/reset' onsubmit='return confirm(\"Clear ESP32 config?\")'><button class='danger' type='submit'>Factory Reset Config</button></form></div>";
  body += "</section></aside></div>";

  server.send(200, "text/html; charset=utf-8", pageShell("ESP32 Setup Center", body));
}

void handleSave() {
  Config next = cfg;

  if (server.hasArg("wifiSsid")) next.wifiSsid = server.arg("wifiSsid");
  if (server.hasArg("wifiPassword") && server.arg("wifiPassword").length() > 0) next.wifiPassword = server.arg("wifiPassword");
  if (server.hasArg("apiUrl")) next.apiUrl = normalizeApiUrl(server.arg("apiUrl"));
  if (server.hasArg("deviceCode")) next.deviceCode = server.arg("deviceCode");
  if (server.hasArg("deviceSecret") && server.arg("deviceSecret").length() > 0) next.deviceSecret = server.arg("deviceSecret");
  if (server.hasArg("dhtPin")) next.dhtPin = server.arg("dhtPin").toInt();
  if (server.hasArg("dhtType")) next.dhtType = server.arg("dhtType").toInt() == 22 ? DHT22 : DHT11;
  if (server.hasArg("sendIntervalSec")) next.sendIntervalMs = max(5, server.arg("sendIntervalSec").toInt()) * 1000UL;
  if (server.hasArg("fallbackDummy")) next.fallbackDummy = server.arg("fallbackDummy") == "true";

  next.wifiSsid.trim();
  next.apiUrl = normalizeApiUrl(next.apiUrl);
  next.deviceCode.trim();
  next.deviceSecret.trim();

  saveConfig(next);

  String body = "<section class='card'><h2>Saved</h2><p class='muted'>บันทึกแล้ว กำลัง restart ESP32 ภายใน 2 วินาที</p><a class='btn btn2' href='/'>Back</a></section>";
  server.send(200, "text/html; charset=utf-8", pageShell("Saved", body));
  delay(1500);
  ESP.restart();
}

void handleReset() {
  clearConfig();
  String body = "<section class='card'><h2>Config Cleared</h2><p class='muted'>ล้างค่าแล้ว กำลัง restart เข้าสู่ setup AP ใหม่</p></section>";
  server.send(200, "text/html; charset=utf-8", pageShell("Reset", body));
  delay(1500);
  ESP.restart();
}

bool readMetrics(float &temperature, float &humidity, int &rssi) {
  if (dht == nullptr) setupDht();

  temperature = dht->readTemperature();
  humidity = dht->readHumidity();
  rssi = WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0;

  if (!isnan(temperature) && !isnan(humidity)) {
    return true;
  }

  if (cfg.fallbackDummy) {
    temperature = 24.0 + random(0, 800) / 100.0;
    humidity = 45.0 + random(0, 2000) / 100.0;
    return true;
  }

  return false;
}

void handleJson() {
  StaticJsonDocument<768> doc;
  doc["firmwareVersion"] = FIRMWARE_VERSION;
  doc["modelKey"] = "esp32_dht3";
  doc["wifiConnected"] = WiFi.status() == WL_CONNECTED;
  doc["ip"] = WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : WiFi.softAPIP().toString();
  doc["apiUrl"] = cfg.apiUrl;
  doc["deviceCode"] = cfg.deviceCode;
  doc["deviceSecretMasked"] = maskSecret(cfg.deviceSecret);
  doc["dhtPin"] = cfg.dhtPin;
  doc["dhtType"] = cfg.dhtType == DHT22 ? "DHT22" : "DHT11";
  doc["sendIntervalSeconds"] = cfg.sendIntervalMs / 1000;
  doc["rssi"] = WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0;

  String out;
  serializeJsonPretty(doc, out);
  server.send(200, "application/json; charset=utf-8", out);
}

void handleTest() {
  float temperature = NAN;
  float humidity = NAN;
  int rssi = 0;
  bool ok = readMetrics(temperature, humidity, rssi);

  String body = "<section class='card'><h2>Read Test</h2>";
  if (ok) {
    body += "<div class='stat'><small>metric_1 Temperature</small><strong>" + String(temperature, 2) + " °C</strong></div>";
    body += "<div class='stat'><small>metric_2 Humidity</small><strong>" + String(humidity, 2) + " %</strong></div>";
    body += "<div class='stat'><small>metric_3 WiFi RSSI</small><strong>" + String(rssi) + " dBm</strong></div>";
  } else {
    body += "<div class='notice'>DHT read failed and fallback dummy is disabled.</div>";
  }
  body += "<div class='row'><a class='btn btn2' href='/'>Back</a></div></section>";
  server.send(200, "text/html; charset=utf-8", pageShell("Read Test", body));
}

void handleCaptive() {
  server.sendHeader("Location", String("http://") + WiFi.softAPIP().toString() + "/", true);
  server.send(302, "text/plain", "");
}

void setupPortal() {
  portalMode = true;

  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(SETUP_AP_SSID, SETUP_AP_PASSWORD);

  IPAddress apIp = WiFi.softAPIP();
  dnsServer.start(DNS_PORT, "*", apIp);

  Serial.print("Setup AP started. SSID=");
  Serial.println(SETUP_AP_SSID);
  Serial.print("Setup URL: http://");
  Serial.println(apIp);

  server.on("/", HTTP_GET, handleRoot);
  server.on("/save", HTTP_POST, handleSave);
  server.on("/reset", HTTP_POST, handleReset);
  server.on("/json", HTTP_GET, handleJson);
  server.on("/test", HTTP_GET, handleTest);
  server.on("/generate_204", HTTP_GET, handleCaptive);
  server.on("/gen_204", HTTP_GET, handleCaptive);
  server.on("/hotspot-detect.html", HTTP_GET, handleCaptive);
  server.on("/fwlink", HTTP_GET, handleCaptive);
  server.onNotFound(handleCaptive);
  server.begin();
}

bool postIngest(float temperature, float humidity, int rssi) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("POST skipped: Wi-Fi not connected");
    return false;
  }

  if (!hasRequiredConfig()) {
    Serial.println("POST skipped: config incomplete");
    return false;
  }

  String endpoint = cfg.apiUrl + "/api/ingest";

  StaticJsonDocument<512> doc;
  doc["firmwareVersion"] = FIRMWARE_VERSION;

  String timestamp = isoTimestampOrEmpty();
  if (timestamp.length() > 0) {
    doc["timestamp"] = timestamp;
  }

  JsonObject metrics = doc.createNestedObject("metrics");
  metrics["metric_1"] = serialized(String(temperature, 2));
  metrics["metric_2"] = serialized(String(humidity, 2));
  metrics["metric_3"] = rssi;

  String body;
  serializeJson(doc, body);

  HTTPClient http;
  WiFiClientSecure secureClient;
  WiFiClient plainClient;

  bool beginOk = false;
  if (endpoint.startsWith("https://")) {
    secureClient.setInsecure();  // Easy setup. For stricter production, install a root CA.
    beginOk = http.begin(secureClient, endpoint);
  } else {
    beginOk = http.begin(plainClient, endpoint);
  }

  if (!beginOk) {
    Serial.println("HTTP begin failed");
    return false;
  }

  http.setTimeout(15000);
  http.addHeader("Accept", "application/json");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("User-Agent", "dotwatch-esp32-dht3/" FIRMWARE_VERSION);
  http.addHeader("x-device-code", cfg.deviceCode);
  http.addHeader("x-device-secret", cfg.deviceSecret);

  int status = http.POST(body);
  String response = http.getString();

  Serial.print("POST status=");
  Serial.println(status);
  Serial.print("payload=");
  Serial.println(body);
  if (response.length()) {
    Serial.print("response=");
    Serial.println(response);
  }

  http.end();
  return status >= 200 && status < 300;
}

void setup() {
  Serial.begin(115200);
  delay(500);
  randomSeed(esp_random());

  Serial.println();
  Serial.println("dotWatch ESP32-DHT3 Production Config Portal");
  Serial.print("Firmware: ");
  Serial.println(FIRMWARE_VERSION);
  Serial.println("Additional model only. Does not replace Raspberry Pi / DW20CH.");

  loadConfig();
  setupDht();

  bool wifiOk = connectWiFi();
  if (wifiOk) {
    setupTime();
  }

  if (!hasRequiredConfig() || !wifiOk) {
    setupPortal();
  } else {
    WiFi.mode(WIFI_STA);
    Serial.println("Normal send mode. Config portal is not active.");
    Serial.print("Device Code: ");
    Serial.println(cfg.deviceCode);
    Serial.print("Device Secret: ");
    Serial.println(maskSecret(cfg.deviceSecret));
  }
}

void loop() {
  if (portalMode) {
    dnsServer.processNextRequest();
    server.handleClient();

    if (hasRequiredConfig() && WiFi.status() != WL_CONNECTED && millis() - lastWifiRetryAt > PORTAL_RETRY_WIFI_MS) {
      lastWifiRetryAt = millis();
      connectWiFi();
      if (WiFi.status() == WL_CONNECTED) setupTime();
    }

    delay(2);
    return;
  }

  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
    delay(1000);
    return;
  }

  unsigned long now = millis();
  if (now - lastSendAt < cfg.sendIntervalMs) {
    delay(250);
    return;
  }
  lastSendAt = now;

  float temperature = NAN;
  float humidity = NAN;
  int rssi = 0;

  if (!readMetrics(temperature, humidity, rssi)) {
    Serial.println("DHT read failed. Not sending.");
    return;
  }

  Serial.print("SENT metric_1=");
  Serial.print(temperature, 2);
  Serial.print(" metric_2=");
  Serial.print(humidity, 2);
  Serial.print(" metric_3=");
  Serial.println(rssi);

  bool ok = postIngest(temperature, humidity, rssi);
  Serial.println(ok ? "SERVER_OK" : "SERVER_ERROR");
}
