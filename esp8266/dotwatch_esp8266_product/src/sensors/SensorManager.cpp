#include "sensors/SensorManager.h"

#include <ESP8266WiFi.h>
#include <math.h>

SensorManager::~SensorManager() {
  if (dht_ != nullptr) {
    delete dht_;
    dht_ = nullptr;
  }
}

void SensorManager::begin(const DeviceConfig &config) {
  createSensor(config);
}

void SensorManager::reconfigure(const DeviceConfig &config) {
  if (dht_ == nullptr ||
      activePin_ != config.dhtPin ||
      activeType_ != config.dhtType) {
    createSensor(config);
  }
}

bool SensorManager::read(MetricSnapshot &snapshot, const DeviceConfig &config) {
  reconfigure(config);
  if (dht_ == nullptr) return false;

  snapshot.temperature = dht_->readTemperature();
  snapshot.humidity = dht_->readHumidity();
  snapshot.rssi = WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0;
  snapshot.fallbackUsed = false;
  snapshot.readAtMs = millis();

  if (!isnan(snapshot.temperature) && !isnan(snapshot.humidity)) {
    return true;
  }

  if (!config.fallbackDummy) return false;

  snapshot.temperature = 24.0f + static_cast<float>(random(0, 800)) / 100.0f;
  snapshot.humidity = 45.0f + static_cast<float>(random(0, 2000)) / 100.0f;
  snapshot.fallbackUsed = true;
  return true;
}

String SensorManager::profileName(const DeviceConfig &config) const {
  return config.dhtType == DHT22 ? "DHT22" : "DHT11";
}

void SensorManager::createSensor(const DeviceConfig &config) {
  if (dht_ != nullptr) {
    delete dht_;
    dht_ = nullptr;
  }

  const uint8_t dhtType = config.dhtType == 22 ? DHT22 : DHT11;
  dht_ = new DHT(config.dhtPin, dhtType);
  dht_->begin();
  activePin_ = config.dhtPin;
  activeType_ = config.dhtType;

  Serial.print("SensorManager: initialized ");
  Serial.print(profileName(config));
  Serial.print(" on GPIO ");
  Serial.println(config.dhtPin);
}
