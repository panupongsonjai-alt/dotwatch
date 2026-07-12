#pragma once

#include <Arduino.h>
#include <DNSServer.h>
#include <ESP8266WebServer.h>
#include "AppTypes.h"
#include "portal/views/PortalView.h"

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
  void handlePortalCss();
  void handlePortalJs();
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
  String authQuery();
  void syncViewContext();
  String renderNoticePage(const String &pageTitle,
                          const String &heading,
                          const String &message,
                          const String &backHref = "",
                          const String &backLabel = "กลับหน้าหลัก");
  String renderRestartPage(const String &pageTitle,
                           const String &kicker,
                           const String &heading,
                           const String &message,
                           const String &extraNotice = "");
  String renderSensorTestPage(const MetricSnapshot &snapshot,
                              bool readingOk);
  void sendLocalAdminLogin(int statusCode = 200,
                           const String &message = "");



  ESP8266WebServer server_;
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
  PortalView view_;
};
