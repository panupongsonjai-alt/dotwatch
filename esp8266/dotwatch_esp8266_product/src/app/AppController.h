#pragma once

#include <Arduino.h>
#include "AppTypes.h"
#include "backend/BackendClient.h"
#include "config/ConfigStore.h"
#include "network/TimeService.h"
#include "network/WiFiManager.h"
#include "portal/PortalServer.h"
#include "recovery/RecoveryManager.h"
#include "sensors/SensorManager.h"
#include "status/StatusLed.h"

class AppController {
 public:
  void begin();
  void loop();

 private:
  void printBootBanner();
  void setState(AppState state);
  void updateConnectivityStatus();
  void serviceProvisioningButton();
  void serviceProvisioningLifecycle();
  void serviceWiFi();
  void serviceTelemetry();
  bool sendDue(unsigned long now) const;
  void scheduleNextSend(unsigned long delayMs);

  DeviceConfig config_;
  RuntimeStatus status_;

  ConfigStore configStore_;
  WiFiManager wifiManager_;
  TimeService timeService_;
  SensorManager sensorManager_;
  BackendClient backendClient_;
  PortalServer portalServer_;
  StatusLed statusLed_;
  RecoveryManager recoveryManager_;

  unsigned long lastWiFiRetryAt_ = 0;
  unsigned long provisioningButtonPressedAt_ = 0;
  bool provisioningButtonTriggered_ = false;
  unsigned long nextSendAt_ = 0;
};
