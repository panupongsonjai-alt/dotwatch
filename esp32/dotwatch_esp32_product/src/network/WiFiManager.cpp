#include "network/WiFiManager.h"

#include "ProductConfig.h"
#include "config/ConfigStore.h"

void WiFiManager::begin(DeviceConfig &config, ConfigStore &store) {
  config_ = &config;
  store_ = &store;

  WiFi.persistent(false);
  WiFi.setAutoReconnect(true);
  WiFi.setSleep(false);
}

bool WiFiManager::connectWithRollback(bool keepAccessPoint) {
  if (config_ == nullptr || store_ == nullptr) return false;

  if (config_->hasPendingWifi && config_->pendingWifiSsid.length() > 0) {
    Serial.print("WiFiManager: testing pending Wi-Fi: ");
    Serial.println(config_->pendingWifiSsid);

    const bool pendingConnected = connectSingle(
        config_->pendingWifiSsid,
        config_->pendingWifiPassword,
        ProductConfig::WIFI_PROFILE_ATTEMPT_TIMEOUT_MS,
        keepAccessPoint);

    if (pendingConnected) {
      Serial.println("WiFiManager: pending Wi-Fi succeeded; promoting to active");
      if (!store_->promotePendingWiFi(*config_)) {
        Serial.println("WiFiManager: warning - unable to persist promoted Wi-Fi");
      }
      return true;
    }

    Serial.println("WiFiManager: pending Wi-Fi failed; rolling back to active profile");
    store_->discardPendingWiFi(*config_);
  }

  return connectRemembered(keepAccessPoint);
}

bool WiFiManager::reconnect(bool keepAccessPoint) {
  if (isConnected()) return true;
  return connectWithRollback(keepAccessPoint);
}

bool WiFiManager::isConnected() const {
  return WiFi.status() == WL_CONNECTED;
}

bool WiFiManager::startSetupAccessPoint() {
  if (accessPointActive_) return true;

  WiFi.mode(WIFI_AP_STA);
  const bool started = WiFi.softAP(
      setupSsid().c_str(),
      ProductConfig::SETUP_AP_PASSWORD);

  accessPointActive_ = started;
  if (started) {
    Serial.print("Setup AP started. SSID=");
    Serial.println(setupSsid());
    Serial.print("Setup AP URL: http://");
    Serial.println(WiFi.softAPIP());
  } else {
    Serial.println("WiFiManager: failed to start setup AP");
  }
  return started;
}

void WiFiManager::stopSetupAccessPoint() {
  if (!accessPointActive_) return;
  WiFi.softAPdisconnect(true);
  accessPointActive_ = false;
  if (isConnected()) WiFi.mode(WIFI_STA);
}

bool WiFiManager::isAccessPointActive() const {
  return accessPointActive_;
}

int WiFiManager::scan(ScannedNetwork results[], int maxResults) {
  if (results == nullptr || maxResults <= 0) return 0;

  const int networkCount = WiFi.scanNetworks(false, true);
  int resultCount = 0;

  if (networkCount > 0) {
    for (int networkIndex = 0; networkIndex < networkCount; networkIndex++) {
      String ssid = WiFi.SSID(networkIndex);
      ssid.trim();
      if (ssid.length() == 0) continue;

      const int rssi = WiFi.RSSI(networkIndex);
      const bool secure = WiFi.encryptionType(networkIndex) != WIFI_AUTH_OPEN;

      int existingIndex = -1;
      for (int resultIndex = 0; resultIndex < resultCount; resultIndex++) {
        if (results[resultIndex].ssid == ssid) {
          existingIndex = resultIndex;
          break;
        }
      }

      if (existingIndex >= 0) {
        if (rssi > results[existingIndex].rssi) {
          results[existingIndex].rssi = rssi;
          results[existingIndex].secure = secure;
        }
        continue;
      }

      if (resultCount >= maxResults) continue;

      results[resultCount].ssid = ssid;
      results[resultCount].rssi = rssi;
      results[resultCount].secure = secure;
      results[resultCount].current = isConnected() && WiFi.SSID() == ssid;
      results[resultCount].remembered = profileIsRemembered(ssid);
      resultCount++;
    }
  }

  WiFi.scanDelete();

  for (int first = 0; first < resultCount - 1; first++) {
    for (int second = first + 1; second < resultCount; second++) {
      if (results[second].rssi > results[first].rssi) {
        const ScannedNetwork temporary = results[first];
        results[first] = results[second];
        results[second] = temporary;
      }
    }
  }

  return resultCount;
}

