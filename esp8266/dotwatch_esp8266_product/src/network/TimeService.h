#pragma once

#include <Arduino.h>

class TimeService {
 public:
  bool sync();
  String isoTimestampOrEmpty() const;
  bool isSynced() const;

 private:
  bool synced_ = false;
};
