#include "backend/BackendClient.h"

#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>
#include <math.h>
#include <string.h>

#include "FirmwareVersion.h"
#include "ProductConfig.h"
#include "dotwatch_root_ca.h"
#include "network/TimeService.h"
#include "utils/StringUtils.h"

void BackendClient::begin(DeviceConfig &config,
                          RuntimeStatus &status,
                          TimeService &timeService) {
  config_ = &config;
  status_ = &status;
  timeService_ = &timeService;
}

bool BackendClient::postIngest(const MetricSnapshot &snapshot) {
  if (config_ == nullptr || status_ == nullptr || timeService_ == nullptr) {
    return false;
  }

  if (WiFi.status() != WL_CONNECTED) {
    recordFailure(0, "Wi-Fi not connected");
    return false;
  }

  if (config_->apiUrl.length() == 0 ||
      config_->deviceCode.length() == 0 ||
      config_->deviceSecret.length() == 0) {
    recordFailure(0, "Device configuration incomplete");
    return false;
  }

  const String endpoint =
      StringUtils::normalizeApiUrl(config_->apiUrl) + "/api/ingest";

  JsonDocument document;
  document["firmwareVersion"] = DOTWATCH_FIRMWARE_VERSION;
  if (WiFi.SSID().length() > 0) document["wifiSsid"] = WiFi.SSID();

  const String timestamp = timeService_->isoTimestampOrEmpty();
  if (timestamp.length() > 0) document["timestamp"] = timestamp;

  const float temperature = roundf(snapshot.temperature * 100.0f) / 100.0f;
  const float humidity = roundf(snapshot.humidity * 100.0f) / 100.0f;

  // RSSI remains operational connectivity metadata, not a configurable metric.
  document["temperature"] = temperature;
  document["humidity"] = humidity;
  document["rssi"] = snapshot.rssi;

  JsonObject metrics = document["metrics"].to<JsonObject>();
  metrics["metric_1"] = temperature;
  metrics["metric_2"] = humidity;

  String body;
  serializeJson(document, body);

  HTTPClient http;
  WiFiClient plainClient;
  WiFiClientSecure secureClient;
  bool beginOk = false;

  if (endpoint.startsWith("https://")) {
    if (hasEffectiveCa()) {
      secureClient.setCACert(effectiveCa());
      Serial.print("BackendClient: TLS CA source=");
      Serial.println(tlsCaSourceText());
    } else {
#if DOTWATCH_ALLOW_INSECURE_TLS_FALLBACK
      secureClient.setInsecure();
      Serial.println("BackendClient: insecure TLS fallback enabled by build flag");
#else
      recordFailure(0, "HTTPS Root CA is required");
      return false;
#endif
    }
    beginOk = http.begin(secureClient, endpoint);
  } else {
    beginOk = http.begin(plainClient, endpoint);
  }

  if (!beginOk) {
    recordFailure(0, "HTTP begin failed");
    return false;
  }

  http.setTimeout(ProductConfig::HTTP_TIMEOUT_MS);
  http.addHeader("Accept", "application/json");
  http.addHeader("Content-Type", "application/json");
  http.addHeader(
      "User-Agent",
      String("dotwatch-esp32-product/") + DOTWATCH_FIRMWARE_VERSION);
  http.addHeader("x-device-code", config_->deviceCode);
  http.addHeader("x-device-secret", config_->deviceSecret);

  const int httpStatus = http.POST(body);
  const String response = http.getString();
  http.end();

  Serial.print("BackendClient: POST status=");
  Serial.println(httpStatus);
  Serial.print("BackendClient: payload=");
  Serial.println(body);
  if (response.length() > 0) {
    Serial.print("BackendClient: response=");
    Serial.println(response);
  }

  if (httpStatus >= 200 && httpStatus < 300) {
    recordSuccess(httpStatus);
    return true;
  }

  recordFailure(
      httpStatus,
      response.length() > 0 ? response : String("HTTP request failed"));
  return false;
}

bool BackendClient::hasPortalCa() const {
  return config_ != nullptr && config_->tlsCaCert.length() > 0;
}

bool BackendClient::hasEmbeddedCa() const {
  return strlen(DOTWATCH_EMBEDDED_ROOT_CA) > 0;
}

bool BackendClient::hasEffectiveCa() const {
  return hasPortalCa() || hasEmbeddedCa();
}

const char *BackendClient::effectiveCa() const {
  if (hasPortalCa()) return config_->tlsCaCert.c_str();
  return DOTWATCH_EMBEDDED_ROOT_CA;
}

String BackendClient::tlsCaSourceText() const {
  if (hasPortalCa()) return "portal";
  if (hasEmbeddedCa()) return "embedded";
  return "none";
}

String BackendClient::tlsModeText() const {
  if (hasPortalCa()) return "Root CA enabled (portal)";
  if (hasEmbeddedCa()) return "Root CA enabled (embedded)";
#if DOTWATCH_ALLOW_INSECURE_TLS_FALLBACK
  return "Insecure fallback enabled";
#else
  return "TLS CA required";
#endif
}

void BackendClient::recordSuccess(int httpStatus) {
  status_->lastHttpStatus = httpStatus;
  status_->lastSendStatus = "ok";
  status_->lastSendError = "";
  status_->lastSuccessfulSendAt = millis();
  status_->totalSendOk++;
  status_->backendConnected = true;
}

void BackendClient::recordFailure(int httpStatus, const String &error) {
  status_->lastHttpStatus = httpStatus;
  status_->lastSendStatus = "error";
  status_->lastSendError = error;
  status_->totalSendFail++;
  status_->backendConnected = false;
  Serial.print("BackendClient: error=");
  Serial.println(error);
}
