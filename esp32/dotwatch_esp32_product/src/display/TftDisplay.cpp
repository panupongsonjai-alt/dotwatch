#include "display/TftDisplay.h"

#include <SPI.h>
#include <WiFi.h>
#include <math.h>

#include "ProductConfig.h"

namespace {

// Minimal black/red palette matching the supplied TFT reference.
constexpr uint32_t COLOR_BACKGROUND_HEX = 0x070809;
constexpr uint32_t COLOR_HEADER_HEX = 0x0C0D0F;
constexpr uint32_t COLOR_CARD_HEX = 0x101214;
constexpr uint32_t COLOR_BORDER_HEX = 0x292B2E;
constexpr uint32_t COLOR_DIVIDER_HEX = 0x2A2C2F;
constexpr uint32_t COLOR_TEXT_HEX = 0xF4F4F5;
constexpr uint32_t COLOR_TEXT_MUTED_HEX = 0xC6C7C9;
constexpr uint32_t COLOR_TEXT_OFF_HEX = 0x55585C;
constexpr uint32_t COLOR_ACCENT_HEX = 0xF04444;
constexpr uint32_t COLOR_ACCENT_GLOW_HEX = 0x4A1719;
constexpr uint32_t COLOR_WARNING_HEX = 0xF2B84B;

constexpr unsigned long LVGL_HANDLER_INTERVAL_MS = 5UL;

lv_color_t color(uint32_t value) {
  return lv_color_hex(value);
}

// Wi-Fi curves are intentionally made from lv_line so the screen does not
// require the optional LVGL arc widget.
static const lv_point_t WIFI_OUTER_POINTS[] = {
    {0, 5}, {4, 2}, {9, 0}, {14, 0}, {19, 2}, {23, 5},
};
static const lv_point_t WIFI_MIDDLE_POINTS[] = {
    {4, 10}, {8, 7}, {12, 6}, {16, 7}, {20, 10},
};
static const lv_point_t WIFI_INNER_POINTS[] = {
    {8, 15}, {10, 13}, {12, 12}, {14, 13}, {16, 15},
};

static const lv_point_t HUMIDITY_DROP_POINTS[] = {
    {14, 0}, {9, 7}, {4, 15}, {2, 22}, {3, 29}, {7, 34},
    {14, 37}, {21, 34}, {25, 29}, {26, 22}, {24, 15}, {19, 7}, {14, 0},
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

  // Put every control line in a known idle state before starting SPI. A TFT
  // module can remain in reset or command mode after an ESP32 warm restart,
  // which looks exactly like a permanently white screen.
  pinMode(ProductConfig::TFT_CS_PIN, OUTPUT);
  pinMode(ProductConfig::TFT_DC_PIN, OUTPUT);
  pinMode(ProductConfig::TFT_RST_PIN, OUTPUT);
  digitalWrite(ProductConfig::TFT_CS_PIN, HIGH);
  digitalWrite(ProductConfig::TFT_DC_PIN, HIGH);
  digitalWrite(ProductConfig::TFT_RST_PIN, HIGH);
  delay(10);
  digitalWrite(ProductConfig::TFT_RST_PIN, LOW);
  delay(ProductConfig::TFT_RESET_LOW_MS);
  digitalWrite(ProductConfig::TFT_RST_PIN, HIGH);
  delay(ProductConfig::TFT_RESET_RECOVERY_MS);

  SPI.begin(
      ProductConfig::TFT_SCK_PIN,
      ProductConfig::TFT_MISO_PIN,
      ProductConfig::TFT_MOSI_PIN,
      ProductConfig::TFT_CS_PIN);

  Serial.printf(
      "TftDisplay: init ILI9341 SCK=%d MOSI=%d MISO=%d CS=%d DC=%d RST=%d SPI=%lu Hz\n",
      ProductConfig::TFT_SCK_PIN,
      ProductConfig::TFT_MOSI_PIN,
      ProductConfig::TFT_MISO_PIN,
      ProductConfig::TFT_CS_PIN,
      ProductConfig::TFT_DC_PIN,
      ProductConfig::TFT_RST_PIN,
      static_cast<unsigned long>(ProductConfig::TFT_SPI_FREQUENCY_HZ));

  tft_.begin(ProductConfig::TFT_SPI_FREQUENCY_HZ);
  delay(20);
  tft_.setRotation(ProductConfig::TFT_ROTATION);
  tft_.invertDisplay(ProductConfig::TFT_INVERT_COLORS);

  // Very short hardware-path self-test. A red flash followed by black confirms
  // that CS/DC/RST/SCK/MOSI and the ILI9341 controller are responding before
  // LVGL takes ownership of the display.
  tft_.fillScreen(ILI9341_RED);
  delay(ProductConfig::TFT_BOOT_TEST_MS);
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

  // Force the first LVGL frame immediately. AppController performs Wi-Fi and
  // provisioning work after this call and some of that work can block for
  // several seconds; rendering here prevents a blank screen during startup.
  lv_obj_invalidate(screen_);
  for (uint8_t attempt = 0; attempt < 3; ++attempt) {
    lv_tick_inc(5);
    lv_timer_handler();
    delay(5);
  }

  const unsigned long now = millis();
  lastLvglTickAt_ = now;
  lastHandlerAt_ = now;
  lastUiRefreshAt_ = now;
  lastPowerConnected_ = readPowerConnected();

  ready_ = true;
  firstDraw_ = true;

  Serial.println("TftDisplay: minimal status dashboard initialized; boot self-test complete");
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

  createStatusHeader();

  lv_obj_t *separator = lv_obj_create(screen_);
  lv_obj_set_pos(separator, 4, 70);
  lv_obj_set_size(separator, 312, 2);
  styleBar(separator, color(COLOR_DIVIDER_HEX), 0);

  createMetricCard(
      4,
      true,
      temperatureValueLabel_,
      temperatureUnitLabel_);
  createMetricCard(
      162,
      false,
      humidityValueLabel_,
      humidityUnitLabel_);
}

void TftDisplay::createStatusHeader() {
  lv_obj_t *header = lv_obj_create(screen_);
  lv_obj_set_pos(header, 4, 4);
  lv_obj_set_size(header, 312, 62);
  styleBaseObject(header);
  lv_obj_set_style_bg_color(header, color(COLOR_HEADER_HEX), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(header, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_border_width(header, 0, LV_PART_MAIN);
  lv_obj_set_style_radius(header, 9, LV_PART_MAIN);

  lv_obj_t *divider1 = lv_obj_create(header);
  lv_obj_set_pos(divider1, 103, 10);
  lv_obj_set_size(divider1, 1, 42);
  styleBar(divider1, color(COLOR_DIVIDER_HEX), 0);

  lv_obj_t *divider2 = lv_obj_create(header);
  lv_obj_set_pos(divider2, 207, 10);
  lv_obj_set_size(divider2, 1, 42);
  styleBar(divider2, color(COLOR_DIVIDER_HEX), 0);

  createWiFiIcon(header, 52, 8);
  createBatteryIcon(header, 156, 9);
  createOnlineStatus(header, 260, 8);
}

void TftDisplay::createMetricCard(
    int16_t x,
    bool temperatureCard,
    lv_obj_t *&valueLabel,
    lv_obj_t *&unitLabel) {
  lv_obj_t *card = lv_obj_create(screen_);
  lv_obj_set_pos(card, x, 79);
  lv_obj_set_size(card, 154, 157);
  styleCard(card, color(COLOR_CARD_HEX));

  if (temperatureCard) {
    createThermometerIcon(card, 17, 18);
  } else {
    createHumidityIcon(card, 12, 15);
  }

  lv_obj_t *title = lv_label_create(card);
  lv_label_set_text(title, temperatureCard ? "Temperature" : "Humidity");
  lv_obj_set_pos(title, 49, 22);
  styleLabel(title, &lv_font_montserrat_14, color(COLOR_TEXT_HEX));

  lv_obj_t *accent = lv_obj_create(card);
  lv_obj_set_pos(accent, 49, 47);
  lv_obj_set_size(accent, 18, 3);
  styleBar(accent, color(COLOR_ACCENT_HEX), 1);

  valueLabel = lv_label_create(card);
  lv_label_set_text(valueLabel, "--.-");
  lv_obj_set_pos(valueLabel, 7, 78);
  lv_obj_set_size(valueLabel, 111, 48);
  lv_obj_set_style_text_align(valueLabel, LV_TEXT_ALIGN_RIGHT, LV_PART_MAIN);
  styleLabel(valueLabel, &lv_font_montserrat_40, color(COLOR_TEXT_HEX), -1);

  unitLabel = lv_label_create(card);
  lv_label_set_text(unitLabel, temperatureCard ? "°C" : "%RH");
  lv_obj_set_pos(unitLabel, 120, 108);
  styleLabel(
      unitLabel,
      temperatureCard ? &lv_font_montserrat_18 : &lv_font_montserrat_14,
      color(COLOR_ACCENT_HEX));
}

void TftDisplay::createThermometerIcon(lv_obj_t *parent, int16_t x, int16_t y) {
  lv_obj_t *tube = lv_obj_create(parent);
  lv_obj_set_pos(tube, x + 7, y);
  lv_obj_set_size(tube, 10, 30);
  styleBaseObject(tube);
  lv_obj_set_style_bg_opa(tube, LV_OPA_TRANSP, LV_PART_MAIN);
  lv_obj_set_style_border_color(tube, color(COLOR_TEXT_HEX), LV_PART_MAIN);
  lv_obj_set_style_border_width(tube, 2, LV_PART_MAIN);
  lv_obj_set_style_radius(tube, 5, LV_PART_MAIN);

  lv_obj_t *stem = lv_obj_create(parent);
  lv_obj_set_pos(stem, x + 11, y + 10);
  lv_obj_set_size(stem, 2, 25);
  styleBar(stem, color(COLOR_TEXT_HEX));

  lv_obj_t *bulb = lv_obj_create(parent);
  lv_obj_set_pos(bulb, x, y + 25);
  lv_obj_set_size(bulb, 24, 24);
  styleCircle(bulb, color(COLOR_CARD_HEX), color(COLOR_TEXT_HEX), 2);

  lv_obj_t *fill = lv_obj_create(parent);
  lv_obj_set_pos(fill, x + 7, y + 32);
  lv_obj_set_size(fill, 10, 10);
  styleCircle(fill, color(COLOR_TEXT_HEX), color(COLOR_TEXT_HEX), 0);
}

void TftDisplay::createHumidityIcon(lv_obj_t *parent, int16_t x, int16_t y) {
  lv_obj_t *drop = lv_line_create(parent);
  lv_line_set_points(
      drop,
      HUMIDITY_DROP_POINTS,
      sizeof(HUMIDITY_DROP_POINTS) / sizeof(HUMIDITY_DROP_POINTS[0]));
  lv_obj_set_pos(drop, x, y);
  lv_obj_set_size(drop, 28, 38);
  lv_obj_set_style_line_color(drop, color(COLOR_ACCENT_HEX), LV_PART_MAIN);
  lv_obj_set_style_line_width(drop, 3, LV_PART_MAIN);
  lv_obj_set_style_line_rounded(drop, true, LV_PART_MAIN);
}

void TftDisplay::createWiFiIcon(lv_obj_t *parent, int16_t centerX, int16_t topY) {
  const lv_point_t *pointSets[3] = {
      WIFI_OUTER_POINTS,
      WIFI_MIDDLE_POINTS,
      WIFI_INNER_POINTS,
  };
  const uint16_t pointCounts[3] = {6, 5, 5};

  for (int i = 0; i < 3; ++i) {
    wifiArcs_[i] = lv_line_create(parent);
    lv_line_set_points(wifiArcs_[i], pointSets[i], pointCounts[i]);
    lv_obj_set_pos(wifiArcs_[i], centerX - 12, topY);
    lv_obj_set_size(wifiArcs_[i], 24, 18);
    lv_obj_set_style_line_color(wifiArcs_[i], color(COLOR_TEXT_OFF_HEX), LV_PART_MAIN);
    lv_obj_set_style_line_width(wifiArcs_[i], 3, LV_PART_MAIN);
    lv_obj_set_style_line_rounded(wifiArcs_[i], true, LV_PART_MAIN);
  }

  wifiDot_ = lv_obj_create(parent);
  lv_obj_set_pos(wifiDot_, centerX - 3, topY + 18);
  lv_obj_set_size(wifiDot_, 6, 6);
  styleCircle(wifiDot_, color(COLOR_TEXT_OFF_HEX), color(COLOR_TEXT_OFF_HEX), 0);

  lv_obj_t *label = lv_label_create(parent);
  lv_label_set_text(label, "WiFi");
  lv_obj_set_pos(label, centerX - 16, 38);
  styleLabel(label, &lv_font_montserrat_14, color(COLOR_TEXT_HEX));
}

void TftDisplay::createBatteryIcon(lv_obj_t *parent, int16_t centerX, int16_t topY) {
  batteryBody_ = lv_obj_create(parent);
  lv_obj_set_pos(batteryBody_, centerX - 17, topY);
  lv_obj_set_size(batteryBody_, 32, 18);
  styleBaseObject(batteryBody_);
  lv_obj_set_style_bg_opa(batteryBody_, LV_OPA_TRANSP, LV_PART_MAIN);
  lv_obj_set_style_border_color(batteryBody_, color(COLOR_TEXT_HEX), LV_PART_MAIN);
  lv_obj_set_style_border_width(batteryBody_, 2, LV_PART_MAIN);
  lv_obj_set_style_radius(batteryBody_, 3, LV_PART_MAIN);

  batteryCap_ = lv_obj_create(parent);
  lv_obj_set_pos(batteryCap_, centerX + 16, topY + 5);
  lv_obj_set_size(batteryCap_, 4, 8);
  styleBar(batteryCap_, color(COLOR_TEXT_HEX), 1);

  batteryFill_ = lv_obj_create(parent);
  lv_obj_set_pos(batteryFill_, centerX - 13, topY + 4);
  lv_obj_set_size(batteryFill_, 24, 10);
  styleBar(batteryFill_, color(COLOR_TEXT_HEX), 1);

  lv_obj_t *label = lv_label_create(parent);
  lv_label_set_text(label, "Battery");
  lv_obj_set_pos(label, centerX - 27, 38);
  styleLabel(label, &lv_font_montserrat_14, color(COLOR_TEXT_HEX));
}

void TftDisplay::createOnlineStatus(lv_obj_t *parent, int16_t centerX, int16_t topY) {
  onlineGlow_ = lv_obj_create(parent);
  lv_obj_set_pos(onlineGlow_, centerX - 13, topY - 1);
  lv_obj_set_size(onlineGlow_, 26, 26);
  styleCircle(
      onlineGlow_,
      color(COLOR_ACCENT_GLOW_HEX),
      color(COLOR_ACCENT_GLOW_HEX),
      0);

  onlineDot_ = lv_obj_create(parent);
  lv_obj_set_pos(onlineDot_, centerX - 8, topY + 4);
  lv_obj_set_size(onlineDot_, 16, 16);
  styleCircle(onlineDot_, color(COLOR_ACCENT_HEX), color(COLOR_ACCENT_HEX), 0);

  onlineLabel_ = lv_label_create(parent);
  lv_label_set_text(onlineLabel_, "Online");
  lv_obj_set_pos(onlineLabel_, centerX - 23, 38);
  styleLabel(onlineLabel_, &lv_font_montserrat_14, color(COLOR_TEXT_HEX));
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
  }

  if (force || wifiConnected != lastWifiConnected_ || rssi != lastRssi_) {
    updateWiFiStatus(wifiConnected, rssi);
  }

  if (force || powerConnected != lastPowerConnected_) {
    updateBatteryStatus(powerConnected);
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
  int activeLevels = 0;
  if (connected) {
    if (rssi >= -60) {
      activeLevels = 3;
    } else if (rssi >= -72) {
      activeLevels = 2;
    } else {
      activeLevels = 1;
    }
  }

  // Array order is outer, middle, inner. Light the inner curve first.
  for (int i = 0; i < 3; ++i) {
    const int strengthLevel = 3 - i;
    const bool active = connected && strengthLevel <= activeLevels;
    lv_obj_set_style_line_color(
        wifiArcs_[i],
        active ? color(COLOR_TEXT_HEX) : color(COLOR_TEXT_OFF_HEX),
        LV_PART_MAIN);
  }

  const lv_color_t dotColor =
      connected ? color(COLOR_TEXT_HEX) : color(COLOR_TEXT_OFF_HEX);
  lv_obj_set_style_bg_color(wifiDot_, dotColor, LV_PART_MAIN);
  lv_obj_set_style_border_color(wifiDot_, dotColor, LV_PART_MAIN);
}

void TftDisplay::updateBatteryStatus(bool powerConnected) {
  const lv_color_t outline =
      powerConnected ? color(COLOR_TEXT_HEX) : color(COLOR_TEXT_OFF_HEX);

  lv_obj_set_style_border_color(batteryBody_, outline, LV_PART_MAIN);
  lv_obj_set_style_bg_color(batteryCap_, outline, LV_PART_MAIN);
  lv_obj_set_style_bg_color(batteryFill_, outline, LV_PART_MAIN);

  if (powerConnected) {
    lv_obj_clear_flag(batteryFill_, LV_OBJ_FLAG_HIDDEN);
  } else {
    lv_obj_add_flag(batteryFill_, LV_OBJ_FLAG_HIDDEN);
  }
}

void TftDisplay::updateConnectionStatus(
    AppState state,
    bool wifiConnected,
    bool backendConnected) {
  const bool online =
      wifiConnected && backendConnected && state == AppState::ONLINE;
  const bool connecting =
      !online && (wifiConnected || state == AppState::CONNECTING_WIFI ||
                  state == AppState::CONNECTING_BACKEND);

  const char *label = "Offline";
  lv_color_t dot = color(COLOR_TEXT_OFF_HEX);
  lv_color_t glow = color(COLOR_HEADER_HEX);

  if (online) {
    label = "Online";
    dot = color(COLOR_ACCENT_HEX);
    glow = color(COLOR_ACCENT_GLOW_HEX);
  } else if (connecting) {
    label = "Linking";
    dot = color(COLOR_WARNING_HEX);
    glow = color(0x453517);
  }

  lv_label_set_text(onlineLabel_, label);
  lv_obj_set_style_bg_color(onlineDot_, dot, LV_PART_MAIN);
  lv_obj_set_style_border_color(onlineDot_, dot, LV_PART_MAIN);
  lv_obj_set_style_bg_color(onlineGlow_, glow, LV_PART_MAIN);
  lv_obj_set_style_border_color(onlineGlow_, glow, LV_PART_MAIN);
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

void TftDisplay::styleCard(lv_obj_t *card, lv_color_t background) {
  styleBaseObject(card);
  lv_obj_set_style_bg_color(card, background, LV_PART_MAIN);
  lv_obj_set_style_bg_opa(card, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_border_color(card, color(COLOR_BORDER_HEX), LV_PART_MAIN);
  lv_obj_set_style_border_width(card, 1, LV_PART_MAIN);
  lv_obj_set_style_radius(card, 9, LV_PART_MAIN);
}

void TftDisplay::styleLabel(
    lv_obj_t *label,
    const lv_font_t *font,
    lv_color_t textColor,
    int16_t letterSpacing) {
  lv_obj_set_style_text_font(label, font, LV_PART_MAIN);
  lv_obj_set_style_text_color(label, textColor, LV_PART_MAIN);
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

void TftDisplay::styleBar(lv_obj_t *object, lv_color_t background, int16_t radius) {
  styleBaseObject(object);
  lv_obj_set_style_bg_color(object, background, LV_PART_MAIN);
  lv_obj_set_style_bg_opa(object, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_border_width(object, 0, LV_PART_MAIN);
  lv_obj_set_style_radius(object, radius, LV_PART_MAIN);
}

bool TftDisplay::valueChanged(float current, float previous) const {
  if (isnan(current) != isnan(previous)) return true;
  if (isnan(current) && isnan(previous)) return false;
  return fabsf(current - previous) >= 0.05f;
}
