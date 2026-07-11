#include "portal/views/PortalView.h"

#include "config/ConfigStore.h"
#include "utils/StringUtils.h"

String PortalView::devicePageHtml() {
  String html;
  html += "<section id='device' class='dashboard-page' data-page-title='Device Connection'><div class='card'><div class='section-head'><div><div class='kicker'>Device Settings</div><h2>เชื่อม dotTH Backend</h2><p class='muted'>แก้เฉพาะเมื่อเปลี่ยน Backend หรือผูก ESP32 กับ Device ใหม่</p></div><span id='deviceBadge' class='badge ";
  html += store_->hasDeviceCredentials(*config_) ? "ok'>Configured" : "warn'>Required";
  html += "</span></div>";
  html += "<form method='POST' action='/device-save'>" + pinHiddenInput();
  html += "<div class='form-grid'>";
  html += "<div class='field full'><label>Backend API URL</label><input id='apiUrl' name='apiUrl' value='" + StringUtils::htmlEscape(config_->apiUrl) + "' placeholder='https://dotwatch-backend.onrender.com'></div>";
  html += "<div class='field'><label>Device Code</label><input id='deviceCode' name='deviceCode' value='" + StringUtils::htmlEscape(config_->deviceCode) + "' placeholder='DW-ESP32-...'></div>";
  html += "<div class='field'><label>Device Secret</label><input type='password' name='deviceSecret' value='' placeholder='เว้นว่างเพื่อใช้ Secret เดิม'></div>";
  html += "</div><div id='deviceSecretMasked' class='help' style='margin-top:8px'>Secret ปัจจุบัน: " + StringUtils::htmlEscape(StringUtils::maskSecret(config_->deviceSecret)) + "</div>";
  html += "<div class='button-row'><button class='btn-primary' type='submit'>บันทึก Device Settings</button></div>";
  html += "</form></div></section>";
  return html;
}
