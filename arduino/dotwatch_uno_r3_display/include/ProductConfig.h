#pragma once

#include <Arduino.h>

namespace ProductConfig {

static constexpr char PRODUCT_NAME[] = "dotTH";
static constexpr char PRODUCT_MODEL[] = "UNO-R3-OLED-DHT11";
static constexpr char FIRMWARE_VERSION[] = "1.1.0";

// Arduino UNO R3 I2C pins are fixed by hardware:
// SDA = A4, SCL = A5
static constexpr uint8_t DHT_PIN = 2;
static constexpr uint8_t DHT_TYPE = 11; // DHT11

static constexpr uint8_t OLED_ADDRESS_PRIMARY = 0x3C;
static constexpr uint8_t OLED_ADDRESS_SECONDARY = 0x3D;

static constexpr unsigned long SENSOR_INTERVAL_MS = 2500UL;
static constexpr unsigned long STARTUP_SCREEN_MS = 1500UL;

} // namespace ProductConfig
