#pragma once

#include <Arduino.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>

#include "AppTypes.h"

class TftDisplay {
 public:
  TftDisplay();

  void begin();
  void tick(const RuntimeStatus &status);
  bool ready() const;

 private:
  void drawFrame();
  void drawHeader();
  void drawHeaderStatus(const RuntimeStatus &status, bool pulseOn);
  void drawFooter(const RuntimeStatus &status);
  void drawStatusChip(
      int16_t x,
      int16_t y,
      int16_t width,
      const char *text,
      uint16_t indicatorColor,
      uint16_t textColor);
  void drawMetricCard(
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
      bool temperatureCard);
  void drawMetricIcon(
      int16_t centerX,
      int16_t centerY,
      uint16_t accent,
      bool temperatureCard);
  void drawGauge(
      int16_t x,
      int16_t y,
      int16_t width,
      float value,
      float minimum,
      float maximum,
      uint16_t accent,
      bool available);
  void drawText(
      const char *text,
      int16_t x,
      int16_t baselineY,
      const GFXfont *font,
      uint16_t color);
  void drawCenteredText(
      const char *text,
      int16_t centerX,
      int16_t baselineY,
      const GFXfont *font,
      uint16_t color);
  void drawRightAlignedText(
      const char *text,
      int16_t rightX,
      int16_t baselineY,
      const GFXfont *font,
      uint16_t color);
  void updateSessionExtrema(const RuntimeStatus &status);
  void resetSessionExtrema();
  const char *stateText(AppState state) const;
  uint16_t stateColor(AppState state) const;
  bool valueChanged(float current, float previous) const;
  bool pulseChanged(bool pulseOn) const;

  Adafruit_ILI9341 tft_;
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
  unsigned long lastRefreshAt_ = 0;
  unsigned long lastFooterSecond_ = 0;
};