String WiFiManager::setupSsid() const {
  return String(ProductConfig::SETUP_AP_PREFIX) + "-" + deviceSuffix();
}

String WiFiManager::setupPassword() const {
  return ProductConfig::SETUP_AP_PASSWORD;
}

String WiFiManager::currentSsid() const {
  if (isConnected()) return WiFi.SSID();
  if (config_ != nullptr) return config_->wifiSsid;
  return "";
}

String WiFiManager::currentIp() const {
  if (isConnected()) return WiFi.localIP().toString();
  if (accessPointActive_) return WiFi.softAPIP().toString();
  return "0.0.0.0";
}

int WiFiManager::currentRssi() const {
  return isConnected() ? WiFi.RSSI() : 0;
}

bool WiFiManager::connectRemembered(bool keepAccessPoint) {
  if (config_ == nullptr || store_ == nullptr) return false;
  if (isConnected()) return true;

  WiFiProfile profiles[ProductConfig::WIFI_PROFILE_MAX];
  const int profileCount = store_->loadWiFiProfiles(
      *config_, profiles, ProductConfig::WIFI_PROFILE_MAX);
  if (profileCount == 0) {
    Serial.println("WiFiManager: no remembered Wi-Fi profiles");
    return false;
  }

  WiFi.mode(keepAccessPoint || accessPointActive_ ? WIFI_AP_STA : WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.setSleep(false);

  Serial.println("WiFiManager: scanning remembered Wi-Fi networks");
  const int networkCount = WiFi.scanNetworks(false, true);
  if (networkCount > 0) {
    for (int profileIndex = 0; profileIndex < profileCount; profileIndex++) {
      profiles[profileIndex].rssi = -999;
    }

    for (int networkIndex = 0; networkIndex < networkCount; networkIndex++) {
      const String foundSsid = WiFi.SSID(networkIndex);
      const int foundRssi = WiFi.RSSI(networkIndex);
      for (int profileIndex = 0; profileIndex < profileCount; profileIndex++) {
        if (profiles[profileIndex].ssid == foundSsid &&
            foundRssi > profiles[profileIndex].rssi) {
          profiles[profileIndex].rssi = foundRssi;
        }
      }
    }
  }
  WiFi.scanDelete();

  sortProfiles(profiles, profileCount);

  const unsigned long startedAt = millis();
  for (int profileIndex = 0; profileIndex < profileCount; profileIndex++) {
    if (millis() - startedAt > ProductConfig::WIFI_CONNECT_TOTAL_TIMEOUT_MS) {
      Serial.println("WiFiManager: total connection timeout");
      break;
    }

    // If a scan found networks, skip invisible backup networks. The primary
    // remains eligible because hidden SSIDs may not appear in scans.
    if (networkCount > 0 &&
        profiles[profileIndex].rssi == -999 &&
        !profiles[profileIndex].primary) {
      continue;
    }

    Serial.print("WiFiManager: connecting to ");
    Serial.print(profiles[profileIndex].ssid);
    Serial.print(profiles[profileIndex].primary ? " [primary]" : " [backup]");
    if (profiles[profileIndex].rssi > -999) {
      Serial.print(" RSSI=");
      Serial.print(profiles[profileIndex].rssi);
    }
    Serial.println();

    if (connectSingle(
            profiles[profileIndex].ssid,
            profiles[profileIndex].password,
            ProductConfig::WIFI_PROFILE_ATTEMPT_TIMEOUT_MS,
            keepAccessPoint)) {
      Serial.print("WiFiManager: connected. IP=");
      Serial.println(WiFi.localIP());
      return true;
    }
  }

  Serial.println("WiFiManager: all remembered Wi-Fi attempts failed");
  return false;
}

bool WiFiManager::connectSingle(const String &ssid,
                                const String &password,
                                unsigned long timeoutMs,
                                bool keepAccessPoint) {
  if (ssid.length() == 0 || store_ == nullptr) return false;

  resetIpRuntimeState();
  if (!resetStationForConnection(keepAccessPoint)) {
    Serial.println("WiFiManager: unable to prepare station interface");
    return false;
  }

  WiFiIpLease savedLease;
  const bool hasSavedLease =
      ProductConfig::WIFI_REMEMBER_FIRST_IP &&
      store_->loadWiFiIpLease(ssid, savedLease);

  bool fixedConfigurationReady = false;
  if (hasSavedLease) {
    Serial.print("WiFiManager: applying remembered first IP ");
    Serial.print(savedLease.localIp);
    Serial.print(" for ");
    Serial.println(ssid);
    fixedConfigurationReady = applyIpLease(savedLease);
    if (!fixedConfigurationReady) {
      Serial.println("WiFiManager: remembered IP is invalid; clearing it and using DHCP");
      if (!store_->forgetWiFiIpLease(ssid)) {
        Serial.println("WiFiManager: warning - invalid remembered IP could not be removed");
      }
    }
  }

  if (!fixedConfigurationReady) {
    enableDhcp();
  }

  WiFi.begin(ssid.c_str(), password.c_str());
  if (waitForConnection(timeoutMs)) {
    if (fixedConfigurationReady) {
      usingFixedIp_ = true;
      activeLockedIp_ = savedLease.localIp;
      activeLeaseSsid_ = ssid;
      Serial.print("WiFiManager: connected with fixed first IP ");
      Serial.println(WiFi.localIP());
    } else if (ProductConfig::WIFI_REMEMBER_FIRST_IP) {
      learnFirstIp(ssid);
    }
    WiFi.setAutoReconnect(true);
    return true;
  }

  if (!fixedConfigurationReady) return false;

  // Safety recovery: if a remembered address no longer works (router, lease
  // or network changed), reconnect with DHCP so the device stays reachable.
  Serial.println(
      "WiFiManager: fixed first IP connection failed; resetting STA and retrying with DHCP");

  // Arduino-ESP32 2.0.17 keeps the previous static configuration in the
  // station interface. Fully disable and recreate STA before enabling DHCP,
  // otherwise reconnecting can remain stuck on the old address.
  if (!resetStationForConnection(keepAccessPoint)) {
    Serial.println("WiFiManager: unable to reset station for DHCP recovery");
    return false;
  }
  if (!enableDhcp()) {
    Serial.println("WiFiManager: unable to restore DHCP mode");
    return false;
  }

  WiFi.begin(ssid.c_str(), password.c_str());
  if (!waitForConnection(ProductConfig::WIFI_DHCP_RECOVERY_TIMEOUT_MS)) {
    Serial.println("WiFiManager: DHCP recovery failed");
    return false;
  }

  usingDhcpFallback_ = true;
  activeLockedIp_ = savedLease.localIp;
  activeLeaseSsid_ = ssid;
  Serial.print("WiFiManager: DHCP recovery connected. Current IP=");
  Serial.print(WiFi.localIP());
  Serial.print(" Previous locked IP=");
  Serial.println(activeLockedIp_);

  // The remembered address did not produce a usable connection. Replace it
  // with the address that DHCP has just confirmed as usable. This prevents an
  // endless static-fail/setup-portal loop on every restart.
  if (!store_->forgetWiFiIpLease(ssid)) {
    Serial.println("WiFiManager: warning - previous locked IP could not be removed");
  }
  if (learnFirstIp(ssid)) {
    Serial.println("WiFiManager: DHCP recovery IP replaced the failed locked IP");
  } else {
    Serial.println("WiFiManager: warning - DHCP recovery IP was not persisted");
  }
  WiFi.setAutoReconnect(true);
  return true;
}

bool WiFiManager::waitForConnection(unsigned long timeoutMs) {
  const unsigned long startedAt = millis();
  bool reportedInvalidAddress = false;

  while (millis() - startedAt < timeoutMs) {
    if (WiFi.status() == WL_CONNECTED) {
      const IPAddress address = WiFi.localIP();
      if (isUsableHostIp(address)) {
        Serial.println();
        return true;
      }

      // WL_CONNECTED means association completed, but DHCP may still be
      // negotiating. Never accept 0.0.0.0 or 255.255.255.255 as a usable IP.
      if (!reportedInvalidAddress) {
        Serial.print("WiFiManager: associated; waiting for usable IP (current=");
        Serial.print(address);
        Serial.println(")");
        reportedInvalidAddress = true;
      }
    }

    delay(250);
    Serial.print(".");
  }

  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFiManager: connection has no usable IP. Current=");
    Serial.println(WiFi.localIP());
  }
  return false;
}

