#include "display/TftDisplay.h"

#include <SPI.h>
#include <WiFi.h>
#include <math.h>

#include "ProductConfig.h"

namespace {

constexpr uint32_t COLOR_BACKGROUND_HEX = 0x050607;
constexpr uint32_t COLOR_PANEL_HEX = 0x0C0F11;
constexpr uint32_t COLOR_PANEL_RAISED_HEX = 0x121619;
constexpr uint32_t COLOR_PANEL_HIGHLIGHT_HEX = 0x181C20;
constexpr uint32_t COLOR_BORDER_HEX = 0x30363C;
constexpr uint32_t COLOR_DIVIDER_HEX = 0x22272C;
constexpr uint32_t COLOR_TEXT_HEX = 0xF5F7F9;
constexpr uint32_t COLOR_TEXT_MUTED_HEX = 0xAEB6BE;
constexpr uint32_t COLOR_TEXT_SOFT_HEX = 0x747E87;
constexpr uint32_t COLOR_RED_HEX = 0xF14950;
constexpr uint32_t COLOR_RED_BRIGHT_HEX = 0xFF5A61;
constexpr uint32_t COLOR_RED_DIM_HEX = 0x351416;
constexpr uint32_t COLOR_GREEN_HEX = 0x43D66F;
constexpr uint32_t COLOR_GREEN_DIM_HEX = 0x112319;
constexpr uint32_t COLOR_ORANGE_HEX = 0xFFB454;
constexpr uint32_t COLOR_ORANGE_DIM_HEX = 0x2D2415;
constexpr uint32_t COLOR_INFO_HEX = 0x64B7E8;
constexpr uint32_t COLOR_INFO_DIM_HEX = 0x14232D;
constexpr uint32_t COLOR_OFF_HEX = 0x5A646D;
constexpr uint32_t COLOR_OFF_DIM_HEX = 0x15191C;

constexpr unsigned long LVGL_HANDLER_INTERVAL_MS = 5UL;

lv_color_t color(uint32_t value) {
  return lv_color_hex(value);
}

static const lv_point_t HUMIDITY_DROP_POINTS[] = {
    {17, 1},
    {8, 14},
    {4, 21},
    {4, 29},
    {8, 37},
    {13, 41},
    {17, 43},
    {21, 41},
    {26, 37},
    {30, 29},
    {30, 21},
    {26, 14},
    {17, 1},
};

static const lv_point_t BOLT_POINTS[] = {
    {8, 1},
    {3, 9},
    {8, 9},
    {6, 16},
    {14, 7},
    {9, 7},
    {12, 1},
};

}  // namespace

TftDisplay::TftDisplay()
    : tft_(
          ProductConfig::TFT_CS_PIN,
          ProductConfig::TFT_DC_PIN,
          ProductConfig::TFT_RST_PIN) {}

void TftDisplay::begin() {
  if (!ProductConfig::TFT_ENABLED) return;

  if (ProductConfig::POWER_SENSE_PIN >= 0) {
    pinMode(ProductConfig::POWER_SENSE_PIN, INPUT);
  }

  SPI.begin(
      ProductConfig::TFT_SCK_PIN,
      ProductConfig::TFT_MISO_PIN,
      ProductConfig::TFT_MOSI_PIN,
      ProductConfig::TFT_CS_PIN);

  tft_.begin(ProductConfig::TFT_SPI_FREQUENCY_HZ);
  tft_.setRotation(ProductConfig::TFT_ROTATION);
  tft_.invertDisplay(ProductConfig::TFT_INVERT_COLORS);
  tft_.fillScreen(ILI9341_BLACK);

  lv_init();

  lv_disp_draw_buf_init(
      &drawBufferDescriptor_,
      drawBuffer_,
      nullptr,
      DISPLAY_WIDTH * DRAW_BUFFER_ROWS);

  lv_disp_drv_init(&displayDriver_);
  displayDriver_.hor_res = DISPLAY_WIDTH;
  displayDriver_.ver_res = DISPLAY_HEIGHT;
  displayDriver_.flush_cb = flushDisplay;
  displayDriver_.draw_buf = &drawBufferDescriptor_;
  displayDriver_.user_data = this;
  lv_disp_drv_register(&displayDriver_);

  createDashboard();

  const unsigned long now = millis();
  lastLvglTickAt_ = now;
  lastHandlerAt_ = now;
  lastUiRefreshAt_ = now;
  lastPowerConnected_ = readPowerConnected();

  ready_ = true;
  firstDraw_ = true;

  Serial.println("TftDisplay: portrait product UI initialized");
}

