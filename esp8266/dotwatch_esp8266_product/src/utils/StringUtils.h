#pragma once

#include <Arduino.h>
#include "AppTypes.h"

namespace StringUtils {

String htmlEscape(String input);
String normalizeApiUrl(String value);
String maskSecret(const String &secret);
String uptimeText();
String appStateText(AppState state);
String signalQualityText(int rssi);
int signalQualityPercent(int rssi);
String boolText(bool value);

}  // namespace StringUtils
