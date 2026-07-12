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

// Remember the IP assigned by DHCP on the first successful connection to
// each SSID, then reuse that address as a static IP on later connections.
static constexpr bool WIFI_REMEMBER_FIRST_IP = true;
static constexpr unsigned long WIFI_DHCP_RECOVERY_TIMEOUT_MS = 12000UL;

static constexpr unsigned long WIFI_RESTART_AFTER_MS = 10UL * 60UL * 1000UL;
static constexpr unsigned long SEND_RESTART_AFTER_MS = 30UL * 60UL * 1000UL;
static constexpr unsigned long HTTP_TIMEOUT_MS = 15000UL;

static constexpr unsigned long FIRST_SEND_DELAY_MS = 3000UL;

// Internet OTA defaults. Leave OTA Base URL blank in the portal to reuse apiUrl.
static constexpr const char *DEFAULT_OTA_CHANNEL = "stable";
static constexpr const char *OTA_CHECK_PATH = "/api/device-firmware/check";
static constexpr const char *OTA_REPORT_PATH = "/api/device-firmware/report";
static constexpr unsigned long OTA_FIRST_CHECK_DELAY_MS = 60000UL;
static constexpr unsigned long OTA_DEFAULT_CHECK_INTERVAL_MS = 6UL * 60UL * 60UL * 1000UL;
static constexpr unsigned long OTA_MIN_CHECK_INTERVAL_MS = 15UL * 60UL * 1000UL;
static constexpr unsigned long OTA_MAX_CHECK_INTERVAL_MS = 24UL * 60UL * 60UL * 1000UL;
static constexpr unsigned long OTA_HTTP_TIMEOUT_MS = 30000UL;
static constexpr unsigned long OTA_STREAM_IDLE_TIMEOUT_MS = 30000UL;
static constexpr size_t OTA_DOWNLOAD_BUFFER_SIZE = 4096;
static constexpr uint32_t OTA_MAX_FIRMWARE_BYTES = 0x180000UL;

}  // namespace ProductConfig
