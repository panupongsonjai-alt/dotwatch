#include "portal/views/PortalView.h"

#include "FirmwareVersion.h"
#include "backend/BackendClient.h"
#include "config/ConfigStore.h"
#include "network/WiFiManager.h"
#include "portal/PortalAssets.h"
#include "sensors/SensorManager.h"
#include "utils/StringUtils.h"

PortalView::PortalView() = default;

void PortalView::begin(DeviceConfig &config,
                       RuntimeStatus &status,
                       ConfigStore &store,
                       WiFiManager &wifi,
                       SensorManager &sensors,
                       BackendClient &backend) {
  config_ = &config;
  status_ = &status;
  store_ = &store;
  wifi_ = &wifi;
  sensors_ = &sensors;
  backend_ = &backend;
}

void PortalView::setRequestContext(bool setupMode,
                                   const String &pinValue) {
  setupMode_ = setupMode;
  pinValue_ = pinValue;
}

String PortalView::dashboardPage() {
  String body;
  body.reserve(30000);
  body += overviewPageHtml();
  body += wifiPageHtml();
  body += devicePageHtml();
  body += sensorPageHtml();
  body += securityPageHtml();
  body += systemPageHtml();
  return pageShell("dotTH ESP32", body);
}

String PortalView::loginPage(const String &message,
                             bool showDefaultPinHint) {
  String body;
  body += "<section class='card login-card'><div class='login-logo'>⚙</div><div class='kicker'>Protected setup</div><h1>เข้าสู่ ESP32 Device Console</h1>";
  body += "<p class='muted'>กรอก Local Admin PIN เพื่อเปิด Dashboard, เปลี่ยน Wi-Fi และตรวจสถานะอุปกรณ์</p>";

  if (showDefaultPinHint) {
    body += "<div class='notice info' style='margin-top:12px'>ค่าเริ่มต้นคือ admin จนกว่าจะตั้ง Custom PIN</div>";
  }
  if (message.length() > 0) {
    body += "<div class='notice' style='margin-top:10px'>" +
            StringUtils::htmlEscape(message) + "</div>";
  }

  body += "<form method='GET' action='/' style='margin-top:16px'><div class='field'><label>Local Admin PIN</label><input type='password' name='pin' inputmode='text' autocomplete='current-password' autocapitalize='none' spellcheck='false' placeholder='admin'></div><div class='button-row'><button class='btn-primary' type='submit'>เปิด ESP32 Dashboard</button><a class='btn btn-secondary' href='/json'>ดู Public Status</a></div></form></section>";

  const bool previousSetupMode = setupMode_;
  const String previousPin = pinValue_;
  setupMode_ = false;
  pinValue_ = "";
  String html = pageShell("ESP32 Local Admin", body);
  setupMode_ = previousSetupMode;
  pinValue_ = previousPin;
  return html;
}

