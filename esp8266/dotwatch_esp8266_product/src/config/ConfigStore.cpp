#include "config/ConfigStore.h"

#include <LittleFS.h>

#include "FirmwareVersion.h"
#include "ProductConfig.h"
#include "utils/StringUtils.h"

namespace {

constexpr const char *KEY_SCHEMA = "cfgVer";
constexpr const char *KEY_WIFI_SSID = "wifiSsid";
constexpr const char *KEY_WIFI_PASS = "wifiPass";
constexpr const char *KEY_PENDING_SSID = "pendSsid";
constexpr const char *KEY_PENDING_PASS = "pendPass";
constexpr const char *KEY_PENDING_FLAG = "pendWifi";
constexpr const char *KEY_PENDING_BACKUPS = "pendBackup";
constexpr const char *KEY_API_URL = "apiUrl";
constexpr const char *KEY_DEVICE_CODE = "devCode";
constexpr const char *KEY_DEVICE_SECRET = "devSecret";
constexpr const char *KEY_ADMIN_PIN = "adminPin";
constexpr const char *KEY_TLS_CA = "tlsCaCert";
constexpr const char *KEY_DHT_PIN = "dhtPin";
constexpr const char *KEY_DHT_TYPE = "dhtType";
constexpr const char *KEY_SEND_MS = "sendMs";
constexpr const char *KEY_DUMMY = "dummy";

}  // namespace

bool ConfigStore::beginStorage() {
  if (storageReady_) return true;

  if (!LittleFS.begin()) {
    Serial.println("ConfigStore: LittleFS mount failed; formatting once");
    if (!LittleFS.format() || !LittleFS.begin()) {
      Serial.println("ConfigStore: LittleFS unavailable");
      return false;
    }
  }

  storageReady_ = true;
  return true;
}

bool ConfigStore::readJsonFile(const char *path, JsonDocument &document) {
  if (!beginStorage()) return false;

  File file = LittleFS.open(path, "r");
  if (!file) return false;

  const DeserializationError error = deserializeJson(document, file);
  file.close();
  if (error) {
    Serial.print("ConfigStore: invalid JSON in ");
    Serial.print(path);
    Serial.print(": ");
    Serial.println(error.c_str());
    return false;
  }
  return true;
}

bool ConfigStore::writeJsonFile(const char *path,
                                const char *tempPath,
                                const JsonDocument &document) {
  if (!beginStorage()) return false;

  LittleFS.remove(tempPath);
  File file = LittleFS.open(tempPath, "w");
  if (!file) {
    Serial.print("ConfigStore: cannot open temp file: ");
    Serial.println(tempPath);
    return false;
  }

  const size_t written = serializeJson(document, file);
  file.flush();
  file.close();
  if (written == 0) {
    LittleFS.remove(tempPath);
    Serial.println("ConfigStore: JSON write produced zero bytes");
    return false;
  }

  LittleFS.remove(path);
  if (!LittleFS.rename(tempPath, path)) {
    LittleFS.remove(tempPath);
    Serial.print("ConfigStore: rename failed for ");
    Serial.println(path);
    return false;
  }
  return true;
}

bool ConfigStore::load(DeviceConfig &config) {
  config = DeviceConfig();

  JsonDocument document;
  const bool loaded = readJsonFile(ProductConfig::CONFIG_FILE, document);
  if (loaded) {
    config.wifiSsid = String(document[KEY_WIFI_SSID] | "");
    config.wifiPassword = String(document[KEY_WIFI_PASS] | "");
    config.pendingWifiSsid = String(document[KEY_PENDING_SSID] | "");
    config.pendingWifiPassword = String(document[KEY_PENDING_PASS] | "");
    config.hasPendingWifi = document[KEY_PENDING_FLAG] | false;
    config.pendingKeepBackups = document[KEY_PENDING_BACKUPS] | true;
    config.apiUrl = StringUtils::normalizeApiUrl(
        String(document[KEY_API_URL] | ProductConfig::DEFAULT_API_URL));
    config.deviceCode = String(document[KEY_DEVICE_CODE] | "");
    config.deviceSecret = String(document[KEY_DEVICE_SECRET] | "");
    config.adminPin = String(document[KEY_ADMIN_PIN] | "");
    config.tlsCaCert = String(document[KEY_TLS_CA] | "");
    config.dhtPin = document[KEY_DHT_PIN] | ProductConfig::DEFAULT_DHT_PIN;
    config.dhtType = document[KEY_DHT_TYPE] | ProductConfig::DEFAULT_DHT_TYPE;
    config.sendIntervalMs =
        document[KEY_SEND_MS] | ProductConfig::DEFAULT_SEND_INTERVAL_MS;
    config.fallbackDummy = document[KEY_DUMMY] | true;
  }

  config.schemaVersion = DOTWATCH_CONFIG_SCHEMA_VERSION;
  config.wifiSsid.trim();
  config.pendingWifiSsid.trim();
  config.deviceCode.trim();
  config.deviceSecret.trim();
  config.adminPin.trim();
  config.tlsCaCert.trim();

  if (!ProductConfig::isValidDhtPin(config.dhtPin)) {
    config.dhtPin = ProductConfig::DEFAULT_DHT_PIN;
  }
  if (config.dhtType != 11 && config.dhtType != 22) {
    config.dhtType = ProductConfig::DEFAULT_DHT_TYPE;
  }
  if (config.sendIntervalMs < ProductConfig::MIN_SEND_INTERVAL_MS) {
    config.sendIntervalMs = ProductConfig::MIN_SEND_INTERVAL_MS;
  }

  if (!config.hasPendingWifi || config.pendingWifiSsid.length() == 0) {
    config.hasPendingWifi = false;
    config.pendingWifiSsid = "";
    config.pendingWifiPassword = "";
  }

  const uint16_t storedSchema = loaded ? (document[KEY_SCHEMA] | 0) : 0;
  if (!loaded || storedSchema != DOTWATCH_CONFIG_SCHEMA_VERSION) {
    return save(config);
  }
  return true;
}

