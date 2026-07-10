#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include "AppTypes.h"

class ConfigStore;

class WiFiManager {
 public:
  void begin(DeviceConfig &config, ConfigStore &store);

  bool connectWithRollback(bool keepAccessPoint);
  bool reconnect(bool keepAccessPoint);
  bool isConnected() const;

  bool startSetupAccessPoint();
  void stopSetupAccessPoint();
  bool isAccessPointActive() const;

  int scan(ScannedNetwork results[], int maxResults);

  String setupSsid() const;
  String setupPassword() const;
  String currentSsid() const;
  String currentIp() const;
  int currentRssi() const;

 private:
  bool connectRemembered(bool keepAccessPoint);
  bool connectSingle(const String &ssid,
                     const String &password,
                     unsigned long timeoutMs,
                     bool keepAccessPoint);
  void sortProfiles(WiFiProfile profiles[], int count);
  bool profileIsRemembered(const String &ssid);
  String deviceSuffix() const;

  DeviceConfig *config_ = nullptr;
  ConfigStore *store_ = nullptr;
  bool accessPointActive_ = false;
};
