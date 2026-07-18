#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <DHT.h>

#include "AppConfig.h"

namespace {

Adafruit_SSD1306 display(
    AppConfig::OLED_WIDTH,
    AppConfig::OLED_HEIGHT,
    &Wire,
    AppConfig::OLED_RESET_PIN
);

DHT dht(AppConfig::DHT_PIN, AppConfig::DHT_TYPE);

uint8_t activeOledAddress = 0;
unsigned long lastSensorReadAt = 0;
unsigned long lastDisplayRefreshAt = 0;

float temperatureC = NAN;
float humidityPercent = NAN;
bool sensorReady = false;

bool isI2cDevicePresent(const uint8_t address) {
    Wire.beginTransmission(address);
    return Wire.endTransmission() == 0;
}

uint8_t detectOledAddress() {
    if (isI2cDevicePresent(AppConfig::OLED_PRIMARY_ADDRESS)) {
        return AppConfig::OLED_PRIMARY_ADDRESS;
    }

    if (isI2cDevicePresent(AppConfig::OLED_SECONDARY_ADDRESS)) {
        return AppConfig::OLED_SECONDARY_ADDRESS;
    }

    return 0;
}

void printBootInformation() {
    Serial.println();
    Serial.println(F("================================================"));
    Serial.print(F("Product: "));
    Serial.println(AppConfig::PRODUCT_NAME);
    Serial.print(F("Model: "));
    Serial.println(AppConfig::MODEL_NAME);
    Serial.print(F("Firmware: "));
    Serial.println(AppConfig::FIRMWARE_VERSION);
    Serial.println(F("OLED: SSD1306 128x64 I2C"));
    Serial.println(F("OLED SDA: D2 / GPIO4"));
    Serial.println(F("OLED SCL: D1 / GPIO5"));
    Serial.println(F("DHT11 DATA: D5 / GPIO14"));
    Serial.println(F("================================================"));
}

void printFatalOledError() {
    Serial.println();
    Serial.println(F("ERROR: OLED not detected."));
    Serial.println(F("Check the following wiring:"));
    Serial.println(F("  OLED VCC -> ESP8266 3V3"));
    Serial.println(F("  OLED GND -> ESP8266 GND"));
    Serial.println(F("  OLED SCL -> ESP8266 D1 / GPIO5"));
    Serial.println(F("  OLED SDA -> ESP8266 D2 / GPIO4"));
    Serial.println(F("Supported I2C addresses: 0x3C and 0x3D"));
}

void showStartupScreen() {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);

    display.setTextSize(2);
    display.setCursor(34, 8);
    display.print(F("dotTH"));

    display.setTextSize(1);
    display.setCursor(14, 34);
    display.print(F("ESP8266 OLED 0.96"));

    display.setCursor(34, 50);
    display.print(F("Starting..."));

    display.display();
}

void drawHeader() {
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);

    display.setCursor(0, 0);
    display.print(F("dotTH"));

    display.setCursor(sensorReady ? 86 : 92, 0);
    display.print(sensorReady ? F("ONLINE") : F("ERROR"));

    display.drawLine(0, 10, 127, 10, SSD1306_WHITE);
}

void drawTemperature() {
    display.setTextSize(1);
    display.setCursor(0, 16);
    display.print(F("TEMP"));

    display.setTextSize(2);
    display.setCursor(0, 28);

    if (isnan(temperatureC)) {
        display.print(F("--.-"));
    } else {
        display.print(temperatureC, 1);
    }

    display.setTextSize(1);
    display.print(F(" C"));
}

void drawHumidity() {
    display.setTextSize(1);
    display.setCursor(70, 16);
    display.print(F("HUM"));

    display.setTextSize(2);
    display.setCursor(68, 28);

    if (isnan(humidityPercent)) {
        display.print(F("--.-"));
    } else {
        display.print(humidityPercent, 1);
    }

    display.setTextSize(1);
    display.print(F("%"));
}

void drawFooter() {
    display.drawLine(0, 51, 127, 51, SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(0, 55);

    if (sensorReady) {
        display.print(F("Updated "));
        display.print(millis() / 1000UL);
        display.print(F("s"));
    } else {
        display.print(F("Check DHT11 wiring"));
    }
}

void renderDisplay() {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);

    drawHeader();
    drawTemperature();
    drawHumidity();
    drawFooter();

    display.display();
}

void readSensor() {
    const float nextHumidity = dht.readHumidity();
    const float nextTemperature = dht.readTemperature();

    if (isnan(nextHumidity) || isnan(nextTemperature)) {
        sensorReady = false;
        temperatureC = NAN;
        humidityPercent = NAN;
        Serial.println(F("DHT11 read failed."));
        return;
    }

    temperatureC = nextTemperature;
    humidityPercent = nextHumidity;
    sensorReady = true;

    Serial.print(F("Temperature: "));
    Serial.print(temperatureC, 1);
    Serial.print(F(" C | Humidity: "));
    Serial.print(humidityPercent, 1);
    Serial.println(F(" %"));
}

}  // namespace

void setup() {
    Serial.begin(115200);
    delay(100);

    printBootInformation();

    Wire.begin(AppConfig::OLED_SDA_PIN, AppConfig::OLED_SCL_PIN);
    Wire.setClock(400000UL);

    activeOledAddress = detectOledAddress();
    if (activeOledAddress == 0) {
        printFatalOledError();
        while (true) {
            delay(1000);
            yield();
        }
    }

    Serial.print(F("OLED detected at address 0x"));
    Serial.println(activeOledAddress, HEX);

    if (!display.begin(SSD1306_SWITCHCAPVCC, activeOledAddress)) {
        Serial.println(F("ERROR: SSD1306 framebuffer allocation failed."));
        while (true) {
            delay(1000);
            yield();
        }
    }

    display.clearDisplay();
    display.display();
    showStartupScreen();

    dht.begin();
    delay(1500);

    readSensor();
    renderDisplay();

    const unsigned long now = millis();
    lastSensorReadAt = now;
    lastDisplayRefreshAt = now;
}

void loop() {
    const unsigned long now = millis();

    if (now - lastSensorReadAt >= AppConfig::SENSOR_INTERVAL_MS) {
        lastSensorReadAt = now;
        readSensor();
    }

    if (now - lastDisplayRefreshAt >= AppConfig::DISPLAY_REFRESH_MS) {
        lastDisplayRefreshAt = now;
        renderDisplay();
    }

    delay(10);
    yield();
}
