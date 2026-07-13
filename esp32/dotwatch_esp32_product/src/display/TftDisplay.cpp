#include "display/TftDisplay.h"

#include <SPI.h>
#include <WiFi.h>
#include <math.h>

#include "ProductConfig.h"

namespace {

constexpr uint32_t COLOR_OUTER_HEX = 0x080A0C;
constexpr uint32_t COLOR_SCREEN_HEX = 0x000000;
constexpr uint32_t COLOR_PANEL_BORDER_HEX = 0x30363B;
constexpr uint32_t COLOR_DIVIDER_HEX = 0x252B30;
constexpr uint32_t COLOR_TEXT_HEX = 0xF7FAFC;
constexpr uint32_t COLOR_TEXT_MUTED_HEX = 0xAEB7BE;
constexpr uint32_t COLOR_BLUE_HEX = 0x62B5E5;
constexpr uint32_t COLOR_BLUE_DIM_HEX = 0x2E6688;
constexpr uint32_t COLOR_SUCCESS_HEX = 0x55D68B;
constexpr uint32_t COLOR_WARNING_HEX = 0xFFBD59;
constexpr uint32_t COLOR_DANGER_HEX = 0xFF6670;
constexpr uint32_t COLOR_INFO_HEX = 0x62B5E5;
constexpr uint32_t COLOR_OFF_HEX = 0x68727A;

constexpr unsigned long LVGL_HANDLER_INTERVAL_MS = 5UL;

lv_color_t color(uint32_t value) {
  return lv_color_hex(value);
}

static const lv_point_t HUMIDITY_DROP_POINTS[] = {
    {17, 1},
    {7, 17},
    {4, 24},
    {4, 31},
    {7, 37},
    {12, 41},
    {17, 43},
    {22, 41},
    {27, 37},
    {30, 31},
    {30, 24},
    {27, 17},
    {17, 1},
};

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

  createDashboard();

  const unsigned long now = millis();
  lastLvglTickAt_ = now;
  lastHandlerAt_ = now;
  lastUiRefreshAt_ = now;

  ready_ = true;
  firstDraw_ = true;

