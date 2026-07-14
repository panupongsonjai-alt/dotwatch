#include "display/TftDisplay.h"

#include <SPI.h>
#include <WiFi.h>
#include <math.h>

#include "ProductConfig.h"

namespace {

constexpr uint32_t COLOR_BACKGROUND_HEX = 0x050607;
constexpr uint32_t COLOR_PANEL_HEX = 0x0D1012;
constexpr uint32_t COLOR_PANEL_ALT_HEX = 0x111417;
constexpr uint32_t COLOR_BORDER_HEX = 0x30353A;
constexpr uint32_t COLOR_DIVIDER_HEX = 0x212529;
constexpr uint32_t COLOR_TEXT_HEX = 0xF4F6F8;
constexpr uint32_t COLOR_TEXT_MUTED_HEX = 0xAEB5BC;
constexpr uint32_t COLOR_TEXT_SOFT_HEX = 0x7D868E;
constexpr uint32_t COLOR_RED_HEX = 0xF24A50;
constexpr uint32_t COLOR_RED_DIM_HEX = 0x371417;
constexpr uint32_t COLOR_GREEN_HEX = 0x41D66C;
constexpr uint32_t COLOR_GREEN_DIM_HEX = 0x122117;
constexpr uint32_t COLOR_ORANGE_HEX = 0xFFB454;
constexpr uint32_t COLOR_ORANGE_DIM_HEX = 0x2D2416;
constexpr uint32_t COLOR_INFO_HEX = 0x62B5E5;
constexpr uint32_t COLOR_INFO_DIM_HEX = 0x14212B;
constexpr uint32_t COLOR_OFF_HEX = 0x5D666F;
constexpr uint32_t COLOR_OFF_DIM_HEX = 0x171A1D;

constexpr unsigned long LVGL_HANDLER_INTERVAL_MS = 5UL;

lv_color_t color(uint32_t value) {
  return lv_color_hex(value);
}

static const lv_point_t HUMIDITY_DROP_POINTS[] = {
    {18, 1},
    {8, 16},
    {4, 23},
    {4, 31},
    {8, 39},
    {13, 43},
    {18, 45},
    {23, 43},
    {28, 39},
    {32, 31},
    {32, 23},
    {28, 16},
    {18, 1},
};

static const lv_point_t BOLT_POINTS[] = {
    {8, 1},
    {3, 10},
    {9, 10},
    {6, 18},
    {14, 8},
    {9, 8},
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

  Serial.println("TftDisplay: showroom display initialized");
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
      10,
      true,
      temperatureValueLabel_,
      temperatureUnitLabel_,
      temperatureStatusPill_,
      temperatureStatusDot_,
      temperatureStatusLabel_);
  createMetricCard(
      165,
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
  lv_obj_set_pos(header, 10, 8);
  lv_obj_set_size(header, 300, 44);
  styleCard(header);
  lv_obj_set_style_bg_color(header, color(COLOR_PANEL_ALT_HEX), LV_PART_MAIN);

  lv_obj_t *brand = lv_label_create(header);
  lv_label_set_text(brand, "dotWatch");
  lv_obj_set_pos(brand, 14, 8);
  styleLabel(brand, &lv_font_montserrat_28, color(COLOR_TEXT_HEX), -1);

  lv_obj_t *chip = lv_obj_create(header);
  lv_obj_set_pos(chip, 126, 10);
  lv_obj_set_size(chip, 74, 24);
  stylePill(chip, color(COLOR_RED_DIM_HEX), color(COLOR_RED_HEX));

  lv_obj_t *chipLabel = lv_label_create(chip);
  lv_label_set_text(chipLabel, "ESP32 DHT");
  lv_obj_set_pos(chipLabel, 10, 3);
  styleLabel(chipLabel, &lv_font_montserrat_12, color(COLOR_RED_HEX), 0);

  lv_obj_t *v1 = lv_obj_create(header);
  lv_obj_set_pos(v1, 224, 6);
  lv_obj_set_size(v1, 1, 32);
  styleBar(v1, color(COLOR_DIVIDER_HEX));

  lv_obj_t *v2 = lv_obj_create(header);
  lv_obj_set_pos(v2, 263, 6);
  lv_obj_set_size(v2, 1, 32);
  styleBar(v2, color(COLOR_DIVIDER_HEX));

  createWiFiSignalGroup(header, 232, 7);
  createBatteryGroup(header, 271, 7);
}

void TftDisplay::createMetricCard(
    int16_t x,
    bool isTemperature,
    lv_obj_t *&valueLabel,
    lv_obj_t *&unitLabel,
    lv_obj_t *&statusPill,
    lv_obj_t *&statusDot,
    lv_obj_t *&statusLabel) {
  lv_obj_t *card = lv_obj_create(screen_);
  lv_obj_set_pos(card, x, 60);
  lv_obj_set_size(card, 145, 118);
  styleCard(card);

  lv_obj_t *iconBadge = lv_obj_create(card);
  lv_obj_set_pos(iconBadge, 10, 12);
  lv_obj_set_size(iconBadge, 32, 32);
  styleCircle(iconBadge, color(COLOR_PANEL_ALT_HEX), color(COLOR_BORDER_HEX), 1);

  if (isTemperature) {
    createThermometerIcon(iconBadge, 8, 4);
  } else {
    createHumidityIcon(iconBadge, 6, 4);
  }

  lv_obj_t *title = lv_label_create(card);
  lv_label_set_text(title, isTemperature ? "Temperature" : "Humidity");
  lv_obj_set_pos(title, 50, 15);
  styleLabel(title, &lv_font_montserrat_18, color(COLOR_TEXT_HEX));

  valueLabel = lv_label_create(card);
  lv_label_set_text(valueLabel, isTemperature ? "--.-" : "--.-");
  lv_obj_set_pos(valueLabel, 12, 48);
  lv_obj_set_size(valueLabel, 102, 38);
  lv_obj_set_style_text_align(valueLabel, LV_TEXT_ALIGN_RIGHT, LV_PART_MAIN);
  styleLabel(valueLabel, &lv_font_montserrat_40, color(COLOR_TEXT_HEX), -1);

  unitLabel = lv_label_create(card);
  lv_label_set_text(unitLabel, isTemperature ? "°C" : "%RH");
  lv_obj_set_pos(unitLabel, isTemperature ? 115 : 104, 70);
  styleLabel(unitLabel, &lv_font_montserrat_18, color(COLOR_RED_HEX));

  lv_obj_t *divider = lv_obj_create(card);
  lv_obj_set_pos(divider, 12, 91);
  lv_obj_set_size(divider, 121, 1);
  styleBar(divider, color(COLOR_DIVIDER_HEX));

  statusPill = lv_obj_create(card);
  lv_obj_set_pos(statusPill, 12, 98);
  lv_obj_set_size(statusPill, 88, 16);
  stylePill(statusPill, color(COLOR_GREEN_DIM_HEX), color(COLOR_GREEN_HEX));

  statusDot = lv_obj_create(statusPill);
  lv_obj_set_pos(statusDot, 8, 4);
  lv_obj_set_size(statusDot, 8, 8);
  styleCircle(statusDot, color(COLOR_GREEN_HEX), color(COLOR_GREEN_HEX), 0);

  statusLabel = lv_label_create(statusPill);
  lv_label_set_text(statusLabel, "Normal");
  lv_obj_set_pos(statusLabel, 22, 0);
  styleLabel(statusLabel, &lv_font_montserrat_12, color(COLOR_GREEN_HEX));
}

void TftDisplay::createThermometerIcon(lv_obj_t *parent, int16_t x, int16_t y) {
  lv_obj_t *tube = lv_obj_create(parent);
  lv_obj_set_pos(tube, x, y);
  lv_obj_set_size(tube, 8, 16);
  styleBaseObject(tube);
  lv_obj_set_style_bg_opa(tube, LV_OPA_TRANSP, LV_PART_MAIN);
  lv_obj_set_style_border_color(tube, color(COLOR_RED_HEX), LV_PART_MAIN);
  lv_obj_set_style_border_width(tube, 2, LV_PART_MAIN);
  lv_obj_set_style_radius(tube, 4, LV_PART_MAIN);

  lv_obj_t *stem = lv_obj_create(parent);
  lv_obj_set_pos(stem, x + 3, y + 6);
  lv_obj_set_size(stem, 2, 11);
  styleBar(stem, color(COLOR_RED_HEX));

  lv_obj_t *bulb = lv_obj_create(parent);
  lv_obj_set_pos(bulb, x - 4, y + 12);
  lv_obj_set_size(bulb, 16, 16);
  styleCircle(bulb, color(COLOR_PANEL_ALT_HEX), color(COLOR_RED_HEX), 2);

  lv_obj_t *fill = lv_obj_create(parent);
  lv_obj_set_pos(fill, x + 0, y + 16);
  lv_obj_set_size(fill, 8, 8);
  styleCircle(fill, color(COLOR_RED_HEX), color(COLOR_RED_HEX), 0);
}

void TftDisplay::createHumidityIcon(lv_obj_t *parent, int16_t x, int16_t y) {
  lv_obj_t *drop = lv_line_create(parent);
  lv_line_set_points(
      drop,
      HUMIDITY_DROP_POINTS,
      sizeof(HUMIDITY_DROP_POINTS) / sizeof(HUMIDITY_DROP_POINTS[0]));
  lv_obj_set_pos(drop, x, y);
  lv_obj_set_size(drop, 28, 28);
  lv_obj_set_style_line_color(drop, color(COLOR_RED_HEX), LV_PART_MAIN);
  lv_obj_set_style_line_width(drop, 3, LV_PART_MAIN);
  lv_obj_set_style_line_rounded(drop, true, LV_PART_MAIN);
}

void TftDisplay::createWiFiSignalGroup(lv_obj_t *parent, int16_t x, int16_t y) {
  const int16_t heights[4] = {4, 7, 10, 13};
  const int16_t xOffsets[4] = {0, 5, 10, 15};
  for (int i = 0; i < 4; ++i) {
    wifiBars_[i] = lv_obj_create(parent);
    lv_obj_set_pos(wifiBars_[i], x + xOffsets[i], y + (13 - heights[i]));
    lv_obj_set_size(wifiBars_[i], 3, heights[i]);
    styleBar(wifiBars_[i], color(COLOR_OFF_HEX));
  }

  wifiLabel_ = lv_label_create(parent);
  lv_label_set_text(wifiLabel_, "WiFi");
  lv_obj_set_pos(wifiLabel_, x - 1, 16);
  styleLabel(wifiLabel_, &lv_font_montserrat_12, color(COLOR_TEXT_MUTED_HEX));

  wifiDetailLabel_ = lv_label_create(parent);
  lv_label_set_text(wifiDetailLabel_, "OFF");
  lv_obj_set_pos(wifiDetailLabel_, x - 3, 28);
  styleLabel(wifiDetailLabel_, &lv_font_montserrat_12, color(COLOR_TEXT_SOFT_HEX));
}

void TftDisplay::createBatteryGroup(lv_obj_t *parent, int16_t x, int16_t y) {
  powerBody_ = lv_obj_create(parent);
  lv_obj_set_pos(powerBody_, x, y + 1);
  lv_obj_set_size(powerBody_, 16, 10);
  styleBaseObject(powerBody_);
  lv_obj_set_style_bg_opa(powerBody_, LV_OPA_TRANSP, LV_PART_MAIN);
  lv_obj_set_style_border_color(powerBody_, color(COLOR_TEXT_HEX), LV_PART_MAIN);
  lv_obj_set_style_border_width(powerBody_, 2, LV_PART_MAIN);
  lv_obj_set_style_radius(powerBody_, 2, LV_PART_MAIN);

  powerCap_ = lv_obj_create(parent);
  lv_obj_set_pos(powerCap_, x + 16, y + 4);
  lv_obj_set_size(powerCap_, 2, 4);
  styleBar(powerCap_, color(COLOR_TEXT_HEX));

  powerFill_ = lv_obj_create(parent);
  lv_obj_set_pos(powerFill_, x + 3, y + 4);
  lv_obj_set_size(powerFill_, 8, 4);
  styleBar(powerFill_, color(COLOR_TEXT_HEX));

  powerBolt_ = lv_line_create(parent);
  lv_line_set_points(
      powerBolt_,
      BOLT_POINTS,
      sizeof(BOLT_POINTS) / sizeof(BOLT_POINTS[0]));
  lv_obj_set_pos(powerBolt_, x + 3, y - 1);
  lv_obj_set_size(powerBolt_, 12, 16);
  lv_obj_set_style_line_color(powerBolt_, color(COLOR_TEXT_HEX), LV_PART_MAIN);
  lv_obj_set_style_line_width(powerBolt_, 2, LV_PART_MAIN);
  lv_obj_set_style_line_rounded(powerBolt_, true, LV_PART_MAIN);

  powerLabel_ = lv_label_create(parent);
  lv_label_set_text(powerLabel_, "Power");
  lv_obj_set_pos(powerLabel_, x - 2, 16);
  styleLabel(powerLabel_, &lv_font_montserrat_12, color(COLOR_TEXT_MUTED_HEX));

  powerDetailLabel_ = lv_label_create(parent);
  lv_label_set_text(powerDetailLabel_, "ON");
  lv_obj_set_pos(powerDetailLabel_, x + 1, 28);
  styleLabel(powerDetailLabel_, &lv_font_montserrat_12, color(COLOR_TEXT_SOFT_HEX));
}

void TftDisplay::createConnectionCard() {
  lv_obj_t *card = lv_obj_create(screen_);
  lv_obj_set_pos(card, 10, 186);
  lv_obj_set_size(card, 300, 44);
  styleCard(card);

  lv_obj_t *badge = lv_obj_create(card);
  lv_obj_set_pos(badge, 10, 6);
  lv_obj_set_size(badge, 30, 30);
  styleCircle(badge, color(COLOR_PANEL_ALT_HEX), color(COLOR_BORDER_HEX), 1);

  lv_obj_t *badgeDot = lv_obj_create(badge);
  lv_obj_set_pos(badgeDot, 11, 11);
  lv_obj_set_size(badgeDot, 8, 8);
  styleCircle(badgeDot, color(COLOR_RED_HEX), color(COLOR_RED_HEX), 0);

  connectionPrimaryLabel_ = lv_label_create(card);
  lv_label_set_text(connectionPrimaryLabel_, "Connection Status");
  lv_obj_set_pos(connectionPrimaryLabel_, 48, 5);
  styleLabel(connectionPrimaryLabel_, &lv_font_montserrat_14, color(COLOR_TEXT_HEX));

  connectionSecondaryLabel_ = lv_label_create(card);
  lv_label_set_text(connectionSecondaryLabel_, "Waiting");
  lv_obj_set_pos(connectionSecondaryLabel_, 48, 22);
  styleLabel(connectionSecondaryLabel_, &lv_font_montserrat_14, color(COLOR_RED_HEX));

  onlinePill_ = lv_obj_create(card);
  lv_obj_set_pos(onlinePill_, 228, 8);
  lv_obj_set_size(onlinePill_, 60, 26);
  stylePill(onlinePill_, color(COLOR_RED_DIM_HEX), color(COLOR_RED_HEX));

  onlineDot_ = lv_obj_create(onlinePill_);
  lv_obj_set_pos(onlineDot_, 10, 9);
  lv_obj_set_size(onlineDot_, 8, 8);
  styleCircle(onlineDot_, color(COLOR_RED_HEX), color(COLOR_RED_HEX), 0);

  onlineLabel_ = lv_label_create(onlinePill_);
  lv_label_set_text(onlineLabel_, "Offline");
  lv_obj_set_pos(onlineLabel_, 22, 4);
  styleLabel(onlineLabel_, &lv_font_montserrat_12, color(COLOR_RED_HEX));
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
  const char *detailText = "OFF";

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

  lv_obj_set_style_text_color(
      wifiLabel_,
      connected ? color(COLOR_TEXT_MUTED_HEX) : color(COLOR_TEXT_SOFT_HEX),
      LV_PART_MAIN);

  if (connected) {
    char buffer[16];
    snprintf(buffer, sizeof(buffer), "%ddBm", rssi);
    lv_label_set_text(wifiDetailLabel_, buffer);
    lv_obj_set_style_text_color(wifiDetailLabel_, signalColor, LV_PART_MAIN);
  } else {
    lv_label_set_text(wifiDetailLabel_, detailText);
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
  lv_obj_set_style_text_color(powerLabel_, color(COLOR_TEXT_MUTED_HEX), LV_PART_MAIN);
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
    bool isTemperature,
    float value,
    bool available,
    lv_obj_t *statusPill,
    lv_obj_t *statusDot,
    lv_obj_t *statusLabel) {
  const char *labelText = "No Data";
  lv_color_t fg = color(COLOR_TEXT_SOFT_HEX);
  lv_color_t bg = color(COLOR_OFF_DIM_HEX);

  if (available && !isnan(value)) {
    if (isTemperature) {
      if (value < ProductConfig::DISPLAY_TEMP_NORMAL_MIN) {
        labelText = "Low";
        fg = color(COLOR_ORANGE_HEX);
        bg = color(COLOR_ORANGE_DIM_HEX);
      } else if (value > ProductConfig::DISPLAY_TEMP_NORMAL_MAX) {
        labelText = "High";
        fg = color(COLOR_RED_HEX);
        bg = color(COLOR_RED_DIM_HEX);
      } else {
        labelText = "Normal";
        fg = color(COLOR_GREEN_HEX);
        bg = color(COLOR_GREEN_DIM_HEX);
      }
    } else {
      if (value < ProductConfig::DISPLAY_HUMIDITY_NORMAL_MIN) {
        labelText = "Dry";
        fg = color(COLOR_ORANGE_HEX);
        bg = color(COLOR_ORANGE_DIM_HEX);
      } else if (value > ProductConfig::DISPLAY_HUMIDITY_NORMAL_MAX) {
        labelText = "Humid";
        fg = color(COLOR_RED_HEX);
        bg = color(COLOR_RED_DIM_HEX);
      } else {
        labelText = "Normal";
        fg = color(COLOR_GREEN_HEX);
        bg = color(COLOR_GREEN_DIM_HEX);
      }
    }
  }

  stylePill(statusPill, bg, fg);
  styleCircle(statusDot, fg, fg, 0);
  lv_label_set_text(statusLabel, labelText);
  lv_obj_set_style_text_color(statusLabel, fg, LV_PART_MAIN);
}

void TftDisplay::updateConnectionStatus(
    AppState state,
    bool wifiConnected,
    bool backendConnected) {
  const bool online = wifiConnected && backendConnected && state == AppState::ONLINE;

  if (online) {
    lv_label_set_text(connectionSecondaryLabel_, "Connected");
    lv_obj_set_style_text_color(connectionSecondaryLabel_, color(COLOR_RED_HEX), LV_PART_MAIN);

    stylePill(onlinePill_, color(COLOR_GREEN_DIM_HEX), color(COLOR_GREEN_HEX));
    styleCircle(onlineDot_, color(COLOR_GREEN_HEX), color(COLOR_GREEN_HEX), 0);
    lv_label_set_text(onlineLabel_, "Online");
    lv_obj_set_style_text_color(onlineLabel_, color(COLOR_GREEN_HEX), LV_PART_MAIN);
    return;
  }

  if (wifiConnected && backendConnected) {
    lv_label_set_text(connectionSecondaryLabel_, "Cloud Ready");
    lv_obj_set_style_text_color(connectionSecondaryLabel_, color(COLOR_INFO_HEX), LV_PART_MAIN);

    stylePill(onlinePill_, color(COLOR_INFO_DIM_HEX), color(COLOR_INFO_HEX));
    styleCircle(onlineDot_, color(COLOR_INFO_HEX), color(COLOR_INFO_HEX), 0);
    lv_label_set_text(onlineLabel_, "Cloud");
    lv_obj_set_style_text_color(onlineLabel_, color(COLOR_INFO_HEX), LV_PART_MAIN);
  } else if (wifiConnected) {
    lv_label_set_text(connectionSecondaryLabel_, "Wi-Fi Connected");
    lv_obj_set_style_text_color(connectionSecondaryLabel_, color(COLOR_ORANGE_HEX), LV_PART_MAIN);

    stylePill(onlinePill_, color(COLOR_ORANGE_DIM_HEX), color(COLOR_ORANGE_HEX));
    styleCircle(onlineDot_, color(COLOR_ORANGE_HEX), color(COLOR_ORANGE_HEX), 0);
    lv_label_set_text(onlineLabel_, "Wi-Fi");
    lv_obj_set_style_text_color(onlineLabel_, color(COLOR_ORANGE_HEX), LV_PART_MAIN);
  } else {
    lv_label_set_text(connectionSecondaryLabel_, stateText(state));
    lv_obj_set_style_text_color(connectionSecondaryLabel_, color(COLOR_RED_HEX), LV_PART_MAIN);

    stylePill(onlinePill_, color(COLOR_RED_DIM_HEX), color(COLOR_RED_HEX));
    styleCircle(onlineDot_, color(COLOR_RED_HEX), color(COLOR_RED_HEX), 0);
    lv_label_set_text(onlineLabel_, "Offline");
    lv_obj_set_style_text_color(onlineLabel_, color(COLOR_RED_HEX), LV_PART_MAIN);
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

void TftDisplay::stylePill(lv_obj_t *pill, lv_color_t bg, lv_color_t border) {
  styleBaseObject(pill);
  lv_obj_set_style_bg_color(pill, bg, LV_PART_MAIN);
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

void TftDisplay::styleBar(lv_obj_t *object, lv_color_t background) {
  styleBaseObject(object);
  lv_obj_set_style_bg_color(object, background, LV_PART_MAIN);
  lv_obj_set_style_bg_opa(object, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_border_width(object, 0, LV_PART_MAIN);
  lv_obj_set_style_radius(object, 1, LV_PART_MAIN);
}

const char *TftDisplay::stateText(AppState state) const {
  switch (state) {
    case AppState::BOOTING:
      return "Booting";
    case AppState::UNPROVISIONED:
      return "Setup Needed";
    case AppState::SETUP_PORTAL:
      return "Portal Active";
    case AppState::CONNECTING_WIFI:
      return "Connecting Wi-Fi";
    case AppState::CONNECTING_BACKEND:
      return "Connecting Cloud";
    case AppState::ONLINE:
      return "Ready";
    case AppState::DEGRADED:
      return "Service Alert";
    case AppState::RECOVERY:
      return "Recovery Mode";
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
