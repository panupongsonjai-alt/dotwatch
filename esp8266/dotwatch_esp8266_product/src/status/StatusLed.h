#pragma once

#include <Arduino.h>
#include "AppTypes.h"

class StatusLed {
 public:
  void begin();
  void tick(const RuntimeStatus &status);
  void set(bool on);

 private:
  void blink(unsigned long intervalMs);

  bool ledState_ = false;
  unsigned long lastToggleAt_ = 0;
};
