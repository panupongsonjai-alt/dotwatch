#pragma once

#include <Arduino.h>

#ifndef DOTWATCH_ALLOW_INSECURE_TLS_FALLBACK
#define DOTWATCH_ALLOW_INSECURE_TLS_FALLBACK 0
#endif

namespace ProductConfig {

static constexpr const char *NVS_NAMESPACE = "dotwatch";
static constexpr const char *DEFAULT_API_URL = "https://dotwatch-backend.onrender.com";

static constexpr const char *SETUP_AP_PREFIX = "dotWatch-Setup";
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

static constexpr int STATUS_LED_PIN = 2;
static constexpr int RESET_BUTTON_PIN = 0;
static constexpr unsigned long RESET_HOLD_MS = 6000UL;

static constexpr int DEFAULT_DHT_PIN = 4;
static constexpr int DEFAULT_DHT_TYPE = 11;
static constexpr unsigned long DEFAULT_SEND_INTERVAL_MS = 20000UL;
static constexpr unsigned long MIN_SEND_INTERVAL_MS = 10000UL;

// Optional external power-sense input.
// Set to -1 when no dedicated power-detect wire is connected.
// If you later wire 5V or charger status through a safe divider/transistor
// to an ESP32 input, set the GPIO number below.
static constexpr int POWER_SENSE_PIN = -1;
static constexpr bool POWER_SENSE_ACTIVE_HIGH = true;

// Local product-display status ranges. These do not replace backend alarms.
static constexpr float DISPLAY_TEMP_NORMAL_MIN = 18.0f;
static constexpr float DISPLAY_TEMP_NORMAL_MAX = 35.0f;
static constexpr float DISPLAY_HUMIDITY_NORMAL_MIN = 30.0f;
static constexpr float DISPLAY_HUMIDITY_NORMAL_MAX = 70.0f;

// 2.4-inch SPI TFT, ILI9341, landscape 320x240 comfort UI.
// TFT pin label mapping:
// SCK/CLK -> GPIO 18, MOSI/SDI -> GPIO 23, MISO/SDO -> GPIO 19,
// CS -> GPIO 25, DC/RS -> GPIO 27, RST/RESET -> GPIO 26.
// LED/BL is connected to 3V3 for an always-on backlight.
static constexpr bool TFT_ENABLED = true;
static constexpr int TFT_SCK_PIN = 18;
static constexpr int TFT_MOSI_PIN = 23;
static constexpr int TFT_MISO_PIN = 19;
static constexpr int TFT_CS_PIN = 25;
static constexpr int TFT_DC_PIN = 27;
static constexpr int TFT_RST_PIN = 26;
static constexpr uint8_t TFT_ROTATION = 1;
static constexpr bool TFT_INVERT_COLORS = false;
static constexpr uint32_t TFT_SPI_FREQUENCY_HZ = 40000000UL;
static constexpr unsigned long TFT_REFRESH_INTERVAL_MS = 200UL;

// A DHT22 should not be sampled faster than roughly every two seconds.
// This rate also provides a responsive local display independently of telemetry.
static constexpr unsigned long SENSOR_FIRST_SAMPLE_DELAY_MS = 2000UL;
static constexpr unsigned long SENSOR_SAMPLE_INTERVAL_MS = 2500UL;

static constexpr int WIFI_PROFILE_MAX = 5;
static constexpr int WIFI_SCAN_MAX = 20;
static constexpr unsigned long WIFI_PROFILE_ATTEMPT_TIMEOUT_MS = 20000UL;
static constexpr unsigned long WIFI_CONNECT_TOTAL_TIMEOUT_MS = 50000UL;
static constexpr unsigned long WIFI_RETRY_INTERVAL_MS = 15000UL;
static constexpr unsigned long PORTAL_RETRY_WIFI_MS = 30000UL;

// Remember the IP assigned by DHCP on the first successful connection to
// each SSID, then reuse that address as a static IP on later connections.
static constexpr bool WIFI_REMEMBER_FIRST_IP = true;
static constexpr unsigned long WIFI_DHCP_RECOVERY_TIMEOUT_MS = 20000UL;

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
