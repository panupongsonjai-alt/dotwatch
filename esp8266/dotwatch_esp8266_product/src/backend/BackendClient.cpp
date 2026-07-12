#include "backend/BackendClient.h"

#include <ArduinoJson.h>
#include <ESP8266HTTPClient.h>
#include <ESP8266WiFi.h>
#include <WiFiClientSecureBearSSL.h>
#include <math.h>

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

  const String timestamp = timeService_->isoTimestampOrEmpty();
  if (timestamp.length() > 0) document["timestamp"] = timestamp;

  const float temperature = roundf(snapshot.temperature * 100.0f) / 100.0f;
  const float humidity = roundf(snapshot.humidity * 100.0f) / 100.0f;

  document["temperature"] = temperature;
  document["humidity"] = humidity;
  document["rssi"] = snapshot.rssi;

  JsonObject metrics = document["metrics"].to<JsonObject>();
  metrics["metric_1"] = temperature;
  metrics["metric_2"] = humidity;

  String body;
  body.reserve(256);
  serializeJson(document, body);

  if (endpoint.startsWith("https://")) {
    BearSSL::WiFiClientSecure secureClient;
    secureClient.setBufferSizes(4096, 512);

    if (hasEffectiveCa()) {
      BearSSL::X509List trustAnchor(effectiveCa());
      secureClient.setTrustAnchors(&trustAnchor);
      Serial.print("BackendClient: TLS CA source=");
      Serial.println(tlsCaSourceText());
      return performHttpPost(secureClient, endpoint, body);
    }

#if DOTWATCH_ALLOW_INSECURE_TLS_FALLBACK
    secureClient.setInsecure();
    Serial.println("BackendClient: insecure TLS fallback enabled by build flag");
    return performHttpPost(secureClient, endpoint, body);
#else
    recordFailure(0, "HTTPS Root CA is required");
    return false;
#endif
  }

  WiFiClient plainClient;
  return performHttpPost(plainClient, endpoint, body);
}

bool BackendClient::performHttpPost(WiFiClient &client,
                                    const String &endpoint,
                                    const String &body) {
  HTTPClient http;
  if (!http.begin(client, endpoint)) {
    recordFailure(0, "HTTP begin failed");
    return false;
  }

  http.setTimeout(ProductConfig::HTTP_TIMEOUT_MS);
  http.setReuse(false);
  http.addHeader("Accept", "application/json");
  http.addHeader("Content-Type", "application/json");
  http.addHeader(
      "User-Agent",
      String("dotth-esp8266-product/") + DOTWATCH_FIRMWARE_VERSION);
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
  return strlen_P(DOTWATCH_EMBEDDED_ROOT_CA) > 0;
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