void TftDisplay::tick(const RuntimeStatus &status) {
  if (!ready_) return;

  const unsigned long now = millis();
  const unsigned long elapsed = now - lastLvglTickAt_;

  if (elapsed > 0UL) {
    lv_tick_inc(static_cast<uint32_t>(elapsed));
    lastLvglTickAt_ = now;
  }

  if (now - lastUiRefreshAt_ >= ProductConfig::TFT_REFRESH_INTERVAL_MS) {
    updateDashboard(status, firstDraw_);
    lastUiRefreshAt_ = now;
    firstDraw_ = false;
  }

  if (now - lastHandlerAt_ >= LVGL_HANDLER_INTERVAL_MS) {
    lv_timer_handler();
    lastHandlerAt_ = now;
  }
}

bool TftDisplay::ready() const {
  return ready_;
}

void TftDisplay::flushDisplay(
    lv_disp_drv_t *displayDriver,
    const lv_area_t *area,
    lv_color_t *colorMap) {
  if (displayDriver == nullptr || area == nullptr || colorMap == nullptr) {
    return;
  }

  auto *display = static_cast<TftDisplay *>(displayDriver->user_data);
  if (display == nullptr) {
    lv_disp_flush_ready(displayDriver);
    return;
  }

  const int16_t width = area->x2 - area->x1 + 1;
  const int16_t height = area->y2 - area->y1 + 1;

  display->tft_.drawRGBBitmap(
      area->x1,
      area->y1,
      reinterpret_cast<uint16_t *>(colorMap),
      width,
      height);

  lv_disp_flush_ready(displayDriver);
}

