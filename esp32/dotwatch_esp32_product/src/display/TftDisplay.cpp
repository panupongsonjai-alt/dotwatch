#include "display/TftDisplay.h"

#include <SPI.h>
#include <WiFi.h>
#include <math.h>

#include "ProductConfig.h"

namespace {

constexpr uint32_t COLOR_BACKGROUND_HEX = 0x09070A;
constexpr uint32_t COLOR_HEADER_HEX = 0x130B0E;
constexpr uint32_t COLOR_SURFACE_HEX = 0x181215;
constexpr uint32_t COLOR_SURFACE_RAISED_HEX = 0x23181C;
constexpr uint32_t COLOR_BORDER_HEX = 0x482C32;
constexpr uint32_t COLOR_DIVIDER_HEX = 0x3A2329;
constexpr uint32_t COLOR_RED_PRIMARY_HEX = 0xDC2333;
constexpr uint32_t COLOR_RED_BRIGHT_HEX = 0xFF3F4E;
constexpr uint32_t COLOR_RED_DARK_HEX = 0x68111D;
constexpr uint32_t COLOR_ROSE_HEX = 0xF45B75;
constexpr uint32_t COLOR_TEXT_HEX = 0xFFFFFF;
constexpr uint32_t COLOR_TEXT_SECONDARY_HEX = 0xD3C1C6;
constexpr uint32_t COLOR_TEXT_MUTED_HEX = 0x927D83;
constexpr uint32_t COLOR_SUCCESS_HEX = 0x37D27A;
constexpr uint32_t COLOR_WARNING_HEX = 0xFFB84D;
constexpr uint32_t COLOR_DANGER_HEX = 0xFF4A55;
constexpr uint32_t COLOR_INFO_HEX = 0x69A4FF;
constexpr uint32_t COLOR_GAUGE_TRACK_HEX = 0x39272C;

constexpr unsigned long LIVE_PULSE_INTERVAL_MS = 650UL;
constexpr unsigned long LVGL_HANDLER_INTERVAL_MS = 5UL;

lv_color_t color(uint32_t value) {
  return lv_color_hex(value);
}

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

  resetSessionExtrema();
  createDashboard();

  const unsigned long now = millis();
  lastLvglTickAt_ = now;
  lastHandlerAt_ = now;
  lastUiRefreshAt_ = now;
  lastAgeSecond_ = now / 1000UL;

  ready_ = true;
  firstDraw_ = true;

