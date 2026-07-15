#include "portal/views/PortalView.h"

#include "backend/BackendClient.h"
#include "utils/StringUtils.h"

String PortalView::securityPageHtml() {
  String html;
  html += "<section id='security' class='dashboard-page' data-page-title='Security'><div class='card'><div class='section-head'><div><div class='kicker'>Local Security</div><h2>Admin PIN และ Root CA</h2><p class='muted'>รายละเอียดเดิมถูกจัดใหม่ให้แยกจากการตั้งค่าทั่วไปและอ่านง่ายขึ้น</p></div></div>";
  html += "<form method='POST' action='/device-save'>" + pinHiddenInput();
  html += "<input type='hidden' name='apiUrl' value='" + StringUtils::htmlEscape(config_->apiUrl) + "'><input type='hidden' name='deviceCode' value='" + StringUtils::htmlEscape(config_->deviceCode) + "'>";
  html += "<div class='security-grid'><div class='panel'><div class='field'><label>Local Admin PIN ใหม่</label><input type='password' name='adminPin' value='' placeholder='เว้นว่างเพื่อใช้ PIN เดิม'><div class='help'>ใช้สำหรับเปิด Local Device Console เมื่อ ESP8266 เชื่อม Wi-Fi แล้ว · ขั้นต่ำ 8 ตัวอักษร · ไม่มีค่าเริ่มต้นร่วมกันทุกเครื่อง</div></div></div>";
  html += "<div class='panel'><div class='field'><label>Root CA Certificate</label><textarea name='tlsCaCert' placeholder='เว้นว่างเพื่อใช้ค่าเดิม/Embedded CA · พิมพ์ CLEAR เพื่อลบ Portal CA'></textarea><div id='tlsInfo' class='help'>TLS: " + StringUtils::htmlEscape(backend_->tlsModeText()) + " · Source: " + StringUtils::htmlEscape(backend_->tlsCaSourceText()) + "</div></div></div></div>";
  html += "<div class='button-row'><button class='btn-primary' type='submit'>บันทึก Security Settings</button></div></form></div></section>";
  return html;
}