  Serial.println(
      "TftDisplay: clean two-column reference UI initialized");
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
  lv_obj_clear_flag(screen_, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_style_bg_color(screen_, color(COLOR_OUTER_HEX), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(screen_, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_pad_all(screen_, 0, LV_PART_MAIN);

  lv_obj_t *displayPanel = lv_obj_create(screen_);
  lv_obj_set_pos(displayPanel, 7, 7);
  lv_obj_set_size(displayPanel, 306, 193);
  stylePanel(
      displayPanel,
      color(COLOR_SCREEN_HEX),
      color(COLOR_PANEL_BORDER_HEX),
      15,
      1);

  createMetricSection(
      displayPanel,
      0,
      true,
      temperatureValueLabel_);

  createMetricSection(
      displayPanel,
      153,
      false,
      humidityValueLabel_);

  lv_obj_t *divider = lv_obj_create(displayPanel);
  lv_obj_set_pos(divider, 152, 22);
  lv_obj_set_size(divider, 1, 145);
  stylePanel(
      divider,
      color(COLOR_DIVIDER_HEX),
      color(COLOR_DIVIDER_HEX),
      0,
      0);

  createStatusBar();
}

void TftDisplay::createMetricSection(
    lv_obj_t *parent,
    int16_t x,
    bool temperatureSection,
    lv_obj_t *&valueLabel) {
  lv_obj_t *section = lv_obj_create(parent);
  lv_obj_set_pos(section, x, 0);
  lv_obj_set_size(section, 153, 193);
  stylePanel(
      section,
      color(COLOR_SCREEN_HEX),
      color(COLOR_SCREEN_HEX),
      0,
      0);

  if (temperatureSection) {
    createThermometerIcon(section);
  } else {
    createHumidityIcon(section);
  }

  lv_obj_t *title = lv_label_create(section);
  lv_label_set_text(
      title,
      temperatureSection ? "Temperature" : "Humidity");
  lv_obj_set_pos(title, 51, 31);
  styleLabel(
      title,
      &lv_font_montserrat_14,
      color(COLOR_TEXT_MUTED_HEX));

  valueLabel = lv_label_create(section);
  lv_label_set_text(
      valueLabel,
      temperatureSection ? "--.-" : "--");
  lv_obj_set_pos(valueLabel, 10, 79);
  lv_obj_set_size(valueLabel, 110, 54);
  lv_obj_set_style_text_align(
      valueLabel,
      LV_TEXT_ALIGN_CENTER,
      LV_PART_MAIN);
  styleLabel(
      valueLabel,
      &lv_font_montserrat_40,
      color(COLOR_TEXT_HEX),
      -1);

  if (temperatureSection) {
    lv_obj_t *degree = lv_obj_create(section);
    lv_obj_set_pos(degree, 120, 91);
    lv_obj_set_size(degree, 7, 7);
    lv_obj_set_style_bg_opa(degree, LV_OPA_TRANSP, LV_PART_MAIN);
    lv_obj_set_style_border_color(
        degree,
        color(COLOR_TEXT_HEX),
        LV_PART_MAIN);
    lv_obj_set_style_border_width(degree, 2, LV_PART_MAIN);
    lv_obj_set_style_radius(degree, LV_RADIUS_CIRCLE, LV_PART_MAIN);
    lv_obj_set_style_pad_all(degree, 0, LV_PART_MAIN);

    lv_obj_t *unit = lv_label_create(section);
    lv_label_set_text(unit, "C");
    lv_obj_set_pos(unit, 128, 91);
    styleLabel(
        unit,
        &lv_font_montserrat_18,
        color(COLOR_TEXT_HEX));
  } else {
    lv_obj_t *unit = lv_label_create(section);
    lv_label_set_text(unit, "%");
    lv_obj_set_pos(unit, 120, 91);
    styleLabel(
        unit,
        &lv_font_montserrat_18,
        color(COLOR_TEXT_HEX));
  }

  lv_obj_t *accent = lv_obj_create(section);
  lv_obj_set_pos(accent, 51, 148);
  lv_obj_set_size(accent, 51, 3);
  stylePanel(
      accent,
      color(COLOR_BLUE_HEX),
      color(COLOR_BLUE_HEX),
      LV_RADIUS_CIRCLE,
      0);

  lv_obj_t *caption = lv_label_create(section);
  lv_label_set_text(
      caption,
      temperatureSection ? "AMBIENT" : "RELATIVE RH");
  lv_obj_set_pos(caption, 0, 161);
  lv_obj_set_width(caption, 153);
  lv_obj_set_style_text_align(
      caption,
      LV_TEXT_ALIGN_CENTER,
      LV_PART_MAIN);
  styleLabel(
      caption,
      &lv_font_montserrat_12,
      color(COLOR_BLUE_HEX),
      1);
}

void TftDisplay::createThermometerIcon(lv_obj_t *parent) {
  lv_obj_t *tube = lv_obj_create(parent);
  lv_obj_set_pos(tube, 25, 25);
  lv_obj_set_size(tube, 9, 31);
  lv_obj_set_style_bg_opa(tube, LV_OPA_TRANSP, LV_PART_MAIN);
  lv_obj_set_style_border_color(
      tube,
      color(COLOR_BLUE_HEX),
      LV_PART_MAIN);
  lv_obj_set_style_border_width(tube, 2, LV_PART_MAIN);
  lv_obj_set_style_radius(tube, 5, LV_PART_MAIN);
  lv_obj_set_style_pad_all(tube, 0, LV_PART_MAIN);

  lv_obj_t *mercury = lv_obj_create(parent);
  lv_obj_set_pos(mercury, 28, 35);
  lv_obj_set_size(mercury, 3, 22);
  stylePanel(
      mercury,
      color(COLOR_BLUE_HEX),
      color(COLOR_BLUE_HEX),
      LV_RADIUS_CIRCLE,
      0);

  lv_obj_t *bulb = lv_obj_create(parent);
  lv_obj_set_pos(bulb, 20, 50);
  lv_obj_set_size(bulb, 19, 19);
  lv_obj_set_style_bg_color(
      bulb,
      color(COLOR_SCREEN_HEX),
      LV_PART_MAIN);
  lv_obj_set_style_bg_opa(bulb, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_border_color(
      bulb,
      color(COLOR_BLUE_HEX),
      LV_PART_MAIN);
  lv_obj_set_style_border_width(bulb, 2, LV_PART_MAIN);
  lv_obj_set_style_radius(bulb, LV_RADIUS_CIRCLE, LV_PART_MAIN);
  lv_obj_set_style_pad_all(bulb, 0, LV_PART_MAIN);

  lv_obj_t *bulbFill = lv_obj_create(parent);
  lv_obj_set_pos(bulbFill, 25, 55);
  lv_obj_set_size(bulbFill, 9, 9);
  stylePanel(
      bulbFill,
      color(COLOR_BLUE_HEX),
      color(COLOR_BLUE_HEX),
      LV_RADIUS_CIRCLE,
      0);
}

void TftDisplay::createHumidityIcon(lv_obj_t *parent) {
  lv_obj_t *drop = lv_line_create(parent);
  lv_line_set_points(
      drop,
      HUMIDITY_DROP_POINTS,
      sizeof(HUMIDITY_DROP_POINTS) / sizeof(HUMIDITY_DROP_POINTS[0]));
  lv_obj_set_pos(drop, 18, 22);
  lv_obj_set_size(drop, 35, 45);
  lv_obj_set_style_line_color(
      drop,
      color(COLOR_BLUE_HEX),
      LV_PART_MAIN);
  lv_obj_set_style_line_width(drop, 3, LV_PART_MAIN);
  lv_obj_set_style_line_rounded(drop, true, LV_PART_MAIN);

  static const lv_point_t highlightPoints[] = {
      {10, 28},
      {11, 32},
      {14, 35},
  };

  lv_obj_t *highlight = lv_line_create(parent);
  lv_line_set_points(
      highlight,
      highlightPoints,
      sizeof(highlightPoints) / sizeof(highlightPoints[0]));
  lv_obj_set_pos(highlight, 18, 22);
  lv_obj_set_size(highlight, 35, 45);
  lv_obj_set_style_line_color(
      highlight,
      color(COLOR_TEXT_HEX),
      LV_PART_MAIN);
  lv_obj_set_style_line_width(highlight, 2, LV_PART_MAIN);
  lv_obj_set_style_line_rounded(highlight, true, LV_PART_MAIN);
}

void TftDisplay::createStatusBar() {
  lv_obj_t *statusBar = lv_obj_create(screen_);
  lv_obj_set_pos(statusBar, 7, 207);
  lv_obj_set_size(statusBar, 306, 26);
  stylePanel(
      statusBar,
      color(COLOR_SCREEN_HEX),
      color(COLOR_PANEL_BORDER_HEX),
      9,
      1);

  createStatusItem(
      statusBar,
      7,
      87,
      stateDot_,
      stateLabel_);

  createStatusItem(
      statusBar,
      99,
      103,
      wifiDot_,
      wifiLabel_);

  createStatusItem(
      statusBar,
      207,
      92,
      cloudDot_,
      cloudLabel_);
}

void TftDisplay::createStatusItem(
    lv_obj_t *parent,
    int16_t x,
    int16_t width,
    lv_obj_t *&dot,
    lv_obj_t *&label) {
  lv_obj_t *item = lv_obj_create(parent);
  lv_obj_set_pos(item, x, 0);
  lv_obj_set_size(item, width, 24);
  stylePanel(
      item,
      color(COLOR_SCREEN_HEX),
      color(COLOR_SCREEN_HEX),
      0,
      0);

  dot = lv_obj_create(item);
  lv_obj_set_pos(dot, 4, 8);
  lv_obj_set_size(dot, 7, 7);
  styleDot(dot, color(COLOR_OFF_HEX));

  label = lv_label_create(item);
  lv_label_set_text(label, "WAIT");
  lv_obj_set_pos(label, 16, 5);
  lv_obj_set_width(label, width - 18);
  lv_obj_set_style_text_align(
      label,
      LV_TEXT_ALIGN_LEFT,
      LV_PART_MAIN);
  styleLabel(
      label,
      &lv_font_montserrat_12,
      color(COLOR_TEXT_MUTED_HEX));
}

void TftDisplay::updateDashboard(
    const RuntimeStatus &status,
    bool force) {
  const bool wifiConnected = WiFi.status() == WL_CONNECTED;

  if (force ||
      status.sensorReadingAvailable != lastSensorAvailable_ ||
      valueChanged(status.lastTemperature, lastTemperature_)) {
    updateTemperature(
        status.lastTemperature,
        status.sensorReadingAvailable);
  }

  if (force ||
      status.sensorReadingAvailable != lastSensorAvailable_ ||
      valueChanged(status.lastHumidity, lastHumidity_)) {
    updateHumidity(
        status.lastHumidity,
        status.sensorReadingAvailable);
  }

  if (force || status.state != lastState_) {
    const lv_color_t currentStateColor = stateColor(status.state);
    lv_label_set_text(stateLabel_, stateText(status.state));
    styleDot(stateDot_, currentStateColor);
    lv_obj_set_style_text_color(
        stateLabel_,
        currentStateColor,
        LV_PART_MAIN);
  }

  if (force || wifiConnected != lastWifiConnected_) {
    styleDot(
        wifiDot_,
        wifiConnected
            ? color(COLOR_BLUE_HEX)
            : color(COLOR_OFF_HEX));
  }

  char wifiBuffer[18];
  if (wifiConnected) {
    snprintf(
        wifiBuffer,
        sizeof(wifiBuffer),
        "Wi-Fi %ddB",
        WiFi.RSSI());
  } else {
    snprintf(wifiBuffer, sizeof(wifiBuffer), "Wi-Fi Off");
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
    styleDot(
        cloudDot_,
        status.backendConnected
            ? color(COLOR_BLUE_HEX)
            : color(COLOR_OFF_HEX));

    lv_label_set_text(
        cloudLabel_,
        status.backendConnected ? "Cloud On" : "Cloud Wait");

    lv_obj_set_style_text_color(
        cloudLabel_,
        status.backendConnected
            ? color(COLOR_TEXT_HEX)
            : color(COLOR_TEXT_MUTED_HEX),
        LV_PART_MAIN);
  }

  lastState_ = status.state;
  lastWifiConnected_ = wifiConnected;
  lastBackendConnected_ = status.backendConnected;
  lastSensorAvailable_ = status.sensorReadingAvailable;
  lastTemperature_ = status.lastTemperature;
  lastHumidity_ = status.lastHumidity;
}

void TftDisplay::updateTemperature(
    float value,
    bool available) {
  if (!available || isnan(value)) {
    lv_label_set_text(temperatureValueLabel_, "--.-");
    return;
  }

  char valueBuffer[16];
  snprintf(valueBuffer, sizeof(valueBuffer), "%.1f", value);
  lv_label_set_text(temperatureValueLabel_, valueBuffer);
}

void TftDisplay::updateHumidity(
    float value,
    bool available) {
  if (!available || isnan(value)) {
    lv_label_set_text(humidityValueLabel_, "--");
    return;
  }

  char valueBuffer[16];
  snprintf(valueBuffer, sizeof(valueBuffer), "%.0f", value);
  lv_label_set_text(humidityValueLabel_, valueBuffer);
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

void TftDisplay::styleDot(
    lv_obj_t *dot,
    lv_color_t dotColor) {
  lv_obj_set_style_bg_color(dot, dotColor, LV_PART_MAIN);
  lv_obj_set_style_bg_opa(dot, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_border_color(dot, dotColor, LV_PART_MAIN);
  lv_obj_set_style_border_width(dot, 0, LV_PART_MAIN);
  lv_obj_set_style_radius(dot, LV_RADIUS_CIRCLE, LV_PART_MAIN);
  lv_obj_set_style_pad_all(dot, 0, LV_PART_MAIN);
}

const char *TftDisplay::stateText(AppState state) const {
  switch (state) {
    case AppState::BOOTING:
      return "Booting";
    case AppState::UNPROVISIONED:
      return "Setup";
    case AppState::SETUP_PORTAL:
      return "Portal";
    case AppState::CONNECTING_WIFI:
      return "Wi-Fi";
    case AppState::CONNECTING_BACKEND:
      return "Server";
    case AppState::ONLINE:
      return "Online";
    case AppState::DEGRADED:
      return "Degraded";
    case AppState::RECOVERY:
      return "Recovery";
    case AppState::UPDATING:
      return "Updating";
    default:
      return "Unknown";
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
      return color(COLOR_OFF_HEX);
  }
}

bool TftDisplay::valueChanged(
    float current,
    float previous) const {
  if (isnan(current) != isnan(previous)) return true;
  if (isnan(current) && isnan(previous)) return false;
  return fabsf(current - previous) >= 0.05f;
}
