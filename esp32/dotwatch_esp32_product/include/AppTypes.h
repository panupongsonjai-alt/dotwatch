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

  // OTA configuration. An empty otaBaseUrl reuses apiUrl.
  String otaBaseUrl;
  String otaChannel = ProductConfig::DEFAULT_OTA_CHANNEL;
  bool otaEnabled = true;
  bool otaAutoInstall = false;
  unsigned long otaCheckIntervalMs = ProductConfig::OTA_DEFAULT_CHECK_INTERVAL_MS;
};

struct WiFiProfile {
  String ssid;
  String password;
  int rssi = -999;
  bool primary = false;
};

// Network values learned from the first successful DHCP connection.
// The lease is stored per SSID and reused as a static IP on later boots.
struct WiFiIpLease {
  String ssid;
  String localIp;
  String gateway;
  String subnet;
  String dns1;
  String dns2;
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

  // OTA runtime state exposed through /json and the Firmware Update page.
  String otaState = "IDLE";
  String otaMessage = "ยังไม่ได้ตรวจสอบอัปเดต";
  String otaAvailableVersion;
  String otaReleaseNotes;
  uint32_t otaAvailableBuild = 0;
  uint32_t otaDownloadedBytes = 0;
  uint32_t otaTotalBytes = 0;
  uint8_t otaProgressPercent = 0;
  unsigned long otaLastCheckAtMs = 0;
  unsigned long otaNextCheckAtMs = 0;
  bool otaUpdateAvailable = false;
  bool otaMandatory = false;
  bool otaBusy = false;
};
