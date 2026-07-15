#include "app/AppController.h"

#include <ESP8266WiFi.h>

#include "FirmwareVersion.h"
#include "ProductConfig.h"
#include "utils/StringUtils.h"

void AppController::begin() {
  Serial.begin(115200);
  delay(350);
  randomSeed(ESP.getCycleCount() ^ ESP.getChipId() ^ micros());

  printBootBanner();
  setState(AppState::BOOTING);

  statusLed_.begin();
  configStore_.load(config_);
  sensorManager_.begin(config_);
  wifiManager_.begin(config_, configStore_);
  backendClient_.begin(config_, status_, timeService_);
  recoveryManager_.begin(configStore_, status_);
  portalServer_.begin(
      config_,
      status_,
      configStore_,
      wifiManager_,
      sensorManager_,
      backendClient_);

  setState(AppState::CONNECTING_WIFI);
  const bool wifiConnected = wifiManager_.connectWithRollback(false);
  status_.wifiConnected = wifiConnected;

  if (wifiConnected) {
    timeService_.sync();
  }

  const bool configReady = configStore_.hasRequiredConfig(config_);
  if (!configReady) {
    setState(AppState::UNPROVISIONED);
    portalServer_.startSetupPortal(true);
    setState(AppState::SETUP_PORTAL);
  } else {
    // A configured device no longer exposes a fleet-wide recovery AP merely
    // because Wi-Fi is unavailable. Hold the hardware button for 2 seconds to
    // open the time-limited provisioning AP deliberately.
    portalServer_.startLocalAdmin();
    setState(wifiConnected
                 ? AppState::CONNECTING_BACKEND
                 : AppState::CONNECTING_WIFI);
  }

  scheduleNextSend(ProductConfig::FIRST_SEND_DELAY_MS);
}

void AppController::loop() {
  updateConnectivityStatus();
  serviceProvisioningButton();

  recoveryManager_.tick(
      portalServer_.isSetupMode(),
      status_.wifiConnected,
      configStore_.hasRequiredConfig(config_));

  portalServer_.loop();
  serviceProvisioningLifecycle();
  serviceWiFi();
  serviceTelemetry();
  statusLed_.tick(status_);

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
  Serial.println("Architecture: ESP8266 modular product core");
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

void AppController::serviceProvisioningButton() {
  const bool pressed =
      digitalRead(ProductConfig::RESET_BUTTON_PIN) == LOW;

  if (!pressed) {
    provisioningButtonPressedAt_ = 0;
    provisioningButtonTriggered_ = false;
    return;
  }

  if (provisioningButtonPressedAt_ == 0) {
    provisioningButtonPressedAt_ = millis();
    return;
  }

  if (provisioningButtonTriggered_ || portalServer_.isSetupMode()) return;
  if (millis() - provisioningButtonPressedAt_ <
      ProductConfig::SETUP_BUTTON_HOLD_MS) {
    return;
  }

  provisioningButtonTriggered_ = true;
  Serial.println("AppController: FLASH short hold opened provisioning portal");
  portalServer_.startSetupPortal(false);
  setState(AppState::SETUP_PORTAL);
}

void AppController::serviceProvisioningLifecycle() {
  const bool configReady = configStore_.hasRequiredConfig(config_);

  if (portalServer_.shouldAutoCloseWhenReady() &&
      status_.wifiConnected && configReady) {
    Serial.println("AppController: commissioning complete; closing setup AP");
    portalServer_.stopSetupPortal();
    setState(AppState::CONNECTING_BACKEND);
    scheduleNextSend(500UL);
    return;
  }

  if (!portalServer_.isSetupMode() &&
      status_.state == AppState::SETUP_PORTAL) {
    setState(status_.wifiConnected
                 ? AppState::CONNECTING_BACKEND
                 : AppState::CONNECTING_WIFI);
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

void AppController::serviceTelemetry() {
  if (!status_.wifiConnected) return;
  if (!configStore_.hasRequiredConfig(config_)) return;

  const unsigned long now = millis();
  if (!sendDue(now)) return;
  scheduleNextSend(config_.sendIntervalMs);

  MetricSnapshot snapshot;
  if (!sensorManager_.read(snapshot, config_)) {
    status_.lastSensorError = "DHT read failed";
    status_.lastSensorFallbackUsed = false;
    status_.lastSendStatus = "error";
    status_.lastSendError = "DHT read failed";
    status_.totalSendFail++;
    setState(AppState::DEGRADED);
    Serial.println("SensorManager: DHT read failed; telemetry not sent");
    return;
  }

  status_.lastSensorError = "";
  status_.lastSensorFallbackUsed = snapshot.fallbackUsed;
  status_.sensorReadingAvailable = true;
  status_.lastTemperature = snapshot.temperature;
  status_.lastHumidity = snapshot.humidity;
  status_.lastSensorReadAtMs = snapshot.readAtMs;

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

bool AppController::sendDue(unsigned long now) const {
  return static_cast<long>(now - nextSendAt_) >= 0;
}

void AppController::scheduleNextSend(unsigned long delayMs) {
  nextSendAt_ = millis() + delayMs;
}