String PortalView::pageShell(const String &title,
                             const String &body) {
  String html;
  html.reserve(body.length() + 22000);
  html += "<!doctype html><html lang='th'><head><meta charset='utf-8'>";
  html += "<meta name='viewport' content='width=device-width,initial-scale=1,viewport-fit=cover'>";
  html += "<meta name='theme-color' content='#020617'>";
  html += "<title>" + StringUtils::htmlEscape(title) + "</title><style>";
  html += DOTWATCH_PORTAL_CSS;
  html += "</style></head><body>";

  if (title == "ESP32 Local Admin") {
    html += "<div class='login-shell'><aside class='login-brand-panel'><div class='login-brand'><div class='brand-mark'>dT</div><div><h1>dotTH</h1></div></div><div class='login-brand-copy'><div class='kicker'>Local Device Management</div><h2>จัดการ ESP32 ในรูปแบบเดียวกับ Dashboard</h2><p>ใช้รายละเอียดและระบบเดิมของ Firmware แต่จัดโครงสร้างใหม่ให้อ่านง่าย แยกเมนูชัดเจน และเหมาะกับการใช้งานจริง</p></div><div class='help'>";
    html += DOTWATCH_MODEL_NAME;
    html += "</div></aside><main class='login-main'>";
    html += body;
    html += "</main></div></body></html>";
    return html;
  }

  html += "<div class='portal-layout'><aside class='portal-sidebar'>";
  html += "<div class='portal-brand'><div class='brand-mark'>dT</div><div class='brand-copy'><strong>dotTH</strong>";
  html += "</div></div>";
  html += "<div class='portal-nav-label'>Device Console</div><nav class='portal-nav'>";
  html += "<a class='portal-nav-item is-active' href='#overview' data-page-target='overview' data-page-title='Overview'><span class='nav-icon'>▦</span><span>Overview</span></a>";
  html += "<a class='portal-nav-item' href='#wifi' data-page-target='wifi' data-page-title='Wi-Fi Setup' data-page-subtitle='เปลี่ยนเครือข่ายด้วยระบบทดสอบและ Rollback'><span class='nav-icon'>⌁</span><span>Wi-Fi</span></a>";
  html += "<a class='portal-nav-item' href='#device' data-page-target='device' data-page-title='Device Connection' data-page-subtitle='เชื่อม Device Code และ Backend ของ dotTH'><span class='nav-icon'>◇</span><span>Device</span></a>";
  html += "<a class='portal-nav-item' href='#sensor' data-page-target='sensor' data-page-title='Sensor Monitor' data-page-subtitle='ดูค่าปัจจุบันและกำหนดรอบส่งข้อมูล'><span class='nav-icon'>∿</span><span>Sensor</span></a>";
  html += "<a class='portal-nav-item' href='#security' data-page-target='security' data-page-title='Security' data-page-subtitle='จัดการ Local Admin PIN และ Root CA'><span class='nav-icon'>◆</span><span>Security</span></a>";
  html += "<a class='portal-nav-item' href='#system' data-page-target='system' data-page-title='System Operations' data-page-subtitle='ดู JSON, Restart และ Factory Reset'><span class='nav-icon'>⚙</span><span>System</span></a>";
  html += "</nav><div class='portal-sidebar-status'><div class='sidebar-status-head'><small>Device Status</small><i id='sidebarStateDot' class='sidebar-status-dot " + statusBadgeClass() + "'></i></div><strong id='sidebarDeviceCode'>";
  html += StringUtils::htmlEscape(config_->deviceCode.length()
                                      ? config_->deviceCode
                                      : String("ยังไม่ได้ตั้ง Device"));
  html += "</strong><span id='sidebarDeviceIp'>" +
          StringUtils::htmlEscape(wifi_->currentIp()) +
          "</span></div></aside>";
  html += "<button id='portalOverlay' class='portal-overlay' type='button' aria-label='ปิดเมนู'></button>";

  html += "<div class='portal-workspace'><header class='portal-header'><button id='portalMenuButton' class='portal-menu-button' type='button' aria-label='เปิดเมนู'>☰</button></header><main class='portal-content'>";
  html += body;
  html += "</main><footer class='portal-footer'>";
  html += DOTWATCH_MODEL_NAME;
  html += " · Modular Product Core · Hold BOOT 6 seconds for Factory Reset</footer></div></div><script>";
  html += DOTWATCH_PORTAL_JS;
  html += "</script></body></html>";
  return html;
}

String PortalView::pinHiddenInput() const {
  if (setupMode_ || pinValue_.length() == 0) return "";
  return "<input type='hidden' name='pin' value='" + pinValue_ + "'>";
}

String PortalView::authQuery() const {
  if (setupMode_ || pinValue_.length() == 0) return "";
  return "?pin=" + pinValue_;
}

String PortalView::restartPage(const String &kicker,
                               const String &title,
                               const String &message,
                               const String &extraNotice) const {
  String html;
  html += "<section class='card restart'><div class='restart-icon'>✓</div><div class='kicker'>" + StringUtils::htmlEscape(kicker) + "</div><h1>" + StringUtils::htmlEscape(title) + "</h1><p class='muted'>" + StringUtils::htmlEscape(message) + "</p>";
  if (extraNotice.length() > 0) {
    html += "<div class='notice info'>" + extraNotice + "</div>";
  }
  html += "<div class='restart-steps'><div class='restart-step'><b>1</b><div><strong>รอ 15–30 วินาที</strong><div class='help'>ไฟสถานะจะกระพริบระหว่างเชื่อมต่อ</div></div></div><div class='restart-step'><b>2</b><div><strong>เชื่อมโทรศัพท์หรือคอมกลับเข้า Wi-Fi</strong><div class='help'>หาก Wi-Fi ใหม่ล้มเหลว ระบบจะย้อนกลับเครือข่ายเดิม</div></div></div><div class='restart-step'><b>3</b><div><strong>เปิด Dashboard หรือ Local IP</strong><div class='help'>ตรวจว่าอุปกรณ์ Online และเริ่มส่งข้อมูล</div></div></div></div></section>";
  return html;
}
