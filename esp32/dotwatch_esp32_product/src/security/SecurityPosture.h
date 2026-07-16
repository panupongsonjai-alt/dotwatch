#pragma once

#include <Arduino.h>

#ifndef DOTWATCH_EXPECT_SECURE_BOOT
#define DOTWATCH_EXPECT_SECURE_BOOT 0
#endif

#ifndef DOTWATCH_EXPECT_FLASH_ENCRYPTION
#define DOTWATCH_EXPECT_FLASH_ENCRYPTION 0
#endif

class SecurityPosture {
 public:
  static bool secureBootEnabled();
  static bool flashEncryptionEnabled();
  static uint32_t chipRevision();
  static bool meetsBuildPolicy();
  static void printBootStatus();
};
