#pragma once

#include <Arduino.h>
#include <WiFiClient.h>
#include "AppTypes.h"

class TimeService;

class BackendClient {
 public:
  void begin(DeviceConfig &config,
             RuntimeStatus &status,
             TimeService &timeService);

  bool postIngest(const MetricSnapshot &snapshot);

  bool hasPortalCa() const;
  bool hasEmbeddedCa() const;
  bool hasEffectiveCa() const;
  const char *effectiveCa() const;
  String tlsCaSourceText() const;
  String tlsModeText() const;

 private:
  bool performHttpPost(WiFiClient &client,
                       const String &endpoint,
                       const String &body);
  void recordSuccess(int httpStatus);
  void recordFailure(int httpStatus, const String &error);

  DeviceConfig *config_ = nullptr;
  RuntimeStatus *status_ = nullptr;
  TimeService *timeService_ = nullptr;
};
