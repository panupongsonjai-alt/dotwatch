#include "display/TftDisplay.h"

#include <Fonts/FreeSans9pt7b.h>
#include <Fonts/FreeSansBold9pt7b.h>
#include <Fonts/FreeSansBold18pt7b.h>
#include <Fonts/FreeSansBold24pt7b.h>
#include <SPI.h>
#include <WiFi.h>
#include <math.h>

#include "ProductConfig.h"

namespace {

constexpr int16_t SCREEN_WIDTH = 240;
constexpr int16_t SCREEN_HEIGHT = 320;
constexpr int16_t HEADER_HEIGHT = 61;

constexpr int16_t CARD_X = 8;
constexpr int16_t CARD_WIDTH = 224;
constexpr int16_t CARD_HEIGHT = 94;
constexpr int16_t TEMP_Y = 66;
constexpr int16_t HUMIDITY_Y = 164;

constexpr int16_t FOOTER_Y = 264;
constexpr int16_t FOOTER_HEIGHT = SCREEN_HEIGHT - FOOTER_Y;

constexpr uint16_t rgb565(uint8_t red, uint8_t green, uint8_t blue) {
  return static_cast<uint16_t>(
      ((red & 0xF8U) << 8U) |
      ((green & 0xFCU) << 3U) |
      (blue >> 3U));
}

constexpr uint16_t COLOR_BACKGROUND = rgb565(9, 7, 10);
constexpr uint16_t COLOR_SURFACE = rgb565(24, 18, 21);
constexpr uint16_t COLOR_SURFACE_RAISED = rgb565(35, 24, 28);
constexpr uint16_t COLOR_HEADER = rgb565(19, 11, 14);
constexpr uint16_t COLOR_RED_PRIMARY = rgb565(220, 35, 51);
constexpr uint16_t COLOR_RED_BRIGHT = rgb565(255, 63, 78);
constexpr uint16_t COLOR_RED_DARK = rgb565(104, 17, 29);
constexpr uint16_t COLOR_RED_MUTED = rgb565(128, 42, 53);
constexpr uint16_t COLOR_ROSE = rgb565(244, 91, 117);
constexpr uint16_t COLOR_BORDER = rgb565(72, 44, 50);
constexpr uint16_t COLOR_DIVIDER = rgb565(58, 35, 41);
constexpr uint16_t COLOR_TEXT = ILI9341_WHITE;
constexpr uint16_t COLOR_TEXT_SECONDARY = rgb565(211, 193, 198);
constexpr uint16_t COLOR_TEXT_MUTED = rgb565(146, 125, 131);
constexpr uint16_t COLOR_SUCCESS = rgb565(55, 210, 122);
constexpr uint16_t COLOR_WARNING = rgb565(255, 184, 77);
constexpr uint16_t COLOR_DANGER = rgb565(255, 74, 85);
constexpr uint16_t COLOR_INFO = rgb565(105, 164, 255);
constexpr uint16_t COLOR_GAUGE_TRACK = rgb565(57, 39, 44);

constexpr unsigned long LIVE_PULSE_INTERVAL_MS = 650UL;

float clampFloat(float value, float minimum, float maximum) {
  if (value < minimum) return minimum;
  if (value > maximum) return maximum;
  return value;
}

}  // namespace

TftDisplay::TftDisplay()
    : tft_(
          ProductConfig::TFT_CS_PIN,
          ProductConfig::TFT_DC_PIN,
          ProductConfig::TFT_RST_PIN) {}

