#pragma once

#include <Arduino.h>

namespace AppConfig {

constexpr char PRODUCT_NAME[] = "dotTH";
constexpr char MODEL_NAME[] = "ESP8266-OLED-DHT";
constexpr char FIRMWARE_VERSION[] = "1.0.0";

constexpr uint8_t OLED_WIDTH = 128;
constexpr uint8_t OLED_HEIGHT = 64;
constexpr int8_t OLED_RESET_PIN = -1;

// NodeMCU ESP8266:
// D2 = GPIO4 = SDA
// D1 = GPIO5 = SCL
constexpr uint8_t OLED_SDA_PIN = D2;
constexpr uint8_t OLED_SCL_PIN = D1;

// Most SSD1306 I2C modules use 0x3C; some use 0x3D.
constexpr uint8_t OLED_PRIMARY_ADDRESS = 0x3C;
constexpr uint8_t OLED_SECONDARY_ADDRESS = 0x3D;

// D5 = GPIO14
constexpr uint8_t DHT_PIN = D5;
constexpr uint8_t DHT_TYPE = DHT11;

// DHT11 should not be sampled too frequently.
constexpr unsigned long SENSOR_INTERVAL_MS = 2500UL;
constexpr unsigned long DISPLAY_REFRESH_MS = 500UL;

}  // namespace AppConfig