bool ConfigStore::save(const DeviceConfig &config) {
  JsonDocument document;
  document[KEY_SCHEMA] = DOTWATCH_CONFIG_SCHEMA_VERSION;
  document[KEY_WIFI_SSID] = config.wifiSsid;
  document[KEY_WIFI_PASS] = config.wifiPassword;
  document[KEY_PENDING_SSID] = config.pendingWifiSsid;
  document[KEY_PENDING_PASS] = config.pendingWifiPassword;
  document[KEY_PENDING_FLAG] = config.hasPendingWifi;
  document[KEY_PENDING_BACKUPS] = config.pendingKeepBackups;
  document[KEY_API_URL] = StringUtils::normalizeApiUrl(config.apiUrl);
  document[KEY_DEVICE_CODE] = config.deviceCode;
  document[KEY_DEVICE_SECRET] = config.deviceSecret;
  document[KEY_ADMIN_PIN] = config.adminPin;
  document[KEY_TLS_CA] = config.tlsCaCert;
  document[KEY_DHT_PIN] = config.dhtPin;
  document[KEY_DHT_TYPE] = config.dhtType;
  document[KEY_SEND_MS] = config.sendIntervalMs;
  document[KEY_DUMMY] = config.fallbackDummy;

  return writeJsonFile(
      ProductConfig::CONFIG_FILE,
      ProductConfig::CONFIG_TEMP_FILE,
      document);
}

void ConfigStore::clearAll() {
  if (!beginStorage()) return;
  LittleFS.remove(ProductConfig::CONFIG_FILE);
  LittleFS.remove(ProductConfig::CONFIG_TEMP_FILE);
  LittleFS.remove(ProductConfig::WIFI_PROFILES_FILE);
  LittleFS.remove(ProductConfig::WIFI_PROFILES_TEMP_FILE);
}

void ConfigStore::clearWiFi(DeviceConfig &config) {
  config.wifiSsid = "";
  config.wifiPassword = "";
  config.pendingWifiSsid = "";
  config.pendingWifiPassword = "";
  config.hasPendingWifi = false;
  config.pendingKeepBackups = true;
  save(config);

  if (beginStorage()) {
    LittleFS.remove(ProductConfig::WIFI_PROFILES_FILE);
    LittleFS.remove(ProductConfig::WIFI_PROFILES_TEMP_FILE);
  }
}

bool ConfigStore::hasRequiredConfig(const DeviceConfig &config) const {
  return config.wifiSsid.length() > 0 &&
         config.apiUrl.length() > 0 &&
         config.deviceCode.length() > 0 &&
         config.deviceSecret.length() > 0;
}

bool ConfigStore::hasDeviceCredentials(const DeviceConfig &config) const {
  return config.apiUrl.length() > 0 &&
         config.deviceCode.length() > 0 &&
         config.deviceSecret.length() > 0;
}

bool ConfigStore::stageWiFi(DeviceConfig &config,
                            const String &ssid,
                            const String &password,
                            bool keepBackups) {
  String cleanedSsid = ssid;
  cleanedSsid.trim();
  if (cleanedSsid.length() == 0) return false;

  config.pendingWifiSsid = cleanedSsid;
  config.pendingWifiPassword = password;
  config.hasPendingWifi = true;
  config.pendingKeepBackups = keepBackups;
  return save(config);
}

bool ConfigStore::promotePendingWiFi(DeviceConfig &config) {
  if (!config.hasPendingWifi || config.pendingWifiSsid.length() == 0) {
    return false;
  }

  const String promotedSsid = config.pendingWifiSsid;
  const String promotedPassword = config.pendingWifiPassword;
  const bool keepBackups = config.pendingKeepBackups;

  config.wifiSsid = promotedSsid;
  config.wifiPassword = promotedPassword;
  config.pendingWifiSsid = "";
  config.pendingWifiPassword = "";
  config.hasPendingWifi = false;
  config.pendingKeepBackups = true;

  if (!save(config)) return false;
  return rememberWiFiProfile(
      config, promotedSsid, promotedPassword, true, keepBackups);
}

