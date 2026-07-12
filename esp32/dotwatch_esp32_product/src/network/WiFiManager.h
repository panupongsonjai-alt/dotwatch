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

  // First-IP lock status used by the web portal and /json endpoint.
  String currentIpMode() const;
  String lockedIp() const;
  bool forgetCurrentIpLease();

 private:
  bool connectRemembered(bool keepAccessPoint);
  bool connectSingle(const String &ssid,
                     const String &password,
                     unsigned long timeoutMs,
                     bool keepAccessPoint);
  bool waitForConnection(unsigned long timeoutMs);
  bool enableDhcp();
  bool applyIpLease(const WiFiIpLease &lease);
  bool learnFirstIp(const String &ssid);
  bool parseIp(const String &text, IPAddress &result) const;
  bool isUsableHostIp(const IPAddress &address) const;
  bool isUsableSubnet(const IPAddress &address) const;
  void resetIpRuntimeState();
  void sortProfiles(WiFiProfile profiles[], int count);
  bool profileIsRemembered(const String &ssid);
  String deviceSuffix() const;

  DeviceConfig *config_ = nullptr;
  ConfigStore *store_ = nullptr;
  bool accessPointActive_ = false;

  bool usingFixedIp_ = false;
  bool learnedIpThisConnection_ = false;
  bool usingDhcpFallback_ = false;
  String activeLockedIp_;
  String activeLeaseSsid_;
};