void TftDisplay::begin() {
  if (!ProductConfig::TFT_ENABLED) return;

  SPI.begin(
      ProductConfig::TFT_SCK_PIN,
      ProductConfig::TFT_MISO_PIN,
      ProductConfig::TFT_MOSI_PIN,
      ProductConfig::TFT_CS_PIN);

  tft_.begin(ProductConfig::TFT_SPI_FREQUENCY_HZ);
  tft_.setRotation(ProductConfig::TFT_ROTATION);
  tft_.invertDisplay(ProductConfig::TFT_INVERT_COLORS);
  tft_.setTextWrap(false);
  tft_.fillScreen(COLOR_BACKGROUND);

  ready_ = true;
  firstDraw_ = true;
  resetSessionExtrema();
  drawFrame();

  Serial.println("TftDisplay: dotWatch smooth red dashboard UI initialized");
}

void TftDisplay::tick(const RuntimeStatus &status) {
  if (!ready_) return;

  const unsigned long now = millis();
  if (now - lastRefreshAt_ < ProductConfig::TFT_REFRESH_INTERVAL_MS) return;
  lastRefreshAt_ = now;

  updateSessionExtrema(status);

  const bool pulseOn = ((now / LIVE_PULSE_INTERVAL_MS) % 2UL) == 0UL;
  const unsigned long footerSecond = now / 1000UL;
  const bool footerTimeChanged = firstDraw_ || footerSecond != lastFooterSecond_;

  const bool statusChanged =
      firstDraw_ ||
      status.state != lastState_ ||
      status.wifiConnected != lastWifiConnected_ ||
      status.backendConnected != lastBackendConnected_ ||
      status.lastSensorFallbackUsed != lastFallbackUsed_;

  const bool sensorChanged =
      firstDraw_ ||
      status.sensorReadingAvailable != lastSensorAvailable_ ||
      valueChanged(status.lastTemperature, lastTemperature_) ||
      valueChanged(status.lastHumidity, lastHumidity_);

  if (sensorChanged) {
    drawMetricCard(
        TEMP_Y,
        "TEMPERATURE",
        status.lastTemperature,
        minTemperature_,
        maxTemperature_,
        "C",
        COLOR_RED_BRIGHT,
        -10.0f,
        60.0f,
        status.sensorReadingAvailable,
        true);

    drawMetricCard(
        HUMIDITY_Y,
        "HUMIDITY",
        status.lastHumidity,
        minHumidity_,
        maxHumidity_,
        "%",
        COLOR_ROSE,
        0.0f,
        100.0f,
        status.sensorReadingAvailable,
        false);
  }

  if (statusChanged || sensorChanged || footerTimeChanged) {
    drawFooter(status);
  }

  if (statusChanged || pulseChanged(pulseOn)) {
    drawHeaderStatus(status, pulseOn);
  }

  lastPulseOn_ = pulseOn;
  lastFooterSecond_ = footerSecond;
  lastState_ = status.state;
  lastWifiConnected_ = status.wifiConnected;
  lastBackendConnected_ = status.backendConnected;
  lastSensorAvailable_ = status.sensorReadingAvailable;
  lastFallbackUsed_ = status.lastSensorFallbackUsed;
  lastTemperature_ = status.lastTemperature;
  lastHumidity_ = status.lastHumidity;
  firstDraw_ = false;
}

bool TftDisplay::ready() const {
  return ready_;
}

void TftDisplay::drawFrame() {
  tft_.fillScreen(COLOR_BACKGROUND);

  // Three red accent layers preserve the dotWatch dashboard identity.
  tft_.fillRect(0, 0, SCREEN_WIDTH, 4, COLOR_RED_BRIGHT);
  tft_.fillRect(0, 4, SCREEN_WIDTH, 3, COLOR_RED_PRIMARY);
  tft_.fillRect(0, 7, SCREEN_WIDTH, 2, COLOR_RED_DARK);

  drawHeader();

  tft_.fillRoundRect(CARD_X, TEMP_Y, CARD_WIDTH, CARD_HEIGHT, 12, COLOR_SURFACE);
  tft_.drawRoundRect(CARD_X, TEMP_Y, CARD_WIDTH, CARD_HEIGHT, 12, COLOR_BORDER);

  tft_.fillRoundRect(CARD_X, HUMIDITY_Y, CARD_WIDTH, CARD_HEIGHT, 12, COLOR_SURFACE);
  tft_.drawRoundRect(CARD_X, HUMIDITY_Y, CARD_WIDTH, CARD_HEIGHT, 12, COLOR_BORDER);

  tft_.fillRect(0, FOOTER_Y, SCREEN_WIDTH, FOOTER_HEIGHT, COLOR_HEADER);
  tft_.drawFastHLine(0, FOOTER_Y, SCREEN_WIDTH, COLOR_RED_DARK);
}

