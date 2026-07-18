#include <Arduino.h>
#include <Wire.h>
#include <U8g2lib.h>
#include <DHT.h>
#include <math.h>
#include <string.h>

#include "ProductConfig.h"

namespace {

DHT dht(ProductConfig::DHT_PIN, ProductConfig::DHT_TYPE);

// Page-buffer mode keeps SRAM usage low on the UNO R3 (2 KB SRAM).
U8G2_SSD1306_128X64_NONAME_1_HW_I2C display(
    U8G2_R0,
    U8X8_PIN_NONE
);

float temperatureC = NAN;
float humidityPercent = NAN;
bool sensorReady = false;
bool oledReady = false;
uint8_t oledAddress = ProductConfig::OLED_ADDRESS_PRIMARY;
unsigned long lastSensorReadAt = 0UL;

bool isI2cDevicePresent(const uint8_t address)
{
    Wire.beginTransmission(address);
    return Wire.endTransmission() == 0;
}

bool detectOledAddress()
{
    if (isI2cDevicePresent(ProductConfig::OLED_ADDRESS_PRIMARY)) {
        oledAddress = ProductConfig::OLED_ADDRESS_PRIMARY;
        return true;
    }

    if (isI2cDevicePresent(ProductConfig::OLED_ADDRESS_SECONDARY)) {
        oledAddress = ProductConfig::OLED_ADDRESS_SECONDARY;
        return true;
    }

    return false;
}

void printBootInformation()
{
    Serial.println();
    Serial.println(F("========================================"));
    Serial.print(F("Product: "));
    Serial.println(ProductConfig::PRODUCT_NAME);
    Serial.print(F("Model: "));
    Serial.println(ProductConfig::PRODUCT_MODEL);
    Serial.print(F("Firmware: "));
    Serial.println(ProductConfig::FIRMWARE_VERSION);
    Serial.println(F("Board: Arduino UNO R3"));
    Serial.println(F("OLED: SSD1306 128x64 I2C"));
    Serial.println(F("OLED SDA: A4"));
    Serial.println(F("OLED SCL: A5"));
    Serial.print(F("DHT11 DATA: D"));
    Serial.println(ProductConfig::DHT_PIN);
    Serial.println(F("========================================"));
}

void readSensor()
{
    const float newHumidity = dht.readHumidity();
    const float newTemperature = dht.readTemperature();

    if (isnan(newHumidity) || isnan(newTemperature)) {
        temperatureC = NAN;
        humidityPercent = NAN;
        sensorReady = false;
        Serial.println(F("SensorManager: DHT11 read failed"));
        return;
    }

    temperatureC = newTemperature;
    humidityPercent = newHumidity;
    sensorReady = true;

    Serial.print(F("SensorManager: temperature="));
    Serial.print(temperatureC, 1);
    Serial.print(F(" C humidity="));
    Serial.print(humidityPercent, 1);
    Serial.println(F(" %"));
}

void formatMeasurement(
    const float value,
    char *output,
    const size_t outputSize
)
{
    if (output == nullptr || outputSize == 0U) {
        return;
    }

    if (isnan(value)) {
        strncpy(output, "--.-", outputSize - 1U);
        output[outputSize - 1U] = '\0';
        return;
    }

    dtostrf(value, 4, 1, output);
}

void drawCenteredText(
    const char *text,
    const uint8_t left,
    const uint8_t width,
    const uint8_t baseline
)
{
    if (text == nullptr) {
        return;
    }

    const uint8_t textWidth = display.getStrWidth(text);
    const uint8_t x = textWidth >= width
        ? left
        : static_cast<uint8_t>(left + ((width - textWidth) / 2U));

    display.drawStr(x, baseline, text);
}

void drawThermometerIcon(const uint8_t x, const uint8_t y)
{
    display.drawCircle(x + 3U, y + 8U, 3U);
    display.drawVLine(x + 3U, y, 7U);
    display.drawVLine(x + 2U, y, 7U);
    display.drawPixel(x + 3U, y + 8U);
}

void drawHumidityIcon(const uint8_t x, const uint8_t y)
{
    display.drawTriangle(
        x + 4U,
        y,
        x,
        y + 7U,
        x + 8U,
        y + 7U
    );
    display.drawCircle(x + 4U, y + 7U, 4U);
}

void drawStatusPill()
{
    const char *statusText = sensorReady ? "LIVE" : "ERR";
    const uint8_t pillX = 94U;
    const uint8_t pillY = 1U;
    const uint8_t pillW = 33U;
    const uint8_t pillH = 10U;

    display.setFont(u8g2_font_5x8_tf);

    if (sensorReady) {
        display.drawRBox(pillX, pillY, pillW, pillH, 2U);
        display.setDrawColor(0);
        drawCenteredText(statusText, pillX, pillW, 9U);
        display.setDrawColor(1);
    } else {
        display.drawRFrame(pillX, pillY, pillW, pillH, 2U);
        drawCenteredText(statusText, pillX, pillW, 9U);
    }
}

void drawMetricCard(
    const uint8_t x,
    const char *label,
    const char *value,
    const bool temperatureCard
)
{
    constexpr uint8_t CARD_Y = 16U;
    constexpr uint8_t CARD_W = 62U;
    constexpr uint8_t CARD_H = 34U;

    display.drawRFrame(x, CARD_Y, CARD_W, CARD_H, 3U);

    if (temperatureCard) {
        drawThermometerIcon(static_cast<uint8_t>(x + 5U), 20U);
    } else {
        drawHumidityIcon(static_cast<uint8_t>(x + 4U), 19U);
    }

    display.setFont(u8g2_font_5x8_tf);
    display.drawStr(static_cast<uint8_t>(x + 16U), 25U, label);

    display.setFont(u8g2_font_7x14B_tf);
    display.drawStr(static_cast<uint8_t>(x + 5U), 44U, value);

    display.setFont(u8g2_font_5x8_tf);

    if (temperatureCard) {
        // Small degree mark followed by C.
        display.drawCircle(static_cast<uint8_t>(x + 45U), 34U, 1U);
        display.drawStr(static_cast<uint8_t>(x + 49U), 42U, "C");
    } else {
        display.drawStr(static_cast<uint8_t>(x + 48U), 42U, "%");
    }
}

void drawStartupScreen()
{
    if (!oledReady) {
        return;
    }

    display.firstPage();
    do {
        display.drawRFrame(7U, 5U, 114U, 54U, 5U);

        display.setFont(u8g2_font_10x20_tf);
        drawCenteredText("dotTH", 8U, 112U, 27U);

        display.drawHLine(23U, 32U, 82U);

        display.setFont(u8g2_font_5x8_tf);
        drawCenteredText("UNO R3 SENSOR DISPLAY", 8U, 112U, 45U);

        display.drawDisc(57U, 52U, 1U);
        display.drawDisc(64U, 52U, 1U);
        display.drawDisc(71U, 52U, 1U);
    } while (display.nextPage());
}

void drawDashboard()
{
    if (!oledReady) {
        return;
    }

    char temperatureText[10] = {0};
    char humidityText[10] = {0};

    formatMeasurement(
        temperatureC,
        temperatureText,
        sizeof(temperatureText)
    );
    formatMeasurement(
        humidityPercent,
        humidityText,
        sizeof(humidityText)
    );

    display.firstPage();
    do {
        // Header
        display.setFont(u8g2_font_6x12_tf);
        display.drawStr(1U, 10U, "dotTH");
        drawStatusPill();
        display.drawHLine(0U, 13U, 128U);

        // Main metric cards
        drawMetricCard(0U, "TEMP", temperatureText, true);
        drawMetricCard(66U, "HUM", humidityText, false);

        // Footer status
        display.setFont(u8g2_font_5x8_tf);
        if (sensorReady) {
            display.drawDisc(4U, 57U, 2U);
            display.drawStr(10U, 60U, "DHT11");
            display.drawStr(42U, 60U, "UPDATE 2.5s");
        } else {
            display.drawCircle(4U, 57U, 2U);
            display.drawStr(10U, 60U, "CHECK DHT11 CONNECTION");
        }
    } while (display.nextPage());
}

void initializeDisplay()
{
    Wire.begin();

    if (!detectOledAddress()) {
        oledReady = false;
        Serial.println(F("DisplayManager: OLED not found at 0x3C or 0x3D"));
        Serial.println(F("DisplayManager: check VCC, GND, SDA=A4, SCL=A5"));
        return;
    }

    // U8g2 expects the 8-bit I2C address.
    display.setI2CAddress(static_cast<uint8_t>(oledAddress << 1U));
    display.begin();
    oledReady = true;

    Serial.print(F("DisplayManager: OLED initialized at 0x"));
    if (oledAddress < 0x10U) {
        Serial.print('0');
    }
    Serial.println(oledAddress, HEX);
}

} // namespace

void setup()
{
    Serial.begin(115200);
    delay(100);

    printBootInformation();

    initializeDisplay();
    dht.begin();

    drawStartupScreen();
    delay(ProductConfig::STARTUP_SCREEN_MS);

    readSensor();
    drawDashboard();
    lastSensorReadAt = millis();
}

void loop()
{
    const unsigned long now = millis();

    if (now - lastSensorReadAt >= ProductConfig::SENSOR_INTERVAL_MS) {
        lastSensorReadAt = now;
        readSensor();
        drawDashboard();
    }
}