void TftDisplay::createDashboard() {
  screen_ = lv_scr_act();
  styleBaseObject(screen_);
  lv_obj_set_style_bg_color(screen_, color(COLOR_BACKGROUND_HEX), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(screen_, LV_OPA_COVER, LV_PART_MAIN);

  createHeader();
  createMetricCard(
      70,
      true,
      temperatureValueLabel_,
      temperatureUnitLabel_,
      temperatureStatusPill_,
      temperatureStatusDot_,
      temperatureStatusLabel_);
  createMetricCard(
      170,
      false,
      humidityValueLabel_,
      humidityUnitLabel_,
      humidityStatusPill_,
      humidityStatusDot_,
      humidityStatusLabel_);
  createConnectionCard();
}

void TftDisplay::createHeader() {
  lv_obj_t *header = lv_obj_create(screen_);
  lv_obj_set_pos(header, 8, 8);
  lv_obj_set_size(header, 224, 54);
  styleCard(header);
  lv_obj_set_style_bg_color(header, color(COLOR_PANEL_RAISED_HEX), LV_PART_MAIN);
  lv_obj_set_style_bg_grad_color(header, color(COLOR_PANEL_HEX), LV_PART_MAIN);
  lv_obj_set_style_bg_grad_dir(header, LV_GRAD_DIR_HOR, LV_PART_MAIN);

  lv_obj_t *brandDot = lv_label_create(header);
  lv_label_set_text(brandDot, "dot");
  lv_obj_set_pos(brandDot, 11, 4);
  styleLabel(brandDot, &lv_font_montserrat_28, color(COLOR_RED_HEX), -1);

  lv_obj_t *brandWatch = lv_label_create(header);
  lv_label_set_text(brandWatch, "Watch");
  lv_obj_set_pos(brandWatch, 51, 4);
  styleLabel(brandWatch, &lv_font_montserrat_28, color(COLOR_TEXT_HEX), -1);

  lv_obj_t *modelPill = lv_obj_create(header);
  lv_obj_set_pos(modelPill, 12, 35);
  lv_obj_set_size(modelPill, 76, 16);
  stylePill(modelPill, color(COLOR_RED_DIM_HEX), color(COLOR_RED_HEX));

  lv_obj_t *modelLabel = lv_label_create(modelPill);
  lv_label_set_text(modelLabel, "ESP32 DHT");
  lv_obj_set_pos(modelLabel, 9, 0);
  styleLabel(modelLabel, &lv_font_montserrat_12, color(COLOR_RED_HEX));

  lv_obj_t *dividerOne = lv_obj_create(header);
  lv_obj_set_pos(dividerOne, 137, 8);
  lv_obj_set_size(dividerOne, 1, 38);
  styleBar(dividerOne, color(COLOR_DIVIDER_HEX), 0);

  lv_obj_t *dividerTwo = lv_obj_create(header);
  lv_obj_set_pos(dividerTwo, 186, 8);
  lv_obj_set_size(dividerTwo, 1, 38);
  styleBar(dividerTwo, color(COLOR_DIVIDER_HEX), 0);

  createWiFiGroup(header, 146, 7);
  createPowerGroup(header, 196, 7);
}

void TftDisplay::createWiFiGroup(lv_obj_t *parent, int16_t x, int16_t y) {
  const int16_t heights[4] = {4, 7, 10, 14};
  const int16_t offsets[4] = {0, 5, 10, 15};

  for (int i = 0; i < 4; ++i) {
    wifiBars_[i] = lv_obj_create(parent);
    lv_obj_set_pos(wifiBars_[i], x + offsets[i], y + (14 - heights[i]));
    lv_obj_set_size(wifiBars_[i], 3, heights[i]);
    styleBar(wifiBars_[i], color(COLOR_OFF_HEX));
  }

  lv_obj_t *label = lv_label_create(parent);
  lv_label_set_text(label, "Wi-Fi");
  lv_obj_set_pos(label, x - 5, y + 17);
  styleLabel(label, &lv_font_montserrat_12, color(COLOR_TEXT_MUTED_HEX));

  wifiDetailLabel_ = lv_label_create(parent);
  lv_label_set_text(wifiDetailLabel_, "OFF");
  lv_obj_set_pos(wifiDetailLabel_, x - 7, y + 31);
  lv_obj_set_width(wifiDetailLabel_, 42);
  lv_obj_set_style_text_align(wifiDetailLabel_, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
  styleLabel(wifiDetailLabel_, &lv_font_montserrat_12, color(COLOR_TEXT_SOFT_HEX));
}

void TftDisplay::createPowerGroup(lv_obj_t *parent, int16_t x, int16_t y) {
  powerBody_ = lv_obj_create(parent);
  lv_obj_set_pos(powerBody_, x, y + 1);
  lv_obj_set_size(powerBody_, 18, 11);
  styleBaseObject(powerBody_);
  lv_obj_set_style_bg_opa(powerBody_, LV_OPA_TRANSP, LV_PART_MAIN);
  lv_obj_set_style_border_color(powerBody_, color(COLOR_TEXT_HEX), LV_PART_MAIN);
  lv_obj_set_style_border_width(powerBody_, 2, LV_PART_MAIN);
  lv_obj_set_style_radius(powerBody_, 2, LV_PART_MAIN);

  powerCap_ = lv_obj_create(parent);
  lv_obj_set_pos(powerCap_, x + 18, y + 4);
  lv_obj_set_size(powerCap_, 3, 5);
  styleBar(powerCap_, color(COLOR_TEXT_HEX));

  powerFill_ = lv_obj_create(parent);
  lv_obj_set_pos(powerFill_, x + 3, y + 4);
  lv_obj_set_size(powerFill_, 10, 5);
  styleBar(powerFill_, color(COLOR_TEXT_HEX));

  powerBolt_ = lv_line_create(parent);
  lv_line_set_points(
      powerBolt_,
      BOLT_POINTS,
      sizeof(BOLT_POINTS) / sizeof(BOLT_POINTS[0]));
  lv_obj_set_pos(powerBolt_, x + 2, y - 2);
  lv_obj_set_size(powerBolt_, 14, 17);
  lv_obj_set_style_line_color(powerBolt_, color(COLOR_TEXT_HEX), LV_PART_MAIN);
  lv_obj_set_style_line_width(powerBolt_, 2, LV_PART_MAIN);
  lv_obj_set_style_line_rounded(powerBolt_, true, LV_PART_MAIN);

  lv_obj_t *label = lv_label_create(parent);
  lv_label_set_text(label, "PWR");
  lv_obj_set_pos(label, x - 1, y + 17);
  styleLabel(label, &lv_font_montserrat_12, color(COLOR_TEXT_MUTED_HEX));

  powerDetailLabel_ = lv_label_create(parent);
  lv_label_set_text(powerDetailLabel_, "ON");
  lv_obj_set_pos(powerDetailLabel_, x - 2, y + 31);
  lv_obj_set_width(powerDetailLabel_, 24);
  lv_obj_set_style_text_align(powerDetailLabel_, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
  styleLabel(powerDetailLabel_, &lv_font_montserrat_12, color(COLOR_INFO_HEX));
}

void TftDisplay::createMetricCard(
    int16_t y,
    bool temperatureCard,
    lv_obj_t *&valueLabel,
    lv_obj_t *&unitLabel,
    lv_obj_t *&statusPill,
    lv_obj_t *&statusDot,
    lv_obj_t *&statusLabel) {
  lv_obj_t *card = lv_obj_create(screen_);
  lv_obj_set_pos(card, 8, y);
  lv_obj_set_size(card, 224, 92);
  styleCard(card);
  lv_obj_set_style_bg_grad_color(card, color(COLOR_PANEL_RAISED_HEX), LV_PART_MAIN);
  lv_obj_set_style_bg_grad_dir(card, LV_GRAD_DIR_HOR, LV_PART_MAIN);

  lv_obj_t *accent = lv_obj_create(card);
  lv_obj_set_pos(accent, 0, 0);
  lv_obj_set_size(accent, 4, 92);
  styleBar(accent, color(COLOR_RED_HEX), 3);

  lv_obj_t *iconBadge = lv_obj_create(card);
  lv_obj_set_pos(iconBadge, 14, 15);
  lv_obj_set_size(iconBadge, 42, 42);
  styleCircle(iconBadge, color(COLOR_PANEL_HIGHLIGHT_HEX), color(COLOR_BORDER_HEX), 1);

  if (temperatureCard) {
    createThermometerIcon(iconBadge, 14, 6);
  } else {
    createHumidityIcon(iconBadge, 4, 0);
  }

  lv_obj_t *title = lv_label_create(card);
  lv_label_set_text(title, temperatureCard ? "Temperature" : "Humidity");
  lv_obj_set_pos(title, 66, 11);
  styleLabel(title, &lv_font_montserrat_18, color(COLOR_TEXT_HEX));

  lv_obj_t *titleLine = lv_obj_create(card);
  lv_obj_set_pos(titleLine, 66, 34);
  lv_obj_set_size(titleLine, temperatureCard ? 112 : 82, 2);
  styleBar(titleLine, color(COLOR_RED_DIM_HEX));

  valueLabel = lv_label_create(card);
  lv_label_set_text(valueLabel, "--.-");
  lv_obj_set_pos(valueLabel, 62, 36);
  lv_obj_set_size(valueLabel, 119, 43);
  lv_obj_set_style_text_align(valueLabel, LV_TEXT_ALIGN_RIGHT, LV_PART_MAIN);
  styleLabel(valueLabel, &lv_font_montserrat_40, color(COLOR_TEXT_HEX), -1);

  unitLabel = lv_label_create(card);
  lv_label_set_text(unitLabel, temperatureCard ? "°C" : "%RH");
  lv_obj_set_pos(unitLabel, temperatureCard ? 184 : 178, 51);
  styleLabel(
      unitLabel,
      temperatureCard ? &lv_font_montserrat_18 : &lv_font_montserrat_14,
      color(COLOR_RED_HEX));

  statusPill = lv_obj_create(card);
  lv_obj_set_pos(statusPill, 14, 67);
  lv_obj_set_size(statusPill, 94, 18);
  stylePill(statusPill, color(COLOR_GREEN_DIM_HEX), color(COLOR_GREEN_HEX));

  statusDot = lv_obj_create(statusPill);
  lv_obj_set_pos(statusDot, 8, 5);
  lv_obj_set_size(statusDot, 8, 8);
  styleCircle(statusDot, color(COLOR_GREEN_HEX), color(COLOR_GREEN_HEX), 0);

  statusLabel = lv_label_create(statusPill);
  lv_label_set_text(statusLabel, "Normal");
  lv_obj_set_pos(statusLabel, 22, 1);
  styleLabel(statusLabel, &lv_font_montserrat_12, color(COLOR_GREEN_HEX));

  lv_obj_t *sensorLabel = lv_label_create(card);
  lv_label_set_text(sensorLabel, temperatureCard ? "DHT TEMP" : "DHT RH");
  lv_obj_set_pos(sensorLabel, 154, 70);
  lv_obj_set_width(sensorLabel, 56);
  lv_obj_set_style_text_align(sensorLabel, LV_TEXT_ALIGN_RIGHT, LV_PART_MAIN);
  styleLabel(sensorLabel, &lv_font_montserrat_12, color(COLOR_TEXT_SOFT_HEX));
}

void TftDisplay::createThermometerIcon(lv_obj_t *parent, int16_t x, int16_t y) {
  lv_obj_t *tube = lv_obj_create(parent);
  lv_obj_set_pos(tube, x, y);
  lv_obj_set_size(tube, 9, 22);
  styleBaseObject(tube);
  lv_obj_set_style_bg_opa(tube, LV_OPA_TRANSP, LV_PART_MAIN);
  lv_obj_set_style_border_color(tube, color(COLOR_RED_BRIGHT_HEX), LV_PART_MAIN);
  lv_obj_set_style_border_width(tube, 2, LV_PART_MAIN);
  lv_obj_set_style_radius(tube, 5, LV_PART_MAIN);

  lv_obj_t *stem = lv_obj_create(parent);
  lv_obj_set_pos(stem, x + 3, y + 8);
  lv_obj_set_size(stem, 3, 17);
  styleBar(stem, color(COLOR_RED_BRIGHT_HEX), 2);

  lv_obj_t *bulb = lv_obj_create(parent);
  lv_obj_set_pos(bulb, x - 4, y + 18);
  lv_obj_set_size(bulb, 17, 17);
  styleCircle(bulb, color(COLOR_PANEL_HIGHLIGHT_HEX), color(COLOR_RED_BRIGHT_HEX), 2);

  lv_obj_t *fill = lv_obj_create(parent);
  lv_obj_set_pos(fill, x, y + 22);
  lv_obj_set_size(fill, 9, 9);
  styleCircle(fill, color(COLOR_RED_BRIGHT_HEX), color(COLOR_RED_BRIGHT_HEX), 0);
}

void TftDisplay::createHumidityIcon(lv_obj_t *parent, int16_t x, int16_t y) {
  lv_obj_t *drop = lv_line_create(parent);
  lv_line_set_points(
      drop,
      HUMIDITY_DROP_POINTS,
      sizeof(HUMIDITY_DROP_POINTS) / sizeof(HUMIDITY_DROP_POINTS[0]));
  lv_obj_set_pos(drop, x, y);
  lv_obj_set_size(drop, 34, 43);
  lv_obj_set_style_line_color(drop, color(COLOR_RED_BRIGHT_HEX), LV_PART_MAIN);
  lv_obj_set_style_line_width(drop, 3, LV_PART_MAIN);
  lv_obj_set_style_line_rounded(drop, true, LV_PART_MAIN);
}

void TftDisplay::createConnectionCard() {
  lv_obj_t *card = lv_obj_create(screen_);
  lv_obj_set_pos(card, 8, 270);
  lv_obj_set_size(card, 224, 42);
  styleCard(card);

  lv_obj_t *badge = lv_obj_create(card);
  lv_obj_set_pos(badge, 10, 6);
  lv_obj_set_size(badge, 30, 30);
  styleCircle(badge, color(COLOR_PANEL_HIGHLIGHT_HEX), color(COLOR_BORDER_HEX), 1);

  lv_obj_t *outerDot = lv_obj_create(badge);
  lv_obj_set_pos(outerDot, 7, 7);
  lv_obj_set_size(outerDot, 16, 16);
  styleCircle(outerDot, color(COLOR_RED_DIM_HEX), color(COLOR_RED_HEX), 1);

  lv_obj_t *innerDot = lv_obj_create(outerDot);
  lv_obj_set_pos(innerDot, 5, 5);
  lv_obj_set_size(innerDot, 6, 6);
  styleCircle(innerDot, color(COLOR_RED_HEX), color(COLOR_RED_HEX), 0);

  lv_obj_t *title = lv_label_create(card);
  lv_label_set_text(title, "Connection");
  lv_obj_set_pos(title, 49, 4);
  styleLabel(title, &lv_font_montserrat_14, color(COLOR_TEXT_HEX));

  connectionSecondaryLabel_ = lv_label_create(card);
  lv_label_set_text(connectionSecondaryLabel_, "Waiting");
  lv_obj_set_pos(connectionSecondaryLabel_, 49, 21);
  styleLabel(connectionSecondaryLabel_, &lv_font_montserrat_12, color(COLOR_RED_HEX));

  connectionPill_ = lv_obj_create(card);
  lv_obj_set_pos(connectionPill_, 151, 8);
  lv_obj_set_size(connectionPill_, 62, 26);
  stylePill(connectionPill_, color(COLOR_RED_DIM_HEX), color(COLOR_RED_HEX));

  connectionDot_ = lv_obj_create(connectionPill_);
  lv_obj_set_pos(connectionDot_, 9, 9);
  lv_obj_set_size(connectionDot_, 8, 8);
  styleCircle(connectionDot_, color(COLOR_RED_HEX), color(COLOR_RED_HEX), 0);

  connectionPillLabel_ = lv_label_create(connectionPill_);
  lv_label_set_text(connectionPillLabel_, "Offline");
  lv_obj_set_pos(connectionPillLabel_, 21, 4);
  styleLabel(connectionPillLabel_, &lv_font_montserrat_12, color(COLOR_RED_HEX));
}

void TftDisplay::updateDashboard(const RuntimeStatus &status, bool force) {
  const bool wifiConnected = WiFi.status() == WL_CONNECTED;
  const int rssi = wifiConnected ? WiFi.RSSI() : -100;
  const bool powerConnected = readPowerConnected();

  if (force || status.sensorReadingAvailable != lastSensorAvailable_ ||
      valueChanged(status.lastTemperature, lastTemperature_)) {
    if (!status.sensorReadingAvailable || isnan(status.lastTemperature)) {
      lv_label_set_text(temperatureValueLabel_, "--.-");
    } else {
      char buffer[16];
      snprintf(buffer, sizeof(buffer), "%.1f", status.lastTemperature);
      lv_label_set_text(temperatureValueLabel_, buffer);
    }

    updateMetricStatus(
        true,
        status.lastTemperature,
        status.sensorReadingAvailable,
        temperatureStatusPill_,
        temperatureStatusDot_,
        temperatureStatusLabel_);
  }

  if (force || status.sensorReadingAvailable != lastSensorAvailable_ ||
      valueChanged(status.lastHumidity, lastHumidity_)) {
    if (!status.sensorReadingAvailable || isnan(status.lastHumidity)) {
      lv_label_set_text(humidityValueLabel_, "--.-");
    } else {
      char buffer[16];
      snprintf(buffer, sizeof(buffer), "%.1f", status.lastHumidity);
      lv_label_set_text(humidityValueLabel_, buffer);
    }

    updateMetricStatus(
        false,
        status.lastHumidity,
        status.sensorReadingAvailable,
        humidityStatusPill_,
        humidityStatusDot_,
        humidityStatusLabel_);
  }

  if (force || wifiConnected != lastWifiConnected_ || rssi != lastRssi_) {
    updateWiFiStatus(wifiConnected, rssi);
  }

  if (force || powerConnected != lastPowerConnected_) {
    updatePowerStatus(powerConnected);
  }

  if (force || status.state != lastState_ ||
      status.backendConnected != lastBackendConnected_ ||
      wifiConnected != lastWifiConnected_) {
    updateConnectionStatus(status.state, wifiConnected, status.backendConnected);
  }

  lastState_ = status.state;
  lastWifiConnected_ = wifiConnected;
  lastBackendConnected_ = status.backendConnected;
  lastSensorAvailable_ = status.sensorReadingAvailable;
  lastPowerConnected_ = powerConnected;
  lastRssi_ = rssi;
  lastTemperature_ = status.lastTemperature;
  lastHumidity_ = status.lastHumidity;
}

void TftDisplay::updateWiFiStatus(bool connected, int rssi) {
  int activeBars = 0;
  lv_color_t signalColor = color(COLOR_OFF_HEX);

  if (connected) {
    if (rssi >= -55) {
      activeBars = 4;
      signalColor = color(COLOR_GREEN_HEX);
    } else if (rssi >= -67) {
      activeBars = 3;
      signalColor = color(COLOR_TEXT_HEX);
    } else if (rssi >= -75) {
      activeBars = 2;
      signalColor = color(COLOR_ORANGE_HEX);
    } else {
      activeBars = 1;
      signalColor = color(COLOR_RED_HEX);
    }
  }

  for (int i = 0; i < 4; ++i) {
    lv_obj_set_style_bg_color(
        wifiBars_[i],
        (connected && i < activeBars) ? signalColor : color(COLOR_OFF_HEX),
        LV_PART_MAIN);
  }

  if (connected) {
    char buffer[12];
    snprintf(buffer, sizeof(buffer), "%d", rssi);
    lv_label_set_text(wifiDetailLabel_, buffer);
    lv_obj_set_style_text_color(wifiDetailLabel_, signalColor, LV_PART_MAIN);
  } else {
    lv_label_set_text(wifiDetailLabel_, "OFF");
    lv_obj_set_style_text_color(wifiDetailLabel_, color(COLOR_TEXT_SOFT_HEX), LV_PART_MAIN);
  }
}

void TftDisplay::updatePowerStatus(bool powerConnected) {
  const lv_color_t outline = powerConnected ? color(COLOR_TEXT_HEX) : color(COLOR_OFF_HEX);
  const lv_color_t detail = powerConnected ? color(COLOR_INFO_HEX) : color(COLOR_TEXT_SOFT_HEX);

  lv_obj_set_style_border_color(powerBody_, outline, LV_PART_MAIN);
  lv_obj_set_style_bg_color(powerCap_, outline, LV_PART_MAIN);
  lv_obj_set_style_bg_color(powerFill_, outline, LV_PART_MAIN);
  lv_obj_set_style_line_color(powerBolt_, outline, LV_PART_MAIN);
  lv_obj_set_style_text_color(powerDetailLabel_, detail, LV_PART_MAIN);
  lv_label_set_text(powerDetailLabel_, powerConnected ? "ON" : "OFF");

  if (powerConnected) {
    lv_obj_clear_flag(powerFill_, LV_OBJ_FLAG_HIDDEN);
    lv_obj_clear_flag(powerBolt_, LV_OBJ_FLAG_HIDDEN);
  } else {
    lv_obj_add_flag(powerFill_, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(powerBolt_, LV_OBJ_FLAG_HIDDEN);
  }
}

void TftDisplay::updateMetricStatus(
    bool temperatureCard,
    float value,
    bool available,
    lv_obj_t *statusPill,
    lv_obj_t *statusDot,
    lv_obj_t *statusLabel) {
  const char *labelText = "No Data";
  lv_color_t foreground = color(COLOR_TEXT_SOFT_HEX);
  lv_color_t background = color(COLOR_OFF_DIM_HEX);

  if (available && !isnan(value)) {
    if (temperatureCard) {
      if (value < ProductConfig::DISPLAY_TEMP_NORMAL_MIN) {
        labelText = "Low";
        foreground = color(COLOR_ORANGE_HEX);
        background = color(COLOR_ORANGE_DIM_HEX);
      } else if (value > ProductConfig::DISPLAY_TEMP_NORMAL_MAX) {
        labelText = "High";
        foreground = color(COLOR_RED_HEX);
        background = color(COLOR_RED_DIM_HEX);
      } else {
        labelText = "Normal";
        foreground = color(COLOR_GREEN_HEX);
        background = color(COLOR_GREEN_DIM_HEX);
      }
    } else {
      if (value < ProductConfig::DISPLAY_HUMIDITY_NORMAL_MIN) {
        labelText = "Dry";
        foreground = color(COLOR_ORANGE_HEX);
        background = color(COLOR_ORANGE_DIM_HEX);
      } else if (value > ProductConfig::DISPLAY_HUMIDITY_NORMAL_MAX) {
        labelText = "Humid";
        foreground = color(COLOR_RED_HEX);
        background = color(COLOR_RED_DIM_HEX);
      } else {
        labelText = "Normal";
        foreground = color(COLOR_GREEN_HEX);
        background = color(COLOR_GREEN_DIM_HEX);
      }
    }
  }

  stylePill(statusPill, background, foreground);
  styleCircle(statusDot, foreground, foreground, 0);
  lv_label_set_text(statusLabel, labelText);
  lv_obj_set_style_text_color(statusLabel, foreground, LV_PART_MAIN);
}

void TftDisplay::updateConnectionStatus(
    AppState state,
    bool wifiConnected,
    bool backendConnected) {
  const bool online = wifiConnected && backendConnected && state == AppState::ONLINE;

  if (online) {
    lv_label_set_text(connectionSecondaryLabel_, "Cloud connected");
    lv_obj_set_style_text_color(connectionSecondaryLabel_, color(COLOR_GREEN_HEX), LV_PART_MAIN);

    stylePill(connectionPill_, color(COLOR_GREEN_DIM_HEX), color(COLOR_GREEN_HEX));
    styleCircle(connectionDot_, color(COLOR_GREEN_HEX), color(COLOR_GREEN_HEX), 0);
    lv_label_set_text(connectionPillLabel_, "Online");
    lv_obj_set_style_text_color(connectionPillLabel_, color(COLOR_GREEN_HEX), LV_PART_MAIN);
    return;
  }

  if (wifiConnected && backendConnected) {
    lv_label_set_text(connectionSecondaryLabel_, "Cloud ready");
    lv_obj_set_style_text_color(connectionSecondaryLabel_, color(COLOR_INFO_HEX), LV_PART_MAIN);

    stylePill(connectionPill_, color(COLOR_INFO_DIM_HEX), color(COLOR_INFO_HEX));
    styleCircle(connectionDot_, color(COLOR_INFO_HEX), color(COLOR_INFO_HEX), 0);
    lv_label_set_text(connectionPillLabel_, "Cloud");
    lv_obj_set_style_text_color(connectionPillLabel_, color(COLOR_INFO_HEX), LV_PART_MAIN);
  } else if (wifiConnected) {
    lv_label_set_text(connectionSecondaryLabel_, "Wi-Fi connected");
    lv_obj_set_style_text_color(connectionSecondaryLabel_, color(COLOR_ORANGE_HEX), LV_PART_MAIN);

    stylePill(connectionPill_, color(COLOR_ORANGE_DIM_HEX), color(COLOR_ORANGE_HEX));
    styleCircle(connectionDot_, color(COLOR_ORANGE_HEX), color(COLOR_ORANGE_HEX), 0);
    lv_label_set_text(connectionPillLabel_, "Wi-Fi");
    lv_obj_set_style_text_color(connectionPillLabel_, color(COLOR_ORANGE_HEX), LV_PART_MAIN);
  } else {
    lv_label_set_text(connectionSecondaryLabel_, stateText(state));
    lv_obj_set_style_text_color(connectionSecondaryLabel_, color(COLOR_RED_HEX), LV_PART_MAIN);

    stylePill(connectionPill_, color(COLOR_RED_DIM_HEX), color(COLOR_RED_HEX));
    styleCircle(connectionDot_, color(COLOR_RED_HEX), color(COLOR_RED_HEX), 0);
    lv_label_set_text(connectionPillLabel_, "Offline");
    lv_obj_set_style_text_color(connectionPillLabel_, color(COLOR_RED_HEX), LV_PART_MAIN);
  }
}

bool TftDisplay::readPowerConnected() const {
  if (ProductConfig::POWER_SENSE_PIN < 0) {
    return true;
  }

  const int raw = digitalRead(ProductConfig::POWER_SENSE_PIN);
  return ProductConfig::POWER_SENSE_ACTIVE_HIGH ? raw == HIGH : raw == LOW;
}

void TftDisplay::styleBaseObject(lv_obj_t *object) {
  lv_obj_clear_flag(object, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_style_pad_all(object, 0, LV_PART_MAIN);
  lv_obj_set_style_shadow_width(object, 0, LV_PART_MAIN);
}

void TftDisplay::styleCard(lv_obj_t *card) {
  styleBaseObject(card);
  lv_obj_set_style_bg_color(card, color(COLOR_PANEL_HEX), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(card, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_border_color(card, color(COLOR_BORDER_HEX), LV_PART_MAIN);
  lv_obj_set_style_border_width(card, 1, LV_PART_MAIN);
  lv_obj_set_style_radius(card, 14, LV_PART_MAIN);
}

void TftDisplay::stylePill(
    lv_obj_t *pill,
    lv_color_t background,
    lv_color_t border) {
  styleBaseObject(pill);
  lv_obj_set_style_bg_color(pill, background, LV_PART_MAIN);
  lv_obj_set_style_bg_opa(pill, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_border_color(pill, border, LV_PART_MAIN);
  lv_obj_set_style_border_width(pill, 1, LV_PART_MAIN);
  lv_obj_set_style_radius(pill, 10, LV_PART_MAIN);
}

void TftDisplay::styleLabel(
    lv_obj_t *label,
    const lv_font_t *font,
    lv_color_t colorValue,
    int16_t letterSpacing) {
  lv_obj_set_style_text_font(label, font, LV_PART_MAIN);
  lv_obj_set_style_text_color(label, colorValue, LV_PART_MAIN);
  lv_obj_set_style_text_letter_space(label, letterSpacing, LV_PART_MAIN);
  lv_obj_set_style_bg_opa(label, LV_OPA_TRANSP, LV_PART_MAIN);
  lv_obj_set_style_pad_all(label, 0, LV_PART_MAIN);
}

void TftDisplay::styleCircle(
    lv_obj_t *object,
    lv_color_t background,
    lv_color_t border,
    int16_t borderWidth) {
  styleBaseObject(object);
  lv_obj_set_style_bg_color(object, background, LV_PART_MAIN);
  lv_obj_set_style_bg_opa(object, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_border_color(object, border, LV_PART_MAIN);
  lv_obj_set_style_border_width(object, borderWidth, LV_PART_MAIN);
  lv_obj_set_style_radius(object, LV_RADIUS_CIRCLE, LV_PART_MAIN);
}

void TftDisplay::styleBar(
    lv_obj_t *object,
    lv_color_t background,
    int16_t radius) {
  styleBaseObject(object);
  lv_obj_set_style_bg_color(object, background, LV_PART_MAIN);
  lv_obj_set_style_bg_opa(object, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_border_width(object, 0, LV_PART_MAIN);
  lv_obj_set_style_radius(object, radius, LV_PART_MAIN);
}

const char *TftDisplay::stateText(AppState state) const {
  switch (state) {
    case AppState::BOOTING:
      return "Booting";
    case AppState::UNPROVISIONED:
      return "Setup required";
    case AppState::SETUP_PORTAL:
      return "Setup portal";
    case AppState::CONNECTING_WIFI:
      return "Connecting Wi-Fi";
    case AppState::CONNECTING_BACKEND:
      return "Connecting cloud";
    case AppState::ONLINE:
      return "Ready";
    case AppState::DEGRADED:
      return "Service alert";
    case AppState::RECOVERY:
      return "Recovery mode";
    case AppState::UPDATING:
      return "Updating";
    default:
      return "Unknown";
  }
}

bool TftDisplay::valueChanged(float current, float previous) const {
  if (isnan(current) != isnan(previous)) return true;
  if (isnan(current) && isnan(previous)) return false;
  return fabsf(current - previous) >= 0.05f;
}
