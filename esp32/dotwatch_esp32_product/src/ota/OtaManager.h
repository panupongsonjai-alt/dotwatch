#pragma once

#include <Arduino.h>
#include "AppTypes.h"

class BackendClient;

struct OtaRelease {
  bool valid = false;
  String modelKey;
  String channel;
  String version;
  String firmwareUrl;
  String file;
  String sha256;
  String releaseNotes;
  String releaseNotesSha256;
  String publishedAt;
  String signatureAlgorithm;
  String signatureKeyId;
  String signature;
  uint32_t buildNumber = 0;
  uint32_t size = 0;
  bool mandatory = false;
  bool autoInstall = false;
};

class OtaManager {
 public:
  void begin(DeviceConfig &config,
             RuntimeStatus &status,
             BackendClient &backend);

  void tick(bool wifiConnected, bool setupMode);
  void requestCheck();
  bool requestInstall();
  bool busy() const;
  const OtaRelease &release() const;

 private:
  bool checkForUpdate();
  bool installAvailableUpdate();
  bool reportEvent(const String &event,
                   const String &message,
                   int httpStatus = 0);
  bool beginHttp(class HTTPClient &http,
                 class WiFiClient &plainClient,
                 class WiFiClientSecure &secureClient,
                 const String &url);
  String baseUrl() const;
  String sha256Hex(const uint8_t digest[32]) const;
  String sha256TextHex(const String &value) const;
  String canonicalReleasePayload(const OtaRelease &release) const;
  bool verifyReleaseSignature(const OtaRelease &release, String &reason) const;
  bool isSafeSignedField(const String &value, size_t maxLength) const;
  void loadAntiRollbackFloor();
  void persistAntiRollbackFloor(uint32_t buildNumber);
  uint32_t minimumAcceptedBuild() const;
  void resetAvailableRelease();
  void markError(const String &message);
  void scheduleNextCheck(unsigned long delayMs);
  void confirmRunningFirmware();

  DeviceConfig *config_ = nullptr;
  RuntimeStatus *status_ = nullptr;
  BackendClient *backend_ = nullptr;

  OtaRelease release_;
  uint32_t antiRollbackFloor_ = 0;
  bool checkRequested_ = false;
  bool installRequested_ = false;
};
