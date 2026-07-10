#include "network/TimeService.h"

#include <WiFi.h>
#include <time.h>

bool TimeService::sync() {
  if (WiFi.status() != WL_CONNECTED) {
    synced_ = false;
    return false;
  }

  configTime(0, 0, "pool.ntp.org", "time.nist.gov", "time.google.com");
  Serial.print("TimeService: NTP sync");

  for (int attempt = 0; attempt < 20; attempt++) {
    struct tm timeInfo;
    if (getLocalTime(&timeInfo, 500)) {
      Serial.println(" OK");
      synced_ = true;
      return true;
    }
    Serial.print(".");
  }

  Serial.println(" timeout");
  synced_ = false;
  return false;
}

String TimeService::isoTimestampOrEmpty() const {
  struct tm timeInfo;
  if (!getLocalTime(&timeInfo, 20)) return "";

  char buffer[32];
  strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", &timeInfo);
  return String(buffer);
}

bool TimeService::isSynced() const {
  return synced_;
}