void TftDisplay::drawHeader() {
  tft_.fillRect(0, 9, SCREEN_WIDTH, HEADER_HEIGHT - 9, COLOR_HEADER);
  tft_.drawFastHLine(0, HEADER_HEIGHT - 1, SCREEN_WIDTH, COLOR_DIVIDER);

  drawText("dotWatch", 10, 39, &FreeSansBold18pt7b, COLOR_TEXT);
  drawText("ENVIRONMENT MONITOR", 11, 55, &FreeSans9pt7b, COLOR_RED_BRIGHT);
}

void TftDisplay::drawHeaderStatus(const RuntimeStatus &status, bool pulseOn) {
  constexpr int16_t chipX = 172;
  constexpr int16_t chipY = 16;
  constexpr int16_t chipWidth = 60;
  constexpr int16_t chipHeight = 29;

  const bool live = status.sensorReadingAvailable;
  const bool simulated = live && status.lastSensorFallbackUsed;

  const uint16_t chipBorder = simulated
                                  ? COLOR_WARNING
                                  : (live ? COLOR_RED_MUTED : COLOR_BORDER);

  const uint16_t dotColor = simulated
                                ? COLOR_WARNING
                                : (live
                                       ? (pulseOn ? COLOR_RED_BRIGHT : COLOR_RED_DARK)
                                       : COLOR_TEXT_MUTED);

  tft_.fillRoundRect(chipX, chipY, chipWidth, chipHeight, 9, COLOR_SURFACE_RAISED);
  tft_.drawRoundRect(chipX, chipY, chipWidth, chipHeight, 9, chipBorder);
  tft_.fillCircle(chipX + 11, chipY + 14, 4, dotColor);

  drawText(
      simulated ? "SIM" : (live ? "LIVE" : "WAIT"),
      chipX + 20,
      chipY + 20,
      &FreeSansBold9pt7b,
      simulated ? COLOR_WARNING : (live ? COLOR_TEXT : COLOR_TEXT_MUTED));
}

void TftDisplay::drawFooter(const RuntimeStatus &status) {
  tft_.fillRect(0, FOOTER_Y + 1, SCREEN_WIDTH, FOOTER_HEIGHT - 1, COLOR_HEADER);

  drawStatusChip(
      7,
      FOOTER_Y + 7,
      94,
      stateText(status.state),
      stateColor(status.state),
      COLOR_TEXT);

  drawStatusChip(
      105,
      FOOTER_Y + 7,
      59,
      status.backendConnected ? "SERVER" : "WAIT",
      status.backendConnected ? COLOR_SUCCESS : COLOR_DANGER,
      status.backendConnected ? COLOR_TEXT : COLOR_TEXT_MUTED);

  const bool wifiConnected = WiFi.status() == WL_CONNECTED;
  const int rssi = wifiConnected ? WiFi.RSSI() : 0;

  char wifiBuffer[16];
  if (wifiConnected) {
    snprintf(wifiBuffer, sizeof(wifiBuffer), "%ddB", rssi);
  } else {
    snprintf(wifiBuffer, sizeof(wifiBuffer), "OFF");
  }

  drawStatusChip(
      168,
      FOOTER_Y + 7,
      65,
      wifiBuffer,
      wifiConnected ? COLOR_SUCCESS : COLOR_DANGER,
      wifiConnected ? COLOR_TEXT : COLOR_TEXT_MUTED);

  char ipBuffer[28];
  if (wifiConnected) {
    const String ip = WiFi.localIP().toString();
    snprintf(ipBuffer, sizeof(ipBuffer), "IP %s", ip.c_str());
  } else {
    snprintf(ipBuffer, sizeof(ipBuffer), "IP --.--.--.--");
  }

  drawText(
      ipBuffer,
      9,
      FOOTER_Y + 50,
      &FreeSans9pt7b,
      wifiConnected ? COLOR_TEXT_SECONDARY : COLOR_TEXT_MUTED);

  char ageBuffer[18];
  if (!status.sensorReadingAvailable || status.lastSensorReadAtMs == 0UL) {
    snprintf(ageBuffer, sizeof(ageBuffer), "AGE --s");
  } else {
    const unsigned long ageSeconds =
        (millis() - status.lastSensorReadAtMs) / 1000UL;
    snprintf(ageBuffer, sizeof(ageBuffer), "AGE %lus", ageSeconds);
  }

  drawRightAlignedText(
      ageBuffer,
      231,
      FOOTER_Y + 50,
      &FreeSans9pt7b,
      COLOR_TEXT_SECONDARY);
}

