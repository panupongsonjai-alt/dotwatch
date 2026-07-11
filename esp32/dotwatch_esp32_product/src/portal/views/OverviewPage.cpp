#include "portal/views/PortalView.h"

#include "backend/BackendClient.h"
#include "network/WiFiManager.h"
#include "utils/StringUtils.h"

String PortalView::statusBadgeClass() const {
  if (status_->state == AppState::ONLINE) return "ok";
  if (status_->state == AppState::DEGRADED ||
      status_->state == AppState::RECOVERY) {
    return "bad";
  }
  return "warn";
}

String PortalView::lastSendLabel() const {
  if (status_->lastSendStatus == "ok") return "ส่งสำเร็จ";
  if (status_->lastSendStatus == "error") return "ส่งไม่สำเร็จ";
  return "ยังไม่เคยส่ง";
}

String PortalView::statusCardsHtml() const {
  const int rssi = wifi_->currentRssi();
  String html;
  html += "<div class='status-grid'>";
  html += "<div class='stat'><small>Wi-Fi</small><strong id='statusWifi'>" + StringUtils::htmlEscape(wifi_->currentSsid().length() ? wifi_->currentSsid() : String("ยังไม่เชื่อมต่อ")) + "</strong></div>";
  html += "<div class='stat'><small>IP Address</small><strong id='statusIp'>" + StringUtils::htmlEscape(wifi_->currentIp()) + "</strong></div>";
  html += "<div class='stat'><small>Signal</small><strong id='statusSignal'>" + String(wifi_->isConnected() ? StringUtils::signalQualityText(rssi) + " · " + String(rssi) + " dBm" : String("Setup Mode")) + "</strong></div>";
  html += "<div class='stat'><small>Device Code</small><strong id='statusDeviceCode'>" + StringUtils::htmlEscape(config_->deviceCode.length() ? config_->deviceCode : String("ยังไม่ได้ตั้ง")) + "</strong></div>";
  html += "<div class='stat'><small>Backend</small><strong id='statusBackend'>" + StringUtils::htmlEscape(lastSendLabel()) + "</strong></div>";
  html += "<div class='stat'><small>Last Send</small><strong id='statusLastSend'>HTTP " + String(status_->lastHttpStatus) + "</strong></div>";
  html += "<div class='stat'><small>Uptime</small><strong id='statusUptime'>" + StringUtils::uptimeText() + "</strong></div>";
  html += "</div>";

  if (status_->lastSendError.length() > 0) {
    html += "<div class='notice' style='margin-top:12px'><strong>ปัญหาล่าสุด:</strong> " + StringUtils::htmlEscape(status_->lastSendError) + "</div>";
  }
  return html;
}

String PortalView::overviewPageHtml() const {
  String html;
  html += "<section id='overview' class='dashboard-page is-active' data-page-title='ESP32 Overview'>";
  html += "<div class='card overview-hero'>";
  html += "<div class='hero'><div><div class='kicker'>Device Overview</div>";
  html += "<h1>ESP32 พร้อมสำหรับ dotWatch</h1>";
  html += "<p class='muted'>ดูสถานะ Wi-Fi, Backend, Sensor และความพร้อมของอุปกรณ์จากหน้าเดียว</p></div>";
  html += "<span id='appStateBadge' class='badge " + statusBadgeClass() + "'>";
  html += StringUtils::appStateText(status_->state);
  html += "</span></div>";
  html += statusCardsHtml();
  html += "</div>";

  html += "<div class='overview-grid'>";
  const bool backendOk = status_->lastHttpStatus >= 200 &&
                         status_->lastHttpStatus < 300;
  html += "<div class='card'><div class='card-head'><div><div class='kicker'>Health Check</div><h2>สถานะระบบหลัก</h2><p class='muted'>รายละเอียดอ้างอิงจากสถานะเดิมของ Firmware</p></div></div><div class='health-list'>";
  html += "<div class='health-row'><i class='health-dot " + String(wifi_->isConnected() ? "ok" : "bad") + "'></i><strong>Wi-Fi Connection</strong><span id='healthWifi'>" + String(wifi_->isConnected() ? "Connected" : "Disconnected") + "</span></div>";
  html += "<div class='health-row'><i class='health-dot " + String(backendOk ? "ok" : "bad") + "'></i><strong>Backend Connection</strong><span id='healthBackend'>" + StringUtils::htmlEscape(lastSendLabel()) + "</span></div>";
  html += "<div class='health-row'><i class='health-dot " + String(status_->sensorReadingAvailable ? "ok" : "warn") + "'></i><strong>Sensor Reading</strong><span id='healthSensor'>" + String(status_->sensorReadingAvailable ? "Available" : "Waiting") + "</span></div>";
  html += "<div class='health-row'><i class='health-dot " + String(backend_->hasEffectiveCa() ? "ok" : "warn") + "'></i><strong>TLS Certificate</strong><span id='healthTls'>" + StringUtils::htmlEscape(backend_->tlsCaSourceText()) + "</span></div>";
  html += "</div></div></div></section>";
  return html;
}
