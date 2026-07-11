#include "portal/views/PortalView.h"

#include "config/ConfigStore.h"
#include "network/WiFiManager.h"
#include "utils/StringUtils.h"

String PortalView::wifiPageHtml() {
  String html;
  html.reserve(7200);

  html += "<section id='wifi' class='dashboard-page' data-page-title='Wi-Fi Setup'><div class='card'><div class='section-head'><div><div class='kicker'>Network Setup</div><h2>เปลี่ยน Wi-Fi อย่างปลอดภัย</h2><p class='muted'>ระบบเก็บค่าใหม่ไว้ทดสอบก่อนบันทึกจริง หากเชื่อมไม่สำเร็จจะย้อนกลับ Wi-Fi เดิม</p></div><span id='wifiBadge' class='badge ";
  html += wifi_->isConnected() ? "ok'>Connected" : "warn'>Setup";
  html += "</span></div>";

  html += "<div class='current-wifi'>";
  html += "<div><small>Wi-Fi ปัจจุบัน</small><strong id='currentWifi'>" + StringUtils::htmlEscape(wifi_->currentSsid().length() ? wifi_->currentSsid() : String("ยังไม่ได้ตั้ง")) + "</strong></div>";
  html += "<div><small>IP Address</small><strong id='currentIp'>" + StringUtils::htmlEscape(wifi_->currentIp()) + "</strong></div>";
  html += "<div><small>Remembered</small><strong id='rememberedWifi'>" + String(store_->knownWiFiProfileCount(*config_)) + " networks</strong></div>";
  html += "</div>";

  html += "<div class='steps'>";
  html += "<div class='step'><b>1</b><div><strong>สแกนและเลือก</strong><span>เลือกชื่อ Wi-Fi จากรายการ</span></div></div>";
  html += "<div class='step'><b>2</b><div><strong>ใส่รหัสผ่าน</strong><span>เว้นว่างสำหรับ Open Wi-Fi</span></div></div>";
  html += "<div class='step'><b>3</b><div><strong>Restart และ Rollback</strong><span>Wi-Fi เดิมไม่หายเมื่อรหัสผิด</span></div></div>";
  html += "</div>";

  if (setupMode_) {
    html += "<div class='notice info' style='margin-bottom:12px'>Setup AP: <strong>" + StringUtils::htmlEscape(wifi_->setupSsid()) + "</strong> · Password: <strong>" + StringUtils::htmlEscape(wifi_->setupPassword()) + "</strong> · URL: http://192.168.4.1/</div>";
  }

  html += "<div class='wifi-layout'><div class='panel'>";
  html += "<form method='POST' action='/wifi-save' onsubmit='return confirmWifiChange()'>" + pinHiddenInput();
  html += "<div class='form-grid'>";
  html += "<div class='field full'><label>ชื่อ Wi-Fi (SSID)</label><input id='wifiSsid' name='wifiSsid' maxlength='32' autocomplete='off' value='" + StringUtils::htmlEscape(config_->wifiSsid) + "' placeholder='เลือกจากรายการ หรือพิมพ์เอง'></div>";
  html += "<div class='field full'><label>รหัสผ่าน Wi-Fi</label><div class='password-row'><input id='wifiPassword' type='password' name='wifiPassword' maxlength='63' autocomplete='new-password' placeholder='เว้นว่างไว้เมื่อใช้ Wi-Fi เดิม'><button id='passwordToggle' class='btn-secondary' type='button' onclick='togglePassword()'>แสดง</button></div><div id='selectedWifi' class='help'>เลือก Wi-Fi จากรายการเพื่อกรอกชื่ออัตโนมัติ</div></div>";
  html += "</div><label class='check'><input type='checkbox' name='keepWifiBackups' value='true' checked><span>เก็บ Wi-Fi เดิมเป็นเครือข่ายสำรอง</span></label>";
  html += "<button class='btn-primary' type='submit' style='width:100%'>บันทึกและทดสอบหลัง Restart</button></form>";
  html += "<form method='POST' action='/wifi-clear' onsubmit='return confirm(\"ล้าง Wi-Fi ที่จำไว้ทั้งหมดหรือไม่?\")' style='margin-top:9px'>" + pinHiddenInput() + "<button class='btn-danger' type='submit' style='width:100%'>ล้างเฉพาะ Wi-Fi</button></form>";
  html += "</div>";

  html += "<div class='panel'><div class='scan-head'><div><h3>Wi-Fi ใกล้เคียง</h3><div class='help'>รายชื่อที่ ESP32 มองเห็นจริง</div></div><button id='scanButton' class='btn-secondary' type='button' onclick='scanWifi()'>สแกนใหม่</button></div><div id='scanStatus' class='scan-status'>กำลังเตรียมสแกน...</div><div id='networkList' class='network-list'><div class='empty'>กำลังโหลดรายชื่อ Wi-Fi</div></div></div></div>";
  html += "</div></section>";
  return html;
}
