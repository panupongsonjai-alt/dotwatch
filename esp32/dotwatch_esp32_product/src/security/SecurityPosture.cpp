#include "security/SecurityPosture.h"

#include <esp_chip_info.h>
#include <esp_flash_encrypt.h>
#include <esp_secure_boot.h>

bool SecurityPosture::secureBootEnabled() {
  return esp_secure_boot_enabled();
}

bool SecurityPosture::flashEncryptionEnabled() {
  return esp_flash_encryption_enabled();
}

uint32_t SecurityPosture::chipRevision() {
  esp_chip_info_t info{};
  esp_chip_info(&info);
  return info.revision;
}

bool SecurityPosture::meetsBuildPolicy() {
  if (DOTWATCH_EXPECT_SECURE_BOOT && !secureBootEnabled()) return false;
  if (DOTWATCH_EXPECT_FLASH_ENCRYPTION && !flashEncryptionEnabled()) return false;
  return true;
}

void SecurityPosture::printBootStatus() {
  Serial.print("Security: chip revision=");
  Serial.println(chipRevision());
  Serial.print("Security: secure boot=");
  Serial.println(secureBootEnabled() ? "enabled" : "disabled");
  Serial.print("Security: flash encryption=");
  Serial.println(flashEncryptionEnabled() ? "enabled" : "disabled");
  Serial.print("Security: build policy=");
  Serial.println(meetsBuildPolicy() ? "satisfied" : "FAILED");
}
