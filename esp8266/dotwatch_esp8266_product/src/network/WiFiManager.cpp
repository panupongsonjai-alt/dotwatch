#include "network/WiFiManager.h"

#include "ProductConfig.h"
#include "config/ConfigStore.h"

void WiFiManager::begin(DeviceConfig &config, ConfigStore &store) {
  config_ = &config;
  store_ = &store;

  WiFi.persistent(false);
  WiFi.setAutoReconnect(true);
  WiFi.setSleepMode(WIFI_NONE_SLEEP);
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
  const String password = setupPassword();
  if (password.length() < 8) {
    Serial.println("WiFiManager: setup AP password is missing or too short");
    return false;
  }

  const bool started = WiFi.softAP(
      setupSsid().c_str(),
      password.c_str());

  accessPointActive_ = started;
  if (started) {
    Serial.print("Setup AP started. SSID=");
    Serial.println(setupSsid());
    Serial.print("Setup AP password: ");
    Serial.println(password);
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
      const bool secure = WiFi.encryptionType(networkIndex) != ENC_TYPE_NONE;

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
  return config_ != nullptr ? config_->setupApPassword : String();
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
  WiFi.setSleepMode(WIFI_NONE_SLEEP);

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
  if (ssid.length() == 0) return false;

  WiFi.mode(keepAccessPoint || accessPointActive_ ? WIFI_AP_STA : WIFI_STA);
  WiFi.disconnect(false);
  delay(150);
  WiFi.begin(ssid.c_str(), password.c_str());

  const unsigned long startedAt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startedAt < timeoutMs) {
    delay(250);
    Serial.print(".");
  }
  Serial.println();

  return WiFi.status() == WL_CONNECTED;
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
  return "8266";
}
