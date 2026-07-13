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
  static constexpr int16_t DISPLAY_WIDTH = 240;
  static constexpr int16_t DISPLAY_HEIGHT = 320;
  static constexpr uint16_t DRAW_BUFFER_ROWS = 24;

  static void flushDisplay(
      lv_disp_drv_t *displayDriver,
      const lv_area_t *area,
      lv_color_t *colorMap);

  void createDashboard();
  void createHeader();
  void createMetricCard(
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
      lv_obj_t *&bar);
  void createFooter();
  void createStatusChip(
      int16_t x,
      int16_t y,
      int16_t width,
      lv_obj_t *&dot,
      lv_obj_t *&label);

  void updateDashboard(const RuntimeStatus &status, bool force);
  void updateMetric(
      lv_obj_t *valueLabel,
      lv_obj_t *minimumLabel,
      lv_obj_t *maximumLabel,
      lv_obj_t *bar,
      float value,
      float sessionMinimum,
      float sessionMaximum,
      bool available);
  void updateSessionExtrema(const RuntimeStatus &status);
  void resetSessionExtrema();

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

  const char *stateText(AppState state) const;
  lv_color_t stateColor(AppState state) const;
  bool valueChanged(float current, float previous) const;

  Adafruit_ILI9341 tft_;

  lv_disp_draw_buf_t drawBufferDescriptor_;
  lv_color_t drawBuffer_[DISPLAY_WIDTH * DRAW_BUFFER_ROWS];
  lv_disp_drv_t displayDriver_;

  lv_obj_t *screen_ = nullptr;
  lv_obj_t *liveChip_ = nullptr;
  lv_obj_t *liveDot_ = nullptr;
  lv_obj_t *liveLabel_ = nullptr;

  lv_obj_t *temperatureValueLabel_ = nullptr;
  lv_obj_t *temperatureMinimumLabel_ = nullptr;
  lv_obj_t *temperatureMaximumLabel_ = nullptr;
  lv_obj_t *temperatureBar_ = nullptr;

  lv_obj_t *humidityValueLabel_ = nullptr;
  lv_obj_t *humidityMinimumLabel_ = nullptr;
  lv_obj_t *humidityMaximumLabel_ = nullptr;
  lv_obj_t *humidityBar_ = nullptr;

  lv_obj_t *stateChip_ = nullptr;
  lv_obj_t *stateDot_ = nullptr;
  lv_obj_t *stateLabel_ = nullptr;
  lv_obj_t *wifiDot_ = nullptr;
  lv_obj_t *wifiLabel_ = nullptr;
  lv_obj_t *serverDot_ = nullptr;
  lv_obj_t *serverLabel_ = nullptr;
  lv_obj_t *ipLabel_ = nullptr;
  lv_obj_t *ageLabel_ = nullptr;

  bool ready_ = false;
  bool firstDraw_ = true;
  bool lastPulseOn_ = false;
  AppState lastState_ = AppState::BOOTING;
  bool lastWifiConnected_ = false;
  bool lastBackendConnected_ = false;
  bool lastSensorAvailable_ = false;
  bool lastFallbackUsed_ = false;
  float lastTemperature_ = NAN;
  float lastHumidity_ = NAN;
  float minTemperature_ = NAN;
  float maxTemperature_ = NAN;
  float minHumidity_ = NAN;
  float maxHumidity_ = NAN;

  unsigned long lastLvglTickAt_ = 0;
  unsigned long lastHandlerAt_ = 0;
  unsigned long lastUiRefreshAt_ = 0;
  unsigned long lastAgeSecond_ = 0;
};
