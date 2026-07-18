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
static constexpr uint8_t DNS_PORT = 53;

// Provisioning and local-admin security. Credentials are generated uniquely
// on first boot and persisted in NVS/LittleFS; no fleet-wide default password.
static constexpr size_t GENERATED_CREDENTIAL_LENGTH = 14;
static constexpr size_t ADMIN_PIN_MIN_LENGTH = 8;
static constexpr unsigned long SETUP_BUTTON_HOLD_MS = 2000UL;
static constexpr unsigned long SETUP_PORTAL_TIMEOUT_MS = 15UL * 60UL * 1000UL;
static constexpr unsigned long ADMIN_SESSION_TTL_MS = 30UL * 60UL * 1000UL;
static constexpr unsigned long ADMIN_LOGIN_WINDOW_MS = 5UL * 60UL * 1000UL;
static constexpr unsigned long ADMIN_LOGIN_BLOCK_MS = 5UL * 60UL * 1000UL;
static constexpr uint8_t ADMIN_LOGIN_MAX_ATTEMPTS = 5;
static constexpr const char *ADMIN_SESSION_COOKIE = "dotth_admin_session";

// NodeMCU v2 / Wemos D1 mini GPIO numbers.
// Built-in LED is normally GPIO2 (D4) and active LOW.
static constexpr int STATUS_LED_PIN = 2;
static constexpr bool STATUS_LED_ACTIVE_LOW = true;
static constexpr int RESET_BUTTON_PIN = 0;  // FLASH button
static constexpr unsigned long RESET_HOLD_MS = 6000UL;

// DHT data on GPIO4 (D2) by default.
static constexpr int DEFAULT_DHT_PIN = 14;
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
