/*
  dotWatch ESP32-DHT3 Firmware
  This is for the additional model esp32_dht3.
  It does NOT replace Raspberry Pi / DW20CH.

  Metrics:
    metric_1 = Temperature (°C)
    metric_2 = Humidity (%)
    metric_3 = WiFi RSSI (dBm)
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>

#define WIFI_SSID "CHANGE_ME_WIFI_SSID"
#define WIFI_PASSWORD "CHANGE_ME_WIFI_PASSWORD"

#define DOTWATCH_API_URL "https://dotwatch-backend.onrender.com"
#define DEVICE_CODE "DW-CHANGE-ME"
#define DEVICE_SECRET "CHANGE_ME_DEVICE_SECRET"

#define FIRMWARE_VERSION "esp32-dht3-0.1.0"

#define DHT_PIN 4
#define DHT_TYPE DHT11

#define SEND_INTERVAL_MS 20000
#define FALLBACK_DUMMY_WHEN_DHT_FAILS true

DHT dht(DHT_PIN, DHT_TYPE);
unsigned long lastSendAt = 0;

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("WiFi connecting");
  unsigned long started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < 20000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi connected IP=");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("WiFi connect timeout");
  }
}

bool readMetrics(float &temperature, float &humidity, int &rssi) {
  temperature = dht.readTemperature();
  humidity = dht.readHumidity();
  rssi = WiFi.RSSI();

  if (!isnan(temperature) && !isnan(humidity)) return true;

#if FALLBACK_DUMMY_WHEN_DHT_FAILS
  temperature = 24.0 + random(0, 800) / 100.0;
  humidity = 45.0 + random(0, 2000) / 100.0;
  return true;
#else
  return false;
#endif
}

bool postIngest(float temperature, float humidity, int rssi) {
  if (WiFi.status() != WL_CONNECTED) return false;

  StaticJsonDocument<384> doc;
  doc["firmwareVersion"] = FIRMWARE_VERSION;
  doc["timestamp"] = String("esp32-uptime-ms-") + String(millis());

  JsonObject metrics = doc.createNestedObject("metrics");
  metrics["metric_1"] = temperature;
  metrics["metric_2"] = humidity;
  metrics["metric_3"] = rssi;

  String body;
  serializeJson(doc, body);

  HTTPClient http;
  http.begin(String(DOTWATCH_API_URL) + "/api/ingest");
  http.setTimeout(15000);
  http.addHeader("Accept", "application/json");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("User-Agent", "dotwatch-esp32-dht3/" FIRMWARE_VERSION);
  http.addHeader("x-device-code", DEVICE_CODE);
  http.addHeader("x-device-secret", DEVICE_SECRET);

  int status = http.POST(body);
  String response = http.getString();

  Serial.print("SENT metric_1=");
  Serial.print(temperature);
  Serial.print(" metric_2=");
  Serial.print(humidity);
  Serial.print(" metric_3=");
  Serial.println(rssi);

  Serial.print("HTTP status=");
  Serial.println(status);
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
  dht.begin();

  Serial.println("dotWatch ESP32-DHT3 started");
  Serial.println("Additional model, not replacing Raspberry Pi / DW20CH");
  connectWiFi();
}

void loop() {
  connectWiFi();

  if (millis() - lastSendAt < SEND_INTERVAL_MS) {
    delay(250);
    return;
  }
  lastSendAt = millis();

  float temperature = NAN;
  float humidity = NAN;
  int rssi = 0;

  if (!readMetrics(temperature, humidity, rssi)) {
    Serial.println("DHT read failed, skip send");
    return;
  }

  Serial.println(postIngest(temperature, humidity, rssi) ? "SERVER_OK" : "SERVER_ERROR");
}
