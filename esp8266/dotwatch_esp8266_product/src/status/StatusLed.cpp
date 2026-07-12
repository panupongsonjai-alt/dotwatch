#include "status/StatusLed.h"

#include "ProductConfig.h"

void StatusLed::begin() {
  pinMode(ProductConfig::STATUS_LED_PIN, OUTPUT);
  set(false);
}

void StatusLed::tick(const RuntimeStatus &status) {
  switch (status.state) {
    case AppState::SETUP_PORTAL:
    case AppState::UNPROVISIONED:
      blink(250);
      return;

    case AppState::CONNECTING_WIFI:
      blink(1000);
      return;

    case AppState::CONNECTING_BACKEND:
      blink(500);
      return;

    case AppState::ONLINE:
      set(true);
      return;

    case AppState::DEGRADED:
      blink(700);
      return;

    case AppState::RECOVERY:
      blink(150);
      return;

    case AppState::UPDATING:
      blink(100);
      return;

    case AppState::BOOTING:
    default:
      blink(350);
      return;
  }
}

void StatusLed::set(bool on) {
  const bool electricalHigh = ProductConfig::STATUS_LED_ACTIVE_LOW ? !on : on;
  digitalWrite(ProductConfig::STATUS_LED_PIN, electricalHigh ? HIGH : LOW);
  ledState_ = on;
}

void StatusLed::blink(unsigned long intervalMs) {
  if (millis() - lastToggleAt_ < intervalMs) return;
  lastToggleAt_ = millis();
  set(!ledState_);
}
