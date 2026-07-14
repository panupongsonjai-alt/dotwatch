#include "app/AppController.h"

#include <WiFi.h>
#include <esp_system.h>

#include "FirmwareVersion.h"
#include "ProductConfig.h"
#include "utils/StringUtils.h"

void AppController::begin() {
  Serial.begin(115200);
  delay(350);
  randomSeed(esp_random());

  printBootBanner();
  setState(AppState::BOOTING);

  statusLed_.begin();
  tftDisplay_.begin();

  configStore_.load(config_);
  sensorManager_.begin(config_);
  wifiManager_.begin(config_, configStore_);
  backendClient_.begin(config_, status_, timeService_);
  otaManager_.begin(config_, status_, backendClient_);
  recoveryManager_.begin(configStore_, status_);
  portalServer_.begin(
      config_,
      status_,
      configStore_,
      wifiManager_,
      sensorManager_,
      backendClient_,
      otaManager_);

  setState(AppState::CONNECTING_WIFI);
  const bool wifiConnected = wifiManager_.connectWithRollback(false);
  status_.wifiConnected = wifiConnected;

  if (wifiConnected) {
    timeService_.sync();
  }

  const bool configReady = configStore_.hasRequiredConfig(config_);
  if (!wifiConnected || !configReady) {
    setState(configReady ? AppState::SETUP_PORTAL : AppState::UNPROVISIONED);
    portalServer_.startSetupPortal();
    setState(AppState::SETUP_PORTAL);
  } else {
    setState(AppState::CONNECTING_BACKEND);
    portalServer_.startLocalAdmin();
  }

  scheduleNextSensorSample(ProductConfig::SENSOR_FIRST_SAMPLE_DELAY_MS);
  scheduleNextSend(ProductConfig::FIRST_SEND_DELAY_MS);
  tftDisplay_.tick(status_);
}

void AppController::loop() {
  updateConnectivityStatus();

  recoveryManager_.tick(
      portalServer_.isSetupMode(),
      status_.wifiConnected,
      configStore_.hasRequiredConfig(config_));

  portalServer_.loop();
  serviceWiFi();
  otaManager_.tick(status_.wifiConnected, portalServer_.isSetupMode());
  serviceSensor();
  serviceTelemetry();
  statusLed_.tick(status_);
  tftDisplay_.tick(status_);

  delay(2);
}

void AppController::printBootBanner() {
  Serial.println();
  Serial.println("============================================================");
  Serial.println(DOTWATCH_PRODUCT_NAME);
  Serial.print("Firmware: ");
  Serial.println(DOTWATCH_FIRMWARE_VERSION);
  Serial.print("Model: ");
  Serial.print(DOTWATCH_MODEL_NAME);
  Serial.print(" (");
  Serial.print(DOTWATCH_MODEL_KEY);
  Serial.println(")");
  Serial.println("Architecture: Modular portal + showroom product display + HTTPS Internet OTA");
  Serial.println("============================================================");
}

void AppController::setState(AppState state) {
  if (status_.state == state) return;
  status_.state = state;
  Serial.print("App state -> ");
  Serial.println(StringUtils::appStateText(state));
}

void AppController::updateConnectivityStatus() {
  status_.wifiConnected = wifiManager_.isConnected();
  if (!status_.wifiConnected) {
    status_.backendConnected = false;
  }
}

void AppController::serviceWiFi() {
  if (status_.wifiConnected) return;

  const unsigned long now = millis();
  const unsigned long retryInterval = portalServer_.isSetupMode()
                                          ? ProductConfig::PORTAL_RETRY_WIFI_MS
                                          : ProductConfig::WIFI_RETRY_INTERVAL_MS;
  if (now - lastWiFiRetryAt_ < retryInterval) return;
  lastWiFiRetryAt_ = now;

  setState(portalServer_.isSetupMode()
               ? AppState::SETUP_PORTAL
               : AppState::CONNECTING_WIFI);

  const bool connected = wifiManager_.reconnect(portalServer_.isSetupMode());
  status_.wifiConnected = connected;
  if (!connected) return;

  timeService_.sync();
  if (configStore_.hasRequiredConfig(config_)) {
    setState(portalServer_.isSetupMode()
                 ? AppState::SETUP_PORTAL
                 : AppState::CONNECTING_BACKEND);
    scheduleNextSend(500UL);
  }
}

