#pragma once

#include <Arduino.h>

#ifndef DOTWATCH_ALLOW_INSECURE_TLS_FALLBACK
#define DOTWATCH_ALLOW_INSECURE_TLS_FALLBACK 0
#endif

namespace ProductConfig {

static constexpr const char *NVS_NAMESPACE = "dotwatch";
static constexpr const char *DEFAULT_API_URL = "https://dotwatch-backend.onrender.com";

static constexpr const char *SETUP_AP_PREFIX = "dotWatch-Setup";
static constexpr const char *SETUP_AP_PASSWORD = "dotwatch-setup";
static constexpr uint8_t DNS_PORT = 53;

static constexpr int STATUS_LED_PIN = 2;
static constexpr int RESET_BUTTON_PIN = 0;
static constexpr unsigned long RESET_HOLD_MS = 6000UL;

static constexpr int DEFAULT_DHT_PIN = 4;
static constexpr int DEFAULT_DHT_TYPE = 11;
static constexpr unsigned long DEFAULT_SEND_INTERVAL_MS = 20000UL;
static constexpr unsigned long MIN_SEND_INTERVAL_MS = 10000UL;

static constexpr int WIFI_PROFILE_MAX = 5;
static constexpr int WIFI_SCAN_MAX = 20;
static constexpr unsigned long WIFI_PROFILE_ATTEMPT_TIMEOUT_MS = 12000UL;
static constexpr unsigned long WIFI_CONNECT_TOTAL_TIMEOUT_MS = 30000UL;
static constexpr unsigned long WIFI_RETRY_INTERVAL_MS = 15000UL;
static constexpr unsigned long PORTAL_RETRY_WIFI_MS = 30000UL;

static constexpr unsigned long WIFI_RESTART_AFTER_MS = 10UL * 60UL * 1000UL;
static constexpr unsigned long SEND_RESTART_AFTER_MS = 30UL * 60UL * 1000UL;
static constexpr unsigned long HTTP_TIMEOUT_MS = 15000UL;

static constexpr unsigned long FIRST_SEND_DELAY_MS = 3000UL;

}  // namespace ProductConfig