void TftDisplay::drawStatusChip(
    int16_t x,
    int16_t y,
    int16_t width,
    const char *text,
    uint16_t indicatorColor,
    uint16_t textColor) {
  constexpr int16_t chipHeight = 25;

  tft_.fillRoundRect(x, y, width, chipHeight, 7, COLOR_SURFACE_RAISED);
  tft_.drawRoundRect(x, y, width, chipHeight, 7, COLOR_BORDER);
  tft_.fillCircle(x + 11, y + 12, 4, indicatorColor);

  drawText(
      text,
      x + 21,
      y + 18,
      &FreeSansBold9pt7b,
      textColor);
}

void TftDisplay::drawMetricCard(
    int16_t y,
    const char *label,
    float value,
    float sessionMin,
    float sessionMax,
    const char *unit,
    uint16_t accent,
    float gaugeMin,
    float gaugeMax,
    bool available,
    bool temperatureCard) {
  tft_.fillRoundRect(
      CARD_X + 1,
      y + 1,
      CARD_WIDTH - 2,
      CARD_HEIGHT - 2,
      11,
      COLOR_SURFACE);

  // Accent rail and subtle top line improve separation without bitmap artwork.
  tft_.fillRoundRect(CARD_X + 1, y + 1, 6, CARD_HEIGHT - 2, 4, accent);
  tft_.drawFastHLine(CARD_X + 15, y + 1, CARD_WIDTH - 27, COLOR_DIVIDER);

  drawMetricIcon(CARD_X + 32, y + 47, accent, temperatureCard);
  drawText(label, CARD_X + 60, y + 24, &FreeSansBold9pt7b, COLOR_TEXT_SECONDARY);

  char valueBuffer[16];
  if (!available || isnan(value)) {
    snprintf(valueBuffer, sizeof(valueBuffer), "--.-");
  } else {
    snprintf(valueBuffer, sizeof(valueBuffer), "%.1f", value);
  }

  drawCenteredText(
      valueBuffer,
      CARD_X + 122,
      y + 62,
      &FreeSansBold24pt7b,
      COLOR_TEXT);

  if (temperatureCard) {
    tft_.drawCircle(CARD_X + 185, y + 39, 3, accent);
    drawText(unit, CARD_X + 191, y + 61, &FreeSansBold18pt7b, accent);
  } else {
    drawText(unit, CARD_X + 184, y + 61, &FreeSansBold18pt7b, accent);
  }

  char minBuffer[18];
  char maxBuffer[18];

  if (available && !isnan(sessionMin)) {
    snprintf(minBuffer, sizeof(minBuffer), "MIN %.1f", sessionMin);
  } else {
    snprintf(minBuffer, sizeof(minBuffer), "MIN --.-");
  }

  if (available && !isnan(sessionMax)) {
    snprintf(maxBuffer, sizeof(maxBuffer), "MAX %.1f", sessionMax);
  } else {
    snprintf(maxBuffer, sizeof(maxBuffer), "MAX --.-");
  }

  drawText(
      minBuffer,
      CARD_X + 60,
      y + 80,
      &FreeSans9pt7b,
      COLOR_TEXT_MUTED);

  drawRightAlignedText(
      maxBuffer,
      CARD_X + 211,
      y + 80,
      &FreeSans9pt7b,
      COLOR_TEXT_MUTED);

  drawGauge(
      CARD_X + 60,
      y + 85,
      150,
      value,
      gaugeMin,
      gaugeMax,
      accent,
      available);

  tft_.drawRoundRect(CARD_X, y, CARD_WIDTH, CARD_HEIGHT, 12, COLOR_BORDER);
}