bool WiFiManager::resetStationForConnection(bool keepAccessPoint) {
  const bool preserveAccessPoint = keepAccessPoint || accessPointActive_;

  WiFi.setAutoReconnect(false);

  // wifioff=true disables only STA when the device is in AP+STA mode. This
  // clears the previous station/IP runtime state without erasing credentials.
  WiFi.disconnect(true, false);
  delay(250);

  const wifi_mode_t targetMode =
      preserveAccessPoint ? WIFI_AP_STA : WIFI_STA;
  if (!WiFi.mode(targetMode)) {
    Serial.println("WiFiManager: failed to restore Wi-Fi mode");
    return false;
  }

  WiFi.setSleep(false);
  delay(150);
  return true;
}

bool WiFiManager::enableDhcp() {
  // Arduino-ESP32 2.0.17 starts the DHCP client when the requested local IP
  // is 0.0.0.0. INADDR_NONE is 255.255.255.255 in this core and must not be
  // used here; doing so reproduces the invalid address seen in the serial log.
  // Pass all five fields explicitly so default INADDR_NONE DNS arguments are
  // not applied by WiFi.config().
  const IPAddress automaticIp(0, 0, 0, 0);
  const bool configured = WiFi.config(
      automaticIp, automaticIp, automaticIp, automaticIp, automaticIp);
  if (!configured) {
    Serial.println("WiFiManager: DHCP configuration request failed");
  } else {
    Serial.println("WiFiManager: DHCP client enabled with 0.0.0.0 configuration");
  }
  return configured;
}

