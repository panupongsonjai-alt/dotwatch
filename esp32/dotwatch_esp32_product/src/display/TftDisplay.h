#pragma once

#include <Arduino.h>
#include <Adafruit_ILI9341.h>
#include <lvgl.h>

#include "AppTypes.h"

class TftDisplay {
 public:
  TftDisplay();

  void begin();
  void tick(const RuntimeStatus &status);
  bool ready() const;

 private:
  static constexpr int16_t DISPLAY_WIDTH = 320;
  static constexpr int16_t DISPLAY_HEIGHT = 240;
  static constexpr uint16_t DRAW_BUFFER_ROWS = 18;

  static void flushDisplay(
      lv_disp_drv_t *displayDriver,
      const lv_area_t *area,
      lv_color_t *colorMap);

  void createDashboard();
  void createStatusHeader();
  void createMetricCard(
      int16_t x,
      bool temperatureCard,
      lv_obj_t *&valueLabel,
      lv_obj_t *&unitLabel);
  void createThermometerIcon(lv_obj_t *parent, int16_t x, int16_t y);
  void createHumidityIcon(lv_obj_t *parent, int16_t x, int16_t y);
  void createWiFiIcon(lv_obj_t *parent, int16_t centerX, int16_t topY);
  void createBatteryIcon(lv_obj_t *parent, int16_t centerX, int16_t topY);
  void createOnlineStatus(lv_obj_t *parent, int16_t centerX, int16_t topY);

  void updateDashboard(const RuntimeStatus &status, bool force);
  void updateWiFiStatus(bool connected, int rssi);
  void updateBatteryStatus(bool powerConnected);
  void updateConnectionStatus(
      AppState state,
      bool wifiConnected,
      bool backendConnected);
  bool readPowerConnected() const;

  void styleBaseObject(lv_obj_t *object);
  void styleCard(lv_obj_t *card, lv_color_t background);
  void styleLabel(
      lv_obj_t *label,
      const lv_font_t *font,
      lv_color_t color,
      int16_t letterSpacing = 0);
  void styleCircle(
      lv_obj_t *object,
      lv_color_t background,
      lv_color_t border,
      int16_t borderWidth = 1);
  void styleBar(lv_obj_t *object, lv_color_t background, int16_t radius = 1);

  bool valueChanged(float current, float previous) const;

  Adafruit_ILI9341 tft_;

  lv_disp_draw_buf_t drawBufferDescriptor_;
  lv_color_t drawBuffer_[DISPLAY_WIDTH * DRAW_BUFFER_ROWS];
  lv_disp_drv_t displayDriver_;

  lv_obj_t *screen_ = nullptr;

  lv_obj_t *wifiArcs_[3] = {nullptr, nullptr, nullptr};
  lv_obj_t *wifiDot_ = nullptr;

  lv_obj_t *batteryBody_ = nullptr;
  lv_obj_t *batteryCap_ = nullptr;
  lv_obj_t *batteryFill_ = nullptr;

  lv_obj_t *onlineGlow_ = nullptr;
  lv_obj_t *onlineDot_ = nullptr;
  lv_obj_t *onlineLabel_ = nullptr;

  lv_obj_t *temperatureValueLabel_ = nullptr;
  lv_obj_t *temperatureUnitLabel_ = nullptr;
  lv_obj_t *humidityValueLabel_ = nullptr;
  lv_obj_t *humidityUnitLabel_ = nullptr;

  bool ready_ = false;
  bool firstDraw_ = true;
  AppState lastState_ = AppState::BOOTING;
  bool lastWifiConnected_ = false;
  bool lastBackendConnected_ = false;
  bool lastSensorAvailable_ = false;
  bool lastPowerConnected_ = true;
  int lastRssi_ = -127;
  float lastTemperature_ = NAN;
  float lastHumidity_ = NAN;

  unsigned long lastLvglTickAt_ = 0;
  unsigned long lastHandlerAt_ = 0;
  unsigned long lastUiRefreshAt_ = 0;
};
