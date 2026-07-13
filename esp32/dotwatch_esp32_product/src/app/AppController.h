#pragma once

#include <Arduino.h>
#include "AppTypes.h"
#include "backend/BackendClient.h"
#include "config/ConfigStore.h"
#include "display/TftDisplay.h"
#include "network/TimeService.h"
#include "network/WiFiManager.h"
#include "ota/OtaManager.h"
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
  void serviceWiFi();
  void serviceSensor();
  void serviceTelemetry();
  bool sensorSampleDue(unsigned long now) const;
  bool sendDue(unsigned long now) const;
  void scheduleNextSensorSample(unsigned long delayMs);
  void scheduleNextSend(unsigned long delayMs);
  void publishSnapshotToStatus(const MetricSnapshot &snapshot);

  DeviceConfig config_;
  RuntimeStatus status_;

  ConfigStore configStore_;
  WiFiManager wifiManager_;
  TimeService timeService_;
  SensorManager sensorManager_;
  TftDisplay tftDisplay_;
  BackendClient backendClient_;
  OtaManager otaManager_;
  PortalServer portalServer_;
  StatusLed statusLed_;
  RecoveryManager recoveryManager_;

  MetricSnapshot latestSnapshot_;
  bool hasLatestSnapshot_ = false;

  unsigned long lastWiFiRetryAt_ = 0;
  unsigned long nextSensorSampleAt_ = 0;
  unsigned long nextSendAt_ = 0;
};