bool WiFiManager::applyIpLease(const WiFiIpLease &lease) {
  IPAddress localIp;
  IPAddress gateway;
  IPAddress subnet;
  IPAddress dns1;
  IPAddress dns2;

  if (!parseIp(lease.localIp, localIp) ||
      !parseIp(lease.gateway, gateway) ||
      !parseIp(lease.subnet, subnet) ||
      !isUsableHostIp(localIp) ||
      !isUsableHostIp(gateway) ||
      !isUsableSubnet(subnet)) {
    return false;
  }

  if (!parseIp(lease.dns1, dns1) || !isUsableHostIp(dns1)) dns1 = gateway;
  if (!parseIp(lease.dns2, dns2) || !isUsableHostIp(dns2)) {
    dns2 = IPAddress(0, 0, 0, 0);
  }

  return WiFi.config(localIp, gateway, subnet, dns1, dns2);
}

bool WiFiManager::learnFirstIp(const String &ssid) {
  if (store_ == nullptr || !isConnected()) return false;

  WiFiIpLease lease;
  lease.ssid = ssid;
  lease.localIp = WiFi.localIP().toString();
  lease.gateway = WiFi.gatewayIP().toString();
  lease.subnet = WiFi.subnetMask().toString();
  lease.dns1 = WiFi.dnsIP(0).toString();
  lease.dns2 = WiFi.dnsIP(1).toString();

  IPAddress localIp;
  IPAddress gateway;
  IPAddress subnet;
  if (!parseIp(lease.localIp, localIp) ||
      !parseIp(lease.gateway, gateway) ||
      !parseIp(lease.subnet, subnet) ||
      !isUsableHostIp(localIp) ||
      !isUsableHostIp(gateway) ||
      !isUsableSubnet(subnet)) {
    Serial.print("WiFiManager: DHCP values are incomplete or invalid; IP not locked. local=");
    Serial.print(lease.localIp);
    Serial.print(" gateway=");
    Serial.print(lease.gateway);
    Serial.print(" subnet=");
    Serial.println(lease.subnet);
    return false;
  }

  if (!store_->rememberWiFiIpLease(lease)) {
    Serial.println("WiFiManager: unable to persist first IP lease");
    return false;
  }

  learnedIpThisConnection_ = true;
  activeLockedIp_ = lease.localIp;
  activeLeaseSsid_ = ssid;
  Serial.print("WiFiManager: remembered first IP ");
  Serial.print(lease.localIp);
  Serial.print(" for SSID ");
  Serial.println(ssid);
  Serial.println("WiFiManager: this IP will be static after the next restart");
  return true;
}

