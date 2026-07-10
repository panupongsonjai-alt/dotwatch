#pragma once

#include <Arduino.h>
#include <Preferences.h>
#include "AppTypes.h"

class ConfigStore {
 public:
  bool load(DeviceConfig &config);
  bool save(const DeviceConfig &config);

  void clearAll();
  void clearWiFi(DeviceConfig &config);

  bool hasRequiredConfig(const DeviceConfig &config) const;
  bool hasDeviceCredentials(const DeviceConfig &config) const;

  bool stageWiFi(DeviceConfig &config,
                 const String &ssid,
                 const String &password,
                 bool keepBackups);
  bool promotePendingWiFi(DeviceConfig &config);
  bool discardPendingWiFi(DeviceConfig &config);

  int loadWiFiProfiles(const DeviceConfig &config,
                       WiFiProfile profiles[],
                       int maxProfiles);
  bool saveWiFiProfiles(WiFiProfile profiles[], int count);
  bool rememberWiFiProfile(const DeviceConfig &config,
                           const String &ssid,
                           const String &password,
                           bool makePrimary,
                           bool keepBackups = true);
  int knownWiFiProfileCount(const DeviceConfig &config);
  String knownWiFiProfileSummary(const DeviceConfig &config);

 private:
  int appendProfile(WiFiProfile profiles[],
                    int count,
                    int maxProfiles,
                    String ssid,
                    String password,
                    bool primary);
  bool writeSchemaVersion(uint16_t version);
};