void TftDisplay::drawMetricIcon(
    int16_t centerX,
    int16_t centerY,
    uint16_t accent,
    bool temperatureCard) {
  tft_.fillCircle(centerX, centerY, 22, COLOR_SURFACE_RAISED);
  tft_.drawCircle(centerX, centerY, 22, COLOR_RED_DARK);
  tft_.drawCircle(centerX, centerY, 21, COLOR_BORDER);

  if (temperatureCard) {
    tft_.drawRoundRect(centerX - 4, centerY - 15, 8, 25, 4, accent);
    tft_.drawRoundRect(centerX - 3, centerY - 14, 6, 23, 3, accent);
    tft_.fillRect(centerX - 1, centerY - 10, 3, 18, accent);
    tft_.fillCircle(centerX, centerY + 11, 8, accent);
    tft_.fillCircle(centerX, centerY + 11, 4, COLOR_TEXT);
  } else {
    tft_.fillTriangle(
        centerX,
        centerY - 18,
        centerX - 12,
        centerY + 3,
        centerX + 12,
        centerY + 3,
        accent);
    tft_.fillCircle(centerX, centerY + 5, 12, accent);
    tft_.fillCircle(centerX - 4, centerY + 1, 3, COLOR_TEXT);
    tft_.drawPixel(centerX - 5, centerY, COLOR_TEXT);
  }
}

void TftDisplay::drawGauge(
    int16_t x,
    int16_t y,
    int16_t width,
    float value,
    float minimum,
    float maximum,
    uint16_t accent,
    bool available) {
  constexpr int16_t gaugeHeight = 6;

  tft_.fillRoundRect(x, y, width, gaugeHeight, 3, COLOR_GAUGE_TRACK);
  tft_.drawRoundRect(x, y, width, gaugeHeight, 3, COLOR_DIVIDER);

  if (!available || isnan(value) || maximum <= minimum) return;

  const float normalized =
      (clampFloat(value, minimum, maximum) - minimum) /
      (maximum - minimum);

  int16_t fillWidth =
      static_cast<int16_t>(normalized * static_cast<float>(width));

  if (fillWidth < gaugeHeight) fillWidth = gaugeHeight;
  if (fillWidth > width) fillWidth = width;

  tft_.fillRoundRect(x, y, fillWidth, gaugeHeight, 3, accent);

  if (fillWidth > 12) {
    tft_.drawFastHLine(x + 4, y + 1, fillWidth - 8, COLOR_RED_BRIGHT);
  }
}

void TftDisplay::drawText(
    const char *text,
    int16_t x,
    int16_t baselineY,
    const GFXfont *font,
    uint16_t color) {
  tft_.setFont(font);
  tft_.setTextColor(color);
  tft_.setCursor(x, baselineY);
  tft_.print(text);
}