bool WiFiManager::parseIp(const String &text, IPAddress &result) const {
  String cleaned = text;
  cleaned.trim();
  if (cleaned.length() == 0) return false;
  return result.fromString(cleaned);
}

bool WiFiManager::isUsableHostIp(const IPAddress &address) const {
  if (address == IPAddress(0, 0, 0, 0) ||
      address == IPAddress(255, 255, 255, 255)) {
    return false;
  }

  const uint8_t first = address[0];
  if (first == 0 || first == 127 || first >= 224) return false;
  return true;
}

bool WiFiManager::isUsableSubnet(const IPAddress &address) const {
  return address != IPAddress(0, 0, 0, 0) &&
         address != IPAddress(255, 255, 255, 255);
}

void WiFiManager::resetIpRuntimeState() {
  usingFixedIp_ = false;
  learnedIpThisConnection_ = false;
  usingDhcpFallback_ = false;
  activeLockedIp_ = "";
  activeLeaseSsid_ = "";
}

String WiFiManager::currentIpMode() const {
  if (usingDhcpFallback_) return "DHCP recovery";
  if (usingFixedIp_) return "Fixed from first connection";
  if (learnedIpThisConnection_) return "First IP learned";
  if (ProductConfig::WIFI_REMEMBER_FIRST_IP) return "DHCP learning";
  return "DHCP";
}

String WiFiManager::lockedIp() const {
  if (activeLockedIp_.length() > 0) return activeLockedIp_;
  if (store_ == nullptr) return "—";

  const String ssid = currentSsid();
  WiFiIpLease lease;
  if (store_->loadWiFiIpLease(ssid, lease)) return lease.localIp;
  return "ยังไม่เรียนรู้";
}

bool WiFiManager::forgetCurrentIpLease() {
  if (store_ == nullptr) return false;
  String ssid = currentSsid();
  if (ssid.length() == 0 && config_ != nullptr) ssid = config_->wifiSsid;
  ssid.trim();
  if (ssid.length() == 0) return false;

  const bool forgotten = store_->forgetWiFiIpLease(ssid);
  if (forgotten) resetIpRuntimeState();
  return forgotten;
}

void WiFiManager::sortProfiles(WiFiProfile profiles[], int count) {
  for (int first = 0; first < count - 1; first++) {
    for (int second = first + 1; second < count; second++) {
      bool swapNeeded = false;
      if (profiles[first].primary != profiles[second].primary) {
        swapNeeded = profiles[second].primary;
      } else if (profiles[second].rssi > profiles[first].rssi) {
        swapNeeded = true;
      } else if (profiles[first].rssi == -999 && profiles[second].rssi > -999) {
        swapNeeded = true;
      }

      if (swapNeeded) {
        const WiFiProfile temporary = profiles[first];
        profiles[first] = profiles[second];
        profiles[second] = temporary;
      }
    }
  }
}

bool WiFiManager::profileIsRemembered(const String &ssid) {
  if (config_ == nullptr || store_ == nullptr) return false;
  WiFiProfile profiles[ProductConfig::WIFI_PROFILE_MAX];
  const int profileCount = store_->loadWiFiProfiles(
      *config_, profiles, ProductConfig::WIFI_PROFILE_MAX);
  for (int index = 0; index < profileCount; index++) {
    if (profiles[index].ssid == ssid) return true;
  }
  return false;
}

String WiFiManager::deviceSuffix() const {
  String mac = WiFi.macAddress();
  mac.replace(":", "");
  mac.toUpperCase();
  if (mac.length() >= 6) return mac.substring(mac.length() - 6);
  return "ESP32";
}
