#pragma once

#include <Arduino.h>
#include "AppTypes.h"

class ConfigStore;

class RecoveryManager {
 public:
  void begin(ConfigStore &store, RuntimeStatus &status);
  void tick(bool portalMode, bool wifiConnected, bool configReady);

 private:
  void checkResetButton();
  void checkSelfRecovery(bool portalMode,
                         bool wifiConnected,
                         bool configReady);
  void restartWithReason(const String &reason);

  ConfigStore *store_ = nullptr;
  RuntimeStatus *status_ = nullptr;
  unsigned long resetButtonPressedAt_ = 0;
  unsigned long wifiDisconnectedSince_ = 0;
  unsigned long bootAt_ = 0;
};
