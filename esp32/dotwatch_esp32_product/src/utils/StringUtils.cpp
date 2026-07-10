#include "utils/StringUtils.h"

namespace StringUtils {

String htmlEscape(String input) {
  input.replace("&", "&amp;");
  input.replace("<", "&lt;");
  input.replace(">", "&gt;");
  input.replace("\"", "&quot;");
  input.replace("'", "&#39;");
  return input;
}

String normalizeApiUrl(String value) {
  value.trim();
  while (value.endsWith("/")) {
    value.remove(value.length() - 1);
  }
  if (value.length() == 0) {
    value = ProductConfig::DEFAULT_API_URL;
  }
  return value;
}

String maskSecret(const String &secret) {
  if (secret.length() == 0) return "Not set";
  if (secret.length() <= 8) return "********";
  return secret.substring(0, 4) + "********" + secret.substring(secret.length() - 4);
}

String uptimeText() {
  unsigned long seconds = millis() / 1000UL;
  const unsigned long days = seconds / 86400UL;
  seconds %= 86400UL;
  const unsigned long hours = seconds / 3600UL;
  seconds %= 3600UL;
  const unsigned long minutes = seconds / 60UL;
  seconds %= 60UL;

  String output;
  if (days > 0) output += String(days) + "d ";
  if (hours > 0 || days > 0) output += String(hours) + "h ";
  output += String(minutes) + "m " + String(seconds) + "s";
  return output;
}

String appStateText(AppState state) {
  switch (state) {
    case AppState::BOOTING: return "BOOTING";
    case AppState::UNPROVISIONED: return "UNPROVISIONED";
    case AppState::SETUP_PORTAL: return "SETUP_PORTAL";
    case AppState::CONNECTING_WIFI: return "CONNECTING_WIFI";
    case AppState::CONNECTING_BACKEND: return "CONNECTING_BACKEND";
    case AppState::ONLINE: return "ONLINE";
    case AppState::DEGRADED: return "DEGRADED";
    case AppState::RECOVERY: return "RECOVERY";
    case AppState::UPDATING: return "UPDATING";
  }
  return "UNKNOWN";
}

String signalQualityText(int rssi) {
  if (rssi >= -60) return "ดีมาก";
  if (rssi >= -70) return "ดี";
  if (rssi >= -80) return "พอใช้";
  return "สัญญาณอ่อน";
}

int signalQualityPercent(int rssi) {
  if (rssi <= -100) return 0;
  if (rssi >= -50) return 100;
  return 2 * (rssi + 100);
}

String boolText(bool value) {
  return value ? "true" : "false";
}

}  // namespace StringUtils
