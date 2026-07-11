#pragma once

#include <Arduino.h>
#include <DNSServer.h>
#include <WebServer.h>
#include "AppTypes.h"

class BackendClient;
class ConfigStore;
class SensorManager;
class WiFiManager;

class PortalServer {
 public:
  PortalServer();

  void begin(DeviceConfig &config,
             RuntimeStatus &status,
             ConfigStore &store,
             WiFiManager &wifi,
             SensorManager &sensors,
             BackendClient &backend);

  void startSetupPortal();
  void startLocalAdmin();
  void loop();
  bool isSetupMode() const;

 private:
  void registerRoutes();

  void handleRoot();
  void handleWiFiScan();
  void handleWiFiSave();
  void handleWiFiClear();
  void handleDeviceSave();
  void handleJson();
  void handleTest();
  void handleReset();
  void handleRestart();
  void handleCaptive();
  void handleNotFound();

  bool isAdminAuthorized();
  bool requireAdmin();
  String defaultAdminPin() const;
  String effectiveAdminPin() const;
  String currentPinValue();
  String pinHiddenInput();
  String authQuery();
  void sendLocalAdminLogin(int statusCode = 200,
                           const String &message = "");

  String pageShell(const String &title, const String &body);
  String statusBadgeClass() const;
  String lastSendLabel() const;
  String readinessLabel() const;
  String statusCardsHtml() const;
  String wifiSectionHtml();
  String deviceSectionHtml();
  String advancedSectionsHtml();
  String operationsHtml();
  String restartPage(const String &kicker,
                     const String &title,
                     const String &message,
                     const String &extraNotice = "") const;

  WebServer server_;
  DNSServer dnsServer_;
  bool routesRegistered_ = false;
  bool serverStarted_ = false;
  bool setupMode_ = false;

  DeviceConfig *config_ = nullptr;
  RuntimeStatus *status_ = nullptr;
  ConfigStore *store_ = nullptr;
  WiFiManager *wifi_ = nullptr;
  SensorManager *sensors_ = nullptr;
  BackendClient *backend_ = nullptr;
};