void TftDisplay::drawCenteredText(
    const char *text,
    int16_t centerX,
    int16_t baselineY,
    const GFXfont *font,
    uint16_t color) {
  int16_t x1 = 0;
  int16_t y1 = 0;
  uint16_t width = 0;
  uint16_t height = 0;

  tft_.setFont(font);
  tft_.getTextBounds(text, 0, baselineY, &x1, &y1, &width, &height);

  const int16_t x =
      centerX - static_cast<int16_t>(x1) -
      static_cast<int16_t>(width / 2U);

  tft_.setTextColor(color);
  tft_.setCursor(x, baselineY);
  tft_.print(text);
}

void TftDisplay::drawRightAlignedText(
    const char *text,
    int16_t rightX,
    int16_t baselineY,
    const GFXfont *font,
    uint16_t color) {
  int16_t x1 = 0;
  int16_t y1 = 0;
  uint16_t width = 0;
  uint16_t height = 0;

  tft_.setFont(font);
  tft_.getTextBounds(text, 0, baselineY, &x1, &y1, &width, &height);

  const int16_t x =
      rightX - static_cast<int16_t>(x1) -
      static_cast<int16_t>(width);

  tft_.setTextColor(color);
  tft_.setCursor(x, baselineY);
  tft_.print(text);
}

void TftDisplay::updateSessionExtrema(const RuntimeStatus &status) {
  if (!status.sensorReadingAvailable) return;

  if (!isnan(status.lastTemperature)) {
    if (isnan(minTemperature_) || status.lastTemperature < minTemperature_) {
      minTemperature_ = status.lastTemperature;
    }
    if (isnan(maxTemperature_) || status.lastTemperature > maxTemperature_) {
      maxTemperature_ = status.lastTemperature;
    }
  }

  if (!isnan(status.lastHumidity)) {
    if (isnan(minHumidity_) || status.lastHumidity < minHumidity_) {
      minHumidity_ = status.lastHumidity;
    }
    if (isnan(maxHumidity_) || status.lastHumidity > maxHumidity_) {
      maxHumidity_ = status.lastHumidity;
    }
  }
}

void TftDisplay::resetSessionExtrema() {
  minTemperature_ = NAN;
  maxTemperature_ = NAN;
  minHumidity_ = NAN;
  maxHumidity_ = NAN;
}

const char *TftDisplay::stateText(AppState state) const {
  switch (state) {
    case AppState::BOOTING:
      return "BOOTING";
    case AppState::UNPROVISIONED:
      return "SETUP";
    case AppState::SETUP_PORTAL:
      return "PORTAL";
    case AppState::CONNECTING_WIFI:
      return "WIFI";
    case AppState::CONNECTING_BACKEND:
      return "SERVER";
    case AppState::ONLINE:
      return "ONLINE";
    case AppState::DEGRADED:
      return "DEGRADED";
    case AppState::RECOVERY:
      return "RECOVERY";
    case AppState::UPDATING:
      return "UPDATING";
    default:
      return "UNKNOWN";
  }
}

uint16_t TftDisplay::stateColor(AppState state) const {
  switch (state) {
    case AppState::ONLINE:
      return COLOR_SUCCESS;
    case AppState::DEGRADED:
    case AppState::RECOVERY:
      return COLOR_DANGER;
    case AppState::SETUP_PORTAL:
    case AppState::UNPROVISIONED:
      return COLOR_WARNING;
    case AppState::CONNECTING_WIFI:
    case AppState::CONNECTING_BACKEND:
    case AppState::UPDATING:
      return COLOR_INFO;
    case AppState::BOOTING:
    default:
      return COLOR_TEXT_MUTED;
  }
}

bool TftDisplay::valueChanged(float current, float previous) const {
  if (isnan(current) != isnan(previous)) return true;
  if (isnan(current) && isnan(previous)) return false;
  return fabsf(current - previous) >= 0.05f;
}

bool TftDisplay::pulseChanged(bool pulseOn) const {
  return firstDraw_ || pulseOn != lastPulseOn_;
}
