#pragma once

#include <Arduino.h>
#include <DHT.h>
#include "AppTypes.h"

class SensorManager {
 public:
  ~SensorManager();

  void begin(const DeviceConfig &config);
  void reconfigure(const DeviceConfig &config);
  bool read(MetricSnapshot &snapshot, const DeviceConfig &config);

  String profileName(const DeviceConfig &config) const;

 private:
  void createSensor(const DeviceConfig &config);

  DHT *dht_ = nullptr;
  int activePin_ = -1;
  int activeType_ = 0;
};
