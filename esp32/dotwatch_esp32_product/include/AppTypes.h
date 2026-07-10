#pragma once

#include <Arduino.h>
#include "FirmwareVersion.h"
#include "ProductConfig.h"

enum class AppState : uint8_t {
  BOOTING,
  UNPROVISIONED,
  SETUP_PORTAL,
  CONNECTING_WIFI,
  CONNECTING_BACKEND,
  ONLINE,
  DEGRADED,
  RECOVERY,
  UPDATING
};

struct DeviceConfig {
  uint16_t schemaVersion = DOTWATCH_CONFIG_SCHEMA_VERSION;

  String wifiSsid;
  String wifiPassword;

  String pendingWifiSsid;
  String pendingWifiPassword;
  bool hasPendingWifi = false;
  bool pendingKeepBackups = true;

  String apiUrl = ProductConfig::DEFAULT_API_URL;
  String deviceCode;
  String deviceSecret;
  String adminPin;
  String tlsCaCert;

  int dhtPin = ProductConfig::DEFAULT_DHT_PIN;
  int dhtType = ProductConfig::DEFAULT_DHT_TYPE;
  unsigned long sendIntervalMs = ProductConfig::DEFAULT_SEND_INTERVAL_MS;
  bool fallbackDummy = true;
};

struct WiFiProfile {
  String ssid;
  String password;
  int rssi = -999;
  bool primary = false;
};

struct ScannedNetwork {
  String ssid;
  int rssi = -999;
  bool secure = true;
  bool current = false;
  bool remembered = false;
};

struct MetricSnapshot {
  float temperature = NAN;
  float humidity = NAN;
  int rssi = 0;
  bool fallbackUsed = false;
  unsigned long readAtMs = 0;
};

struct RuntimeStatus {
  AppState state = AppState::BOOTING;
  bool portalMode = false;
  bool wifiConnected = false;
  bool backendConnected = false;

  String lastSendStatus = "not_sent_yet";
  String lastSendError;
  int lastHttpStatus = 0;
  unsigned long lastSuccessfulSendAt = 0;
  unsigned long totalSendOk = 0;
  unsigned long totalSendFail = 0;

  String lastSensorError;
  bool lastSensorFallbackUsed = false;

  bool sensorReadingAvailable = false;
  float lastTemperature = NAN;
  float lastHumidity = NAN;
  unsigned long lastSensorReadAtMs = 0;
};
