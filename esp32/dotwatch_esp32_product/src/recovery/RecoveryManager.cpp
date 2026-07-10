#include "recovery/RecoveryManager.h"

#include "ProductConfig.h"
#include "config/ConfigStore.h"

void RecoveryManager::begin(ConfigStore &store, RuntimeStatus &status) {
  store_ = &store;
  status_ = &status;
  bootAt_ = millis();
  pinMode(ProductConfig::RESET_BUTTON_PIN, INPUT_PULLUP);
}

void RecoveryManager::tick(bool portalMode,
                           bool wifiConnected,
                           bool configReady) {
  checkResetButton();
  checkSelfRecovery(portalMode, wifiConnected, configReady);
}

void RecoveryManager::checkResetButton() {
  const bool pressed =
      digitalRead(ProductConfig::RESET_BUTTON_PIN) == LOW;

  if (pressed && resetButtonPressedAt_ == 0) {
    resetButtonPressedAt_ = millis();
    Serial.println("RecoveryManager: hold BOOT for 6 seconds to factory reset");
  }

  if (!pressed) {
    resetButtonPressedAt_ = 0;
    return;
  }

  if (resetButtonPressedAt_ > 0 &&
      millis() - resetButtonPressedAt_ >= ProductConfig::RESET_HOLD_MS) {
    if (status_ != nullptr) status_->state = AppState::RECOVERY;
    Serial.println("RecoveryManager: factory reset requested by BOOT button");
    if (store_ != nullptr) store_->clearAll();
    delay(500);
    ESP.restart();
  }
}

void RecoveryManager::checkSelfRecovery(bool portalMode,
                                        bool wifiConnected,
                                        bool configReady) {
  const unsigned long now = millis();

  if (!wifiConnected) {
    if (wifiDisconnectedSince_ == 0) wifiDisconnectedSince_ = now;

    if (!portalMode &&
        configReady &&
        now - wifiDisconnectedSince_ > ProductConfig::WIFI_RESTART_AFTER_MS) {
      restartWithReason("Wi-Fi disconnected for too long");
    }
    return;
  }

  wifiDisconnectedSince_ = 0;

  if (portalMode || !configReady || status_ == nullptr) return;

  if (status_->lastSuccessfulSendAt > 0 &&
      now - status_->lastSuccessfulSendAt >
          ProductConfig::SEND_RESTART_AFTER_MS) {
    restartWithReason("No successful backend send for too long");
  }

  // If the unit has never completed one send after a long healthy Wi-Fi
  // session, restart once to recover from a stuck HTTP/TLS state.
  if (status_->lastSuccessfulSendAt == 0 &&
      now - bootAt_ > ProductConfig::SEND_RESTART_AFTER_MS) {
    restartWithReason("No successful backend send since boot");
  }
}

void RecoveryManager::restartWithReason(const String &reason) {
  if (status_ != nullptr) status_->state = AppState::RECOVERY;
  Serial.print("RecoveryManager: restarting. Reason: ");
  Serial.println(reason);
  delay(300);
  ESP.restart();
}