  Serial.println(
      "TftDisplay: LVGL Montserrat dashboard typography initialized");
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
    updateSessionExtrema(status);
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
  lv_obj_clear_flag(screen_, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_style_bg_color(screen_, color(COLOR_BACKGROUND_HEX), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(screen_, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_pad_all(screen_, 0, LV_PART_MAIN);

  lv_obj_t *accentBright = lv_obj_create(screen_);
  lv_obj_set_pos(accentBright, 0, 0);
  lv_obj_set_size(accentBright, DISPLAY_WIDTH, 4);
  stylePanel(
      accentBright,
      color(COLOR_RED_BRIGHT_HEX),
      color(COLOR_RED_BRIGHT_HEX),
      0,
      0);

  lv_obj_t *accentPrimary = lv_obj_create(screen_);
  lv_obj_set_pos(accentPrimary, 0, 4);
  lv_obj_set_size(accentPrimary, DISPLAY_WIDTH, 3);
  stylePanel(
      accentPrimary,
      color(COLOR_RED_PRIMARY_HEX),
      color(COLOR_RED_PRIMARY_HEX),
      0,
      0);

  lv_obj_t *accentDark = lv_obj_create(screen_);
  lv_obj_set_pos(accentDark, 0, 7);
  lv_obj_set_size(accentDark, DISPLAY_WIDTH, 2);
  stylePanel(
      accentDark,
      color(COLOR_RED_DARK_HEX),
      color(COLOR_RED_DARK_HEX),
      0,
      0);

  createHeader();

  createMetricCard(
      66,
      "T",
      "TEMPERATURE",
      "C",
      color(COLOR_RED_BRIGHT_HEX),
      -10,
      60,
      temperatureValueLabel_,
      temperatureMinimumLabel_,
      temperatureMaximumLabel_,
      temperatureBar_);

  createMetricCard(
      162,
      "H",
      "HUMIDITY",
      "%",
      color(COLOR_ROSE_HEX),
      0,
      100,
      humidityValueLabel_,
      humidityMinimumLabel_,
      humidityMaximumLabel_,
      humidityBar_);

  createFooter();
}

void TftDisplay::createHeader() {
  lv_obj_t *header = lv_obj_create(screen_);
  lv_obj_set_pos(header, 0, 9);
  lv_obj_set_size(header, DISPLAY_WIDTH, 51);
  stylePanel(
      header,
      color(COLOR_HEADER_HEX),
      color(COLOR_DIVIDER_HEX),
      0,
      1);
  lv_obj_set_style_border_side(header, LV_BORDER_SIDE_BOTTOM, LV_PART_MAIN);

  lv_obj_t *brand = lv_label_create(header);
  lv_label_set_text(brand, "dotWatch");
  lv_obj_set_pos(brand, 10, 4);
  styleLabel(
      brand,
      &lv_font_montserrat_28,
      color(COLOR_TEXT_HEX),
      -1);

  lv_obj_t *subtitle = lv_label_create(header);
  lv_label_set_text(subtitle, "ENVIRONMENT MONITOR");
  lv_obj_set_pos(subtitle, 11, 34);
  styleLabel(
      subtitle,
      &lv_font_montserrat_12,
      color(COLOR_RED_BRIGHT_HEX),
      1);

  liveChip_ = lv_obj_create(header);
  lv_obj_set_pos(liveChip_, 172, 8);
  lv_obj_set_size(liveChip_, 60, 29);
  stylePanel(
      liveChip_,
      color(COLOR_SURFACE_RAISED_HEX),
      color(COLOR_BORDER_HEX),
      9,
      1);

  liveDot_ = lv_obj_create(liveChip_);
  lv_obj_set_pos(liveDot_, 7, 9);
  lv_obj_set_size(liveDot_, 9, 9);
  stylePanel(
      liveDot_,
      color(COLOR_TEXT_MUTED_HEX),
      color(COLOR_TEXT_MUTED_HEX),
      LV_RADIUS_CIRCLE,
      0);

  liveLabel_ = lv_label_create(liveChip_);
  lv_label_set_text(liveLabel_, "WAIT");
  lv_obj_set_pos(liveLabel_, 21, 7);
  styleLabel(
      liveLabel_,
      &lv_font_montserrat_12,
      color(COLOR_TEXT_MUTED_HEX));
}

void TftDisplay::createMetricCard(
    int16_t y,
    const char *badgeText,
    const char *title,
    const char *unit,
    lv_color_t accent,
    int32_t barMinimum,
    int32_t barMaximum,
    lv_obj_t *&valueLabel,
    lv_obj_t *&minimumLabel,
    lv_obj_t *&maximumLabel,
    lv_obj_t *&bar) {
  lv_obj_t *card = lv_obj_create(screen_);
  lv_obj_set_pos(card, 8, y);
  lv_obj_set_size(card, 224, 89);
  stylePanel(
      card,
      color(COLOR_SURFACE_HEX),
      color(COLOR_BORDER_HEX),
      13,
      1);

  lv_obj_t *rail = lv_obj_create(card);
  lv_obj_set_pos(rail, 0, 0);
  lv_obj_set_size(rail, 6, 89);
  stylePanel(rail, accent, accent, 4, 0);

  lv_obj_t *badge = lv_obj_create(card);
  lv_obj_set_pos(badge, 13, 23);
  lv_obj_set_size(badge, 37, 37);
  stylePanel(
      badge,
      color(COLOR_SURFACE_RAISED_HEX),
      color(COLOR_RED_DARK_HEX),
      LV_RADIUS_CIRCLE,
      1);

  lv_obj_t *badgeLabel = lv_label_create(badge);
  lv_label_set_text(badgeLabel, badgeText);
  styleLabel(
      badgeLabel,
      &lv_font_montserrat_18,
      accent);
  lv_obj_center(badgeLabel);

  lv_obj_t *titleLabel = lv_label_create(card);
  lv_label_set_text(titleLabel, title);
  lv_obj_set_pos(titleLabel, 59, 7);
  styleLabel(
      titleLabel,
      &lv_font_montserrat_14,
      color(COLOR_TEXT_SECONDARY_HEX),
      1);

  valueLabel = lv_label_create(card);
  lv_label_set_text(valueLabel, "--.-");
  lv_obj_set_pos(valueLabel, 58, 24);
  lv_obj_set_width(valueLabel, 112);
  lv_obj_set_style_text_align(valueLabel, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
  styleLabel(
      valueLabel,
      &lv_font_montserrat_40,
      color(COLOR_TEXT_HEX),
      -1);

  lv_obj_t *unitLabel = lv_label_create(card);
  lv_label_set_text(unitLabel, unit);
  lv_obj_set_pos(unitLabel, 181, 36);
  styleLabel(
      unitLabel,
      &lv_font_montserrat_18,
      accent);

  minimumLabel = lv_label_create(card);
  lv_label_set_text(minimumLabel, "MIN --.-");
  lv_obj_set_pos(minimumLabel, 59, 65);
  styleLabel(
      minimumLabel,
      &lv_font_montserrat_12,
      color(COLOR_TEXT_MUTED_HEX));

  maximumLabel = lv_label_create(card);
  lv_label_set_text(maximumLabel, "MAX --.-");
  lv_obj_set_pos(maximumLabel, 141, 65);
  lv_obj_set_width(maximumLabel, 70);
  lv_obj_set_style_text_align(
      maximumLabel,
      LV_TEXT_ALIGN_RIGHT,
      LV_PART_MAIN);
  styleLabel(
      maximumLabel,
      &lv_font_montserrat_12,
      color(COLOR_TEXT_MUTED_HEX));

  bar = lv_bar_create(card);
  lv_obj_set_pos(bar, 59, 80);
  lv_obj_set_size(bar, 152, 5);
  lv_bar_set_range(bar, barMinimum, barMaximum);
  lv_bar_set_value(bar, barMinimum, LV_ANIM_OFF);
  lv_obj_set_style_bg_color(
      bar,
      color(COLOR_GAUGE_TRACK_HEX),
      LV_PART_MAIN);
  lv_obj_set_style_bg_opa(bar, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_radius(bar, LV_RADIUS_CIRCLE, LV_PART_MAIN);
  lv_obj_set_style_bg_color(bar, accent, LV_PART_INDICATOR);
  lv_obj_set_style_bg_opa(bar, LV_OPA_COVER, LV_PART_INDICATOR);
  lv_obj_set_style_radius(bar, LV_RADIUS_CIRCLE, LV_PART_INDICATOR);
}

void TftDisplay::createFooter() {
  lv_obj_t *footer = lv_obj_create(screen_);
  lv_obj_set_pos(footer, 0, 257);
  lv_obj_set_size(footer, DISPLAY_WIDTH, 63);
  stylePanel(
      footer,
      color(COLOR_HEADER_HEX),
      color(COLOR_RED_DARK_HEX),
      0,
      1);
  lv_obj_set_style_border_side(footer, LV_BORDER_SIDE_TOP, LV_PART_MAIN);

  stateChip_ = lv_obj_create(footer);
  lv_obj_set_pos(stateChip_, 7, 7);
  lv_obj_set_size(stateChip_, 94, 25);
  stylePanel(
      stateChip_,
      color(COLOR_SURFACE_RAISED_HEX),
      color(COLOR_BORDER_HEX),
      7,
      1);

  stateDot_ = lv_obj_create(stateChip_);
  lv_obj_set_pos(stateDot_, 7, 8);
  lv_obj_set_size(stateDot_, 8, 8);
  stylePanel(
      stateDot_,
      color(COLOR_TEXT_MUTED_HEX),
      color(COLOR_TEXT_MUTED_HEX),
      LV_RADIUS_CIRCLE,
      0);

  stateLabel_ = lv_label_create(stateChip_);
  lv_label_set_text(stateLabel_, "BOOTING");
  lv_obj_set_pos(stateLabel_, 21, 6);
  styleLabel(
      stateLabel_,
      &lv_font_montserrat_12,
      color(COLOR_TEXT_HEX));

  createStatusChip(
      105,
      7,
      59,
      serverDot_,
      serverLabel_);

  createStatusChip(
      168,
      7,
      65,
      wifiDot_,
      wifiLabel_);

  ipLabel_ = lv_label_create(footer);
  lv_label_set_text(ipLabel_, "IP --.--.--.--");
  lv_obj_set_pos(ipLabel_, 9, 39);
  styleLabel(
      ipLabel_,
      &lv_font_montserrat_12,
      color(COLOR_TEXT_MUTED_HEX));

  ageLabel_ = lv_label_create(footer);
  lv_label_set_text(ageLabel_, "AGE --s");
  lv_obj_set_pos(ageLabel_, 164, 39);
  lv_obj_set_width(ageLabel_, 67);
  lv_obj_set_style_text_align(ageLabel_, LV_TEXT_ALIGN_RIGHT, LV_PART_MAIN);
  styleLabel(
      ageLabel_,
      &lv_font_montserrat_12,
      color(COLOR_TEXT_SECONDARY_HEX));
}

void TftDisplay::createStatusChip(
    int16_t x,
    int16_t y,
    int16_t width,
    lv_obj_t *&dot,
    lv_obj_t *&label) {
  lv_obj_t *chip = lv_obj_create(lv_obj_get_parent(stateChip_));
  lv_obj_set_pos(chip, x, y);
  lv_obj_set_size(chip, width, 25);
  stylePanel(
      chip,
      color(COLOR_SURFACE_RAISED_HEX),
      color(COLOR_BORDER_HEX),
      7,
      1);

  dot = lv_obj_create(chip);
  lv_obj_set_pos(dot, 7, 8);
  lv_obj_set_size(dot, 8, 8);
  stylePanel(
      dot,
      color(COLOR_DANGER_HEX),
      color(COLOR_DANGER_HEX),
      LV_RADIUS_CIRCLE,
      0);

  label = lv_label_create(chip);
  lv_label_set_text(label, "WAIT");
  lv_obj_set_pos(label, 20, 6);
  styleLabel(
      label,
      &lv_font_montserrat_12,
      color(COLOR_TEXT_MUTED_HEX));
}

void TftDisplay::updateDashboard(
    const RuntimeStatus &status,
    bool force) {
  const unsigned long now = millis();
  const bool pulseOn =
      ((now / LIVE_PULSE_INTERVAL_MS) % 2UL) == 0UL;
  const bool live = status.sensorReadingAvailable;
  const bool simulated = live && status.lastSensorFallbackUsed;

  if (force ||
      pulseOn != lastPulseOn_ ||
      live != lastSensorAvailable_ ||
      simulated != lastFallbackUsed_) {
    lv_label_set_text(
        liveLabel_,
        simulated ? "SIM" : (live ? "LIVE" : "WAIT"));

    const lv_color_t liveColor = simulated
                                     ? color(COLOR_WARNING_HEX)
                                     : (live
                                            ? color(COLOR_RED_BRIGHT_HEX)
                                            : color(COLOR_TEXT_MUTED_HEX));

    lv_obj_set_style_bg_color(liveDot_, liveColor, LV_PART_MAIN);
    lv_obj_set_style_border_color(liveDot_, liveColor, LV_PART_MAIN);
    lv_obj_set_style_opa(
        liveDot_,
        live && !simulated && !pulseOn ? 96 : LV_OPA_COVER,
        LV_PART_MAIN);
    lv_obj_set_style_text_color(liveLabel_, liveColor, LV_PART_MAIN);
    lv_obj_set_style_border_color(
        liveChip_,
        simulated
            ? color(COLOR_WARNING_HEX)
            : (live
                   ? color(COLOR_RED_DARK_HEX)
                   : color(COLOR_BORDER_HEX)),
        LV_PART_MAIN);
  }

  if (force || status.state != lastState_) {
    const lv_color_t currentStateColor = stateColor(status.state);
    lv_label_set_text(stateLabel_, stateText(status.state));
    lv_obj_set_style_bg_color(
        stateDot_,
        currentStateColor,
        LV_PART_MAIN);
    lv_obj_set_style_border_color(
        stateDot_,
        currentStateColor,
        LV_PART_MAIN);
    lv_obj_set_style_border_color(
        stateChip_,
        currentStateColor,
        LV_PART_MAIN);
  }

  const bool wifiConnected = WiFi.status() == WL_CONNECTED;
  if (force || wifiConnected != lastWifiConnected_) {
    lv_obj_set_style_bg_color(
        wifiDot_,
        wifiConnected
            ? color(COLOR_SUCCESS_HEX)
            : color(COLOR_DANGER_HEX),
        LV_PART_MAIN);
  }

  char wifiBuffer[16];
  if (wifiConnected) {
    snprintf(wifiBuffer, sizeof(wifiBuffer), "%ddB", WiFi.RSSI());
  } else {
    snprintf(wifiBuffer, sizeof(wifiBuffer), "OFF");
  }
  lv_label_set_text(wifiLabel_, wifiBuffer);
  lv_obj_set_style_text_color(
      wifiLabel_,
      wifiConnected
          ? color(COLOR_TEXT_HEX)
          : color(COLOR_TEXT_MUTED_HEX),
      LV_PART_MAIN);

  if (force ||
      status.backendConnected != lastBackendConnected_) {
    lv_label_set_text(
        serverLabel_,
        status.backendConnected ? "SERVER" : "WAIT");
    lv_obj_set_style_bg_color(
        serverDot_,
        status.backendConnected
            ? color(COLOR_SUCCESS_HEX)
            : color(COLOR_DANGER_HEX),
        LV_PART_MAIN);
    lv_obj_set_style_text_color(
        serverLabel_,
        status.backendConnected
            ? color(COLOR_TEXT_HEX)
            : color(COLOR_TEXT_MUTED_HEX),
        LV_PART_MAIN);
  }

  if (force ||
      status.sensorReadingAvailable != lastSensorAvailable_ ||
      valueChanged(status.lastTemperature, lastTemperature_)) {
    updateMetric(
        temperatureValueLabel_,
        temperatureMinimumLabel_,
        temperatureMaximumLabel_,
        temperatureBar_,
        status.lastTemperature,
        minTemperature_,
        maxTemperature_,
        status.sensorReadingAvailable);
  }

  if (force ||
      status.sensorReadingAvailable != lastSensorAvailable_ ||
      valueChanged(status.lastHumidity, lastHumidity_)) {
    updateMetric(
        humidityValueLabel_,
        humidityMinimumLabel_,
        humidityMaximumLabel_,
        humidityBar_,
        status.lastHumidity,
        minHumidity_,
        maxHumidity_,
        status.sensorReadingAvailable);
  }

  char ipBuffer[28];
  if (wifiConnected) {
    const String localIp = WiFi.localIP().toString();
    snprintf(ipBuffer, sizeof(ipBuffer), "IP %s", localIp.c_str());
  } else {
    snprintf(ipBuffer, sizeof(ipBuffer), "IP --.--.--.--");
  }
  lv_label_set_text(ipLabel_, ipBuffer);
  lv_obj_set_style_text_color(
      ipLabel_,
      wifiConnected
          ? color(COLOR_TEXT_SECONDARY_HEX)
          : color(COLOR_TEXT_MUTED_HEX),
      LV_PART_MAIN);

  const unsigned long ageSecond = now / 1000UL;
  if (force || ageSecond != lastAgeSecond_) {
    char ageBuffer[18];
    if (!status.sensorReadingAvailable ||
        status.lastSensorReadAtMs == 0UL) {
      snprintf(ageBuffer, sizeof(ageBuffer), "AGE --s");
    } else {
      const unsigned long sensorAge =
          (now - status.lastSensorReadAtMs) / 1000UL;
      snprintf(ageBuffer, sizeof(ageBuffer), "AGE %lus", sensorAge);
    }

    lv_label_set_text(ageLabel_, ageBuffer);
    lastAgeSecond_ = ageSecond;
  }

  lastPulseOn_ = pulseOn;
  lastState_ = status.state;
  lastWifiConnected_ = wifiConnected;
  lastBackendConnected_ = status.backendConnected;
  lastSensorAvailable_ = status.sensorReadingAvailable;
  lastFallbackUsed_ = simulated;
  lastTemperature_ = status.lastTemperature;
  lastHumidity_ = status.lastHumidity;
}

void TftDisplay::updateMetric(
    lv_obj_t *valueLabel,
    lv_obj_t *minimumLabel,
    lv_obj_t *maximumLabel,
    lv_obj_t *bar,
    float value,
    float sessionMinimum,
    float sessionMaximum,
    bool available) {
  if (!available || isnan(value)) {
    lv_label_set_text(valueLabel, "--.-");
    lv_label_set_text(minimumLabel, "MIN --.-");
    lv_label_set_text(maximumLabel, "MAX --.-");
    lv_bar_set_value(bar, lv_bar_get_min_value(bar), LV_ANIM_OFF);
    return;
  }

  char valueBuffer[16];
  char minimumBuffer[18];
  char maximumBuffer[18];

  snprintf(valueBuffer, sizeof(valueBuffer), "%.1f", value);
  snprintf(minimumBuffer, sizeof(minimumBuffer), "MIN %.1f", sessionMinimum);
  snprintf(maximumBuffer, sizeof(maximumBuffer), "MAX %.1f", sessionMaximum);

  lv_label_set_text(valueLabel, valueBuffer);
  lv_label_set_text(minimumLabel, minimumBuffer);
  lv_label_set_text(maximumLabel, maximumBuffer);

  const int32_t barMinimum = lv_bar_get_min_value(bar);
  const int32_t barMaximum = lv_bar_get_max_value(bar);
  const float clampedValue = clampFloat(
      value,
      static_cast<float>(barMinimum),
      static_cast<float>(barMaximum));

  lv_bar_set_value(
      bar,
      static_cast<int32_t>(lroundf(clampedValue)),
      LV_ANIM_OFF);
}

void TftDisplay::updateSessionExtrema(
    const RuntimeStatus &status) {
  if (!status.sensorReadingAvailable) return;

  if (!isnan(status.lastTemperature)) {
    if (isnan(minTemperature_) ||
        status.lastTemperature < minTemperature_) {
      minTemperature_ = status.lastTemperature;
    }
    if (isnan(maxTemperature_) ||
        status.lastTemperature > maxTemperature_) {
      maxTemperature_ = status.lastTemperature;
    }
  }

  if (!isnan(status.lastHumidity)) {
    if (isnan(minHumidity_) ||
        status.lastHumidity < minHumidity_) {
      minHumidity_ = status.lastHumidity;
    }
    if (isnan(maxHumidity_) ||
        status.lastHumidity > maxHumidity_) {
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

void TftDisplay::stylePanel(
    lv_obj_t *object,
    lv_color_t background,
    lv_color_t border,
    int16_t radius,
    int16_t borderWidth) {
  lv_obj_clear_flag(object, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_style_bg_color(object, background, LV_PART_MAIN);
  lv_obj_set_style_bg_opa(object, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_border_color(object, border, LV_PART_MAIN);
  lv_obj_set_style_border_width(object, borderWidth, LV_PART_MAIN);
  lv_obj_set_style_radius(object, radius, LV_PART_MAIN);
  lv_obj_set_style_pad_all(object, 0, LV_PART_MAIN);
  lv_obj_set_style_shadow_width(object, 0, LV_PART_MAIN);
}

void TftDisplay::styleLabel(
    lv_obj_t *label,
    const lv_font_t *font,
    lv_color_t textColor,
    int16_t letterSpacing) {
  lv_obj_set_style_text_font(label, font, LV_PART_MAIN);
  lv_obj_set_style_text_color(label, textColor, LV_PART_MAIN);
  lv_obj_set_style_text_letter_space(
      label,
      letterSpacing,
      LV_PART_MAIN);
  lv_obj_set_style_bg_opa(label, LV_OPA_TRANSP, LV_PART_MAIN);
  lv_obj_set_style_pad_all(label, 0, LV_PART_MAIN);
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

lv_color_t TftDisplay::stateColor(AppState state) const {
  switch (state) {
    case AppState::ONLINE:
      return color(COLOR_SUCCESS_HEX);
    case AppState::DEGRADED:
    case AppState::RECOVERY:
      return color(COLOR_DANGER_HEX);
    case AppState::SETUP_PORTAL:
    case AppState::UNPROVISIONED:
      return color(COLOR_WARNING_HEX);
    case AppState::CONNECTING_WIFI:
    case AppState::CONNECTING_BACKEND:
    case AppState::UPDATING:
      return color(COLOR_INFO_HEX);
    case AppState::BOOTING:
    default:
      return color(COLOR_TEXT_MUTED_HEX);
  }
}

bool TftDisplay::valueChanged(
    float current,
    float previous) const {
  if (isnan(current) != isnan(previous)) return true;
  if (isnan(current) && isnan(previous)) return false;
  return fabsf(current - previous) >= 0.05f;
}