void AppController::serviceSensor() {
  if (otaManager_.busy() || status_.state == AppState::UPDATING) return;

  const unsigned long now = millis();
  if (!sensorSampleDue(now)) return;
  scheduleNextSensorSample(ProductConfig::SENSOR_SAMPLE_INTERVAL_MS);

  MetricSnapshot snapshot;
  if (!sensorManager_.read(snapshot, config_)) {
    hasLatestSnapshot_ = false;
    status_.sensorReadingAvailable = false;
    status_.lastSensorError = "DHT read failed";
    status_.lastSensorFallbackUsed = false;
    Serial.println("SensorManager: DHT display sample failed");
    return;
  }

  latestSnapshot_ = snapshot;
  hasLatestSnapshot_ = true;
  publishSnapshotToStatus(snapshot);
}

void AppController::serviceTelemetry() {
  if (otaManager_.busy() || status_.state == AppState::UPDATING) return;
  if (!status_.wifiConnected) return;
  if (!configStore_.hasRequiredConfig(config_)) return;

  const unsigned long now = millis();
  if (!sendDue(now)) return;

  if (!hasLatestSnapshot_) {
    status_.lastSendStatus = "waiting_sensor";
    status_.lastSendError = "No valid DHT sample";
    setState(AppState::DEGRADED);
    scheduleNextSend(ProductConfig::SENSOR_SAMPLE_INTERVAL_MS);
    return;
  }

  scheduleNextSend(config_.sendIntervalMs);

  MetricSnapshot snapshot = latestSnapshot_;
  snapshot.rssi = WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0;
  latestSnapshot_.rssi = snapshot.rssi;

  Serial.print("Telemetry metric_1=");
  Serial.print(snapshot.temperature, 2);
  Serial.print(" metric_2=");
  Serial.print(snapshot.humidity, 2);
  Serial.print(" wifi_rssi=");
  Serial.print(snapshot.rssi);
  if (snapshot.fallbackUsed) Serial.print(" source=dummy_fallback");
  Serial.println();

  const bool setupPortalActive = portalServer_.isSetupMode();
  if (!setupPortalActive) setState(AppState::CONNECTING_BACKEND);
  const bool sent = backendClient_.postIngest(snapshot);
  setState(setupPortalActive
               ? AppState::SETUP_PORTAL
               : (sent ? AppState::ONLINE : AppState::DEGRADED));
  Serial.println(sent ? "SERVER_OK" : "SERVER_ERROR");
}

bool AppController::sensorSampleDue(unsigned long now) const {
  return static_cast<long>(now - nextSensorSampleAt_) >= 0;
}

bool AppController::sendDue(unsigned long now) const {
  return static_cast<long>(now - nextSendAt_) >= 0;
}

void AppController::scheduleNextSensorSample(unsigned long delayMs) {
  nextSensorSampleAt_ = millis() + delayMs;
}

void AppController::scheduleNextSend(unsigned long delayMs) {
  nextSendAt_ = millis() + delayMs;
}

void AppController::publishSnapshotToStatus(const MetricSnapshot &snapshot) {
  status_.lastSensorError = "";
  status_.lastSensorFallbackUsed = snapshot.fallbackUsed;
  status_.sensorReadingAvailable = true;
  status_.lastTemperature = snapshot.temperature;
  status_.lastHumidity = snapshot.humidity;
  status_.lastSensorReadAtMs = snapshot.readAtMs;
}
