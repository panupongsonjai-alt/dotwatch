#include "network/TimeService.h"

#include <ESP8266WiFi.h>
#include <time.h>

namespace {
constexpr time_t MIN_VALID_EPOCH = 1609459200;  // 2021-01-01 UTC
}

bool TimeService::sync() {
  if (WiFi.status() != WL_CONNECTED) {
    synced_ = false;
    return false;
  }

  configTime(0, 0, "pool.ntp.org", "time.nist.gov", "time.google.com");
  Serial.print("TimeService: NTP sync");

  for (int attempt = 0; attempt < 40; attempt++) {
    const time_t now = time(nullptr);
    if (now >= MIN_VALID_EPOCH) {
      Serial.println(" OK");
      synced_ = true;
      return true;
    }
    delay(250);
    Serial.print(".");
    yield();
  }

  Serial.println(" timeout");
  synced_ = false;
  return false;
}

String TimeService::isoTimestampOrEmpty() const {
  const time_t now = time(nullptr);
  if (now < MIN_VALID_EPOCH) return "";

  struct tm timeInfo;
  gmtime_r(&now, &timeInfo);

  char buffer[32];
  strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", &timeInfo);
  return String(buffer);
}

bool TimeService::isSynced() const {
  return synced_;
}
