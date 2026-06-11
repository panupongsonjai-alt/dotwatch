#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include "config.h"

DHT dht(DHT_PIN, DHT_TYPE);
unsigned long lastSend = 0;

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("WiFi connecting");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());
}

bool sendReading(float temperature, float humidity) {
  if (WiFi.status() != WL_CONNECTED) connectWiFi();

  HTTPClient http;
  http.begin(DOTWATCH_API_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-id", DEVICE_ID);
  http.addHeader("x-device-secret", DEVICE_SECRET);

  StaticJsonDocument<256> doc;
  doc["temperature"] = temperature;
  doc["humidity"] = humidity;
  doc["rssi"] = WiFi.RSSI();
  doc["firmwareVersion"] = "1.0.0";

  String body;
  serializeJson(doc, body);
  int code = http.POST(body);
  String response = http.getString();
  http.end();

  Serial.printf("POST %d %s\n", code, response.c_str());
  return code >= 200 && code < 300;
}

void setup() {
  Serial.begin(115200);
  dht.begin();
  connectWiFi();
}

void loop() {
  if (millis() - lastSend < SEND_INTERVAL_MS) return;
  lastSend = millis();

  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature();

  if (isnan(humidity) || isnan(temperature)) {
    Serial.println("DHT read failed");
    return;
  }

  sendReading(temperature, humidity);
}