bool ConfigStore::discardPendingWiFi(DeviceConfig &config) {
  config.pendingWifiSsid = "";
  config.pendingWifiPassword = "";
  config.hasPendingWifi = false;
  config.pendingKeepBackups = true;
  return save(config);
}

int ConfigStore::appendProfile(WiFiProfile profiles[],
                               int count,
                               int maxProfiles,
                               String ssid,
                               String password,
                               bool primary) {
  ssid.trim();
  if (ssid.length() == 0) return count;

  for (int index = 0; index < count; index++) {
    if (profiles[index].ssid == ssid) {
      if (password.length() > 0 || profiles[index].password.length() == 0) {
        profiles[index].password = password;
      }
      profiles[index].primary = profiles[index].primary || primary;
      return count;
    }
  }

  if (count >= maxProfiles) return count;
  profiles[count].ssid = ssid;
  profiles[count].password = password;
  profiles[count].rssi = -999;
  profiles[count].primary = primary;
  return count + 1;
}

int ConfigStore::loadWiFiProfiles(const DeviceConfig &config,
                                  WiFiProfile profiles[],
                                  int maxProfiles) {
  int count = 0;
  if (config.wifiSsid.length() > 0) {
    count = appendProfile(
        profiles,
        count,
        maxProfiles,
        config.wifiSsid,
        config.wifiPassword,
        true);
  }

  JsonDocument document;
  if (!readJsonFile(ProductConfig::WIFI_PROFILES_FILE, document) ||
      !document.is<JsonArray>()) {
    return count;
  }

  const JsonArray profilesArray = document.as<JsonArray>();
  for (JsonObject profile : profilesArray) {
    if (count >= maxProfiles) break;
    count = appendProfile(
        profiles,
        count,
        maxProfiles,
        String(profile["s"] | ""),
        String(profile["p"] | ""),
        false);
  }
  return count;
}

bool ConfigStore::saveWiFiProfiles(WiFiProfile profiles[], int count) {
  JsonDocument document;
  JsonArray profilesArray = document.to<JsonArray>();

  for (int index = 0;
       index < count && index < ProductConfig::WIFI_PROFILE_MAX;
       index++) {
    if (profiles[index].ssid.length() == 0) continue;
    JsonObject item = profilesArray.add<JsonObject>();
    item["s"] = profiles[index].ssid;
    item["p"] = profiles[index].password;
  }

  return writeJsonFile(
      ProductConfig::WIFI_PROFILES_FILE,
      ProductConfig::WIFI_PROFILES_TEMP_FILE,
      document);
}

bool ConfigStore::rememberWiFiProfile(const DeviceConfig &config,
                                      const String &ssid,
                                      const String &password,
                                      bool makePrimary,
                                      bool keepBackups) {
  WiFiProfile profiles[ProductConfig::WIFI_PROFILE_MAX];
  int count = appendProfile(
      profiles,
      0,
      ProductConfig::WIFI_PROFILE_MAX,
      ssid,
      password,
      makePrimary);

  if (keepBackups) {
    WiFiProfile storedProfiles[ProductConfig::WIFI_PROFILE_MAX];
    const int storedCount = loadWiFiProfiles(
        config, storedProfiles, ProductConfig::WIFI_PROFILE_MAX);
    for (int index = 0; index < storedCount; index++) {
      count = appendProfile(
          profiles,
          count,
          ProductConfig::WIFI_PROFILE_MAX,
          storedProfiles[index].ssid,
          storedProfiles[index].password,
          false);
    }
  }

  for (int index = 0; index < count; index++) {
    profiles[index].primary = makePrimary && profiles[index].ssid == ssid;
  }
  return saveWiFiProfiles(profiles, count);
}

int ConfigStore::knownWiFiProfileCount(const DeviceConfig &config) {
  WiFiProfile profiles[ProductConfig::WIFI_PROFILE_MAX];
  return loadWiFiProfiles(
      config, profiles, ProductConfig::WIFI_PROFILE_MAX);
}

String ConfigStore::knownWiFiProfileSummary(const DeviceConfig &config) {
  WiFiProfile profiles[ProductConfig::WIFI_PROFILE_MAX];
  const int count = loadWiFiProfiles(
      config, profiles, ProductConfig::WIFI_PROFILE_MAX);
  if (count == 0) return "None";

  String output;
  for (int index = 0; index < count; index++) {
    if (index > 0) output += ", ";
    output += profiles[index].ssid;
    if (profiles[index].primary) output += "*";
  }
  return output;
}
