#pragma once

#include <Arduino.h>

#ifndef DOTWATCH_ALLOW_INSECURE_TLS_FALLBACK
#define DOTWATCH_ALLOW_INSECURE_TLS_FALLBACK 0
#endif

namespace ProductConfig {

static constexpr const char *CONFIG_FILE = "/dotth-config.json";
static constexpr const char *CONFIG_TEMP_FILE = "/dotth-config.tmp";
static constexpr const char *WIFI_PROFILES_FILE = "/dotth-wifi.json";
static constexpr const char *WIFI_PROFILES_TEMP_FILE = "/dotth-wifi.tmp";
static constexpr const char *DEFAULT_API_URL = "https://dotwatch-backend.onrender.com";

static constexpr const char *SETUP_AP_PREFIX = "dotTH-8266-Setup";
static constexpr const char *SETUP_AP_PASSWORD = "dotth-setup";
static constexpr uint8_t DNS_PORT = 53;

// NodeMCU v2 / Wemos D1 mini GPIO numbers.
// Built-in LED is normally GPIO2 (D4) and active LOW.
static constexpr int STATUS_LED_PIN = 2;
static constexpr bool STATUS_LED_ACTIVE_LOW = true;
static constexpr int RESET_BUTTON_PIN = 0;  // FLASH button
static constexpr unsigned long RESET_HOLD_MS = 6000UL;

// DHT data on GPIO4 (D2) by default.
static constexpr int DEFAULT_DHT_PIN = 4;
static constexpr int DEFAULT_DHT_TYPE = 11;
static constexpr unsigned long DEFAULT_SEND_INTERVAL_MS = 20000UL;
static constexpr unsigned long MIN_SEND_INTERVAL_MS = 10000UL;

static constexpr int WIFI_PROFILE_MAX = 5;
static constexpr int WIFI_SCAN_MAX = 16;
static constexpr unsigned long WIFI_PROFILE_ATTEMPT_TIMEOUT_MS = 12000UL;
static constexpr unsigned long WIFI_CONNECT_TOTAL_TIMEOUT_MS = 30000UL;
static constexpr unsigned long WIFI_RETRY_INTERVAL_MS = 15000UL;
static constexpr unsigned long PORTAL_RETRY_WIFI_MS = 30000UL;

static constexpr unsigned long WIFI_RESTART_AFTER_MS = 10UL * 60UL * 1000UL;
static constexpr unsigned long SEND_RESTART_AFTER_MS = 30UL * 60UL * 1000UL;
static constexpr unsigned long HTTP_TIMEOUT_MS = 15000UL;
static constexpr unsigned long FIRST_SEND_DELAY_MS = 3000UL;

inline bool isValidDhtPin(int pin) {
  // Safe general-purpose pins on common ESP8266 development boards.
  return pin == 4 || pin == 5 || pin == 12 || pin == 13 || pin == 14;
}

}  // namespace ProductConfig
