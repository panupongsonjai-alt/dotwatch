#include "config/ConfigStore.h"

#include <ArduinoJson.h>
#include "FirmwareVersion.h"
#include "ProductConfig.h"
#include "utils/StringUtils.h"

namespace {

constexpr const char *KEY_SCHEMA = "cfgVer";
constexpr const char *KEY_WIFI_SSID = "wifiSsid";
constexpr const char *KEY_WIFI_PASS = "wifiPass";
constexpr const char *KEY_WIFI_PROFILES = "wifiProfiles";
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

bool ConfigStore::load(DeviceConfig &config) {
  Preferences prefs;
  if (!prefs.begin(ProductConfig::NVS_NAMESPACE, true)) {
    Serial.println("ConfigStore: unable to open NVS for reading");
    return false;
  }

  const uint16_t storedSchema = prefs.getUShort(KEY_SCHEMA, 0);

  config.schemaVersion = DOTWATCH_CONFIG_SCHEMA_VERSION;
  config.wifiSsid = prefs.getString(KEY_WIFI_SSID, "");
  config.wifiPassword = prefs.getString(KEY_WIFI_PASS, "");
  config.pendingWifiSsid = prefs.getString(KEY_PENDING_SSID, "");
  config.pendingWifiPassword = prefs.getString(KEY_PENDING_PASS, "");
  config.hasPendingWifi = prefs.getBool(KEY_PENDING_FLAG, false);
  config.pendingKeepBackups = prefs.getBool(KEY_PENDING_BACKUPS, true);
  config.apiUrl = StringUtils::normalizeApiUrl(
      prefs.getString(KEY_API_URL, ProductConfig::DEFAULT_API_URL));
  config.deviceCode = prefs.getString(KEY_DEVICE_CODE, "");
  config.deviceSecret = prefs.getString(KEY_DEVICE_SECRET, "");
  config.adminPin = prefs.getString(KEY_ADMIN_PIN, "");
  config.tlsCaCert = prefs.getString(KEY_TLS_CA, "");
  config.dhtPin = prefs.getInt(KEY_DHT_PIN, ProductConfig::DEFAULT_DHT_PIN);
  config.dhtType = prefs.getInt(KEY_DHT_TYPE, ProductConfig::DEFAULT_DHT_TYPE);
  config.sendIntervalMs = prefs.getULong(
      KEY_SEND_MS, ProductConfig::DEFAULT_SEND_INTERVAL_MS);
  config.fallbackDummy = prefs.getBool(KEY_DUMMY, true);
  prefs.end();

  config.wifiSsid.trim();
  config.pendingWifiSsid.trim();
  config.deviceCode.trim();
  config.deviceSecret.trim();
  config.adminPin.trim();
  config.tlsCaCert.trim();

  if (config.dhtPin < 0 || config.dhtPin > 39) {
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

  // Legacy Phase 4/10/11 firmware did not store a schema version. The keys
  // above intentionally remain compatible, so migration only records the
  // current schema without rewriting secrets or Wi-Fi data.
  if (storedSchema != DOTWATCH_CONFIG_SCHEMA_VERSION) {
    writeSchemaVersion(DOTWATCH_CONFIG_SCHEMA_VERSION);
  }

  return true;
}

bool ConfigStore::save(const DeviceConfig &config) {
  Preferences prefs;
  if (!prefs.begin(ProductConfig::NVS_NAMESPACE, false)) {
    Serial.println("ConfigStore: unable to open NVS for writing");
    return false;
  }

  prefs.putUShort(KEY_SCHEMA, DOTWATCH_CONFIG_SCHEMA_VERSION);
  prefs.putString(KEY_WIFI_SSID, config.wifiSsid);
  prefs.putString(KEY_WIFI_PASS, config.wifiPassword);
  prefs.putString(KEY_PENDING_SSID, config.pendingWifiSsid);
  prefs.putString(KEY_PENDING_PASS, config.pendingWifiPassword);
  prefs.putBool(KEY_PENDING_FLAG, config.hasPendingWifi);
  prefs.putBool(KEY_PENDING_BACKUPS, config.pendingKeepBackups);
  prefs.putString(KEY_API_URL, StringUtils::normalizeApiUrl(config.apiUrl));
  prefs.putString(KEY_DEVICE_CODE, config.deviceCode);
  prefs.putString(KEY_DEVICE_SECRET, config.deviceSecret);
  prefs.putString(KEY_ADMIN_PIN, config.adminPin);
  prefs.putString(KEY_TLS_CA, config.tlsCaCert);
  prefs.putInt(KEY_DHT_PIN, config.dhtPin);
  prefs.putInt(KEY_DHT_TYPE, config.dhtType);
  prefs.putULong(KEY_SEND_MS, config.sendIntervalMs);
  prefs.putBool(KEY_DUMMY, config.fallbackDummy);
  prefs.end();
  return true;
}

void ConfigStore::clearAll() {
  Preferences prefs;
  if (prefs.begin(ProductConfig::NVS_NAMESPACE, false)) {
    prefs.clear();
    prefs.end();
  }
}

void ConfigStore::clearWiFi(DeviceConfig &config) {
  config.wifiSsid = "";
  config.wifiPassword = "";
  config.pendingWifiSsid = "";
  config.pendingWifiPassword = "";
  config.hasPendingWifi = false;
  config.pendingKeepBackups = true;

  Preferences prefs;
  if (prefs.begin(ProductConfig::NVS_NAMESPACE, false)) {
    prefs.remove(KEY_WIFI_SSID);
    prefs.remove(KEY_WIFI_PASS);
    prefs.remove(KEY_WIFI_PROFILES);
    prefs.remove(KEY_PENDING_SSID);
    prefs.remove(KEY_PENDING_PASS);
    prefs.remove(KEY_PENDING_FLAG);
    prefs.remove(KEY_PENDING_BACKUPS);
    prefs.end();
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

  Preferences prefs;
  String stored;
  if (prefs.begin(ProductConfig::NVS_NAMESPACE, true)) {
    stored = prefs.getString(KEY_WIFI_PROFILES, "");
    prefs.end();
  }

  if (stored.length() == 0) return count;

  JsonDocument document;
  const DeserializationError error = deserializeJson(document, stored);
  if (error || !document.is<JsonArray>()) return count;

  const JsonArray profilesArray = document.as<JsonArray>();
  for (JsonObject profile : profilesArray) {
    if (count >= maxProfiles) break;
    const String ssid = profile["s"] | "";
    const String password = profile["p"] | "";
    count = appendProfile(
        profiles, count, maxProfiles, ssid, password, false);
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

  String output;
  serializeJson(document, output);

  Preferences prefs;
  if (!prefs.begin(ProductConfig::NVS_NAMESPACE, false)) return false;
  prefs.putString(KEY_WIFI_PROFILES, output);
  prefs.end();
  return true;
}

bool ConfigStore::rememberWiFiProfile(const DeviceConfig &config,
                                      const String &ssid,
                                      const String &password,
                                      bool makePrimary,
                                      bool keepBackups) {
  WiFiProfile profiles[ProductConfig::WIFI_PROFILE_MAX];
  int count = 0;

  count = appendProfile(
      profiles,
      count,
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

  // Make only the requested SSID primary. This prevents a fallback network
  // from silently becoming the preferred network after a temporary outage.
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

bool ConfigStore::writeSchemaVersion(uint16_t version) {
  Preferences prefs;
  if (!prefs.begin(ProductConfig::NVS_NAMESPACE, false)) return false;
  prefs.putUShort(KEY_SCHEMA, version);
  prefs.end();
  return true;
}
