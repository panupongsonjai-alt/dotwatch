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
  void createMetricSection(
      lv_obj_t *parent,
      int16_t x,
      bool temperatureSection,
      lv_obj_t *&valueLabel);
  void createThermometerIcon(lv_obj_t *parent);
  void createHumidityIcon(lv_obj_t *parent);
  void createStatusBar();
  void createStatusItem(
      lv_obj_t *parent,
      int16_t x,
      int16_t width,
      lv_obj_t *&dot,
      lv_obj_t *&label);

  void updateDashboard(const RuntimeStatus &status, bool force);
  void updateTemperature(float value, bool available);
  void updateHumidity(float value, bool available);

  void stylePanel(
      lv_obj_t *object,
      lv_color_t background,
      lv_color_t border,
      int16_t radius,
      int16_t borderWidth = 1);
  void styleLabel(
      lv_obj_t *label,
      const lv_font_t *font,
      lv_color_t color,
      int16_t letterSpacing = 0);
  void styleDot(lv_obj_t *dot, lv_color_t color);

  const char *stateText(AppState state) const;
  lv_color_t stateColor(AppState state) const;
  bool valueChanged(float current, float previous) const;

  Adafruit_ILI9341 tft_;

  lv_disp_draw_buf_t drawBufferDescriptor_;
  lv_color_t drawBuffer_[DISPLAY_WIDTH * DRAW_BUFFER_ROWS];
  lv_disp_drv_t displayDriver_;

  lv_obj_t *screen_ = nullptr;
  lv_obj_t *temperatureValueLabel_ = nullptr;
  lv_obj_t *humidityValueLabel_ = nullptr;

  lv_obj_t *stateDot_ = nullptr;
  lv_obj_t *stateLabel_ = nullptr;
  lv_obj_t *wifiDot_ = nullptr;
  lv_obj_t *wifiLabel_ = nullptr;
  lv_obj_t *cloudDot_ = nullptr;
  lv_obj_t *cloudLabel_ = nullptr;

  bool ready_ = false;
  bool firstDraw_ = true;
  AppState lastState_ = AppState::BOOTING;
  bool lastWifiConnected_ = false;
  bool lastBackendConnected_ = false;
  bool lastSensorAvailable_ = false;
  float lastTemperature_ = NAN;
  float lastHumidity_ = NAN;

  unsigned long lastLvglTickAt_ = 0;
  unsigned long lastHandlerAt_ = 0;
  unsigned long lastUiRefreshAt_ = 0;
};
