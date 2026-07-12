#pragma once

#include <Arduino.h>
#include "AppTypes.h"

class BackendClient;
class ConfigStore;
class SensorManager;
class WiFiManager;

// Presentation-only renderer for the ESP32 local portal.
// Keep HTTP routes, validation, NVS writes and device operations in PortalServer.
// Keep page markup in the page-specific files under src/portal/views.
class PortalView {
 public:
  PortalView();

  void begin(DeviceConfig &config,
             RuntimeStatus &status,
             ConfigStore &store,
             WiFiManager &wifi,
             SensorManager &sensors,
             BackendClient &backend);

  void setRequestContext(bool setupMode, const String &pinValue);

  String dashboardPage();
  String loginPage(const String &message, bool showDefaultPinHint);
  String noticePage(const String &pageTitle,
                    const String &heading,
                    const String &message,
                    const String &backHref = "",
                    const String &backLabel = "กลับหน้าหลัก");
  String sensorTestPage(const MetricSnapshot &snapshot,
                        bool readingOk,
                        const String &homeHref,
                        const String &jsonHref);
  String pageShell(const String &title, const String &body);
  String restartPage(const String &kicker,
                     const String &title,
                     const String &message,
                     const String &extraNotice = "") const;

 private:
  String overviewPageHtml() const;
  String statusCardsHtml() const;
  String wifiPageHtml();
  String devicePageHtml();
  String sensorPageHtml();
  String securityPageHtml();
  String firmwarePageHtml();
  String systemPageHtml();

  String statusBadgeClass() const;
  String lastSendLabel() const;
  String readinessLabel() const;
  String pinHiddenInput() const;
  String authQuery() const;

  DeviceConfig *config_ = nullptr;
  RuntimeStatus *status_ = nullptr;
  ConfigStore *store_ = nullptr;
  WiFiManager *wifi_ = nullptr;
  SensorManager *sensors_ = nullptr;
  BackendClient *backend_ = nullptr;

  bool setupMode_ = false;
  String pinValue_;
};
