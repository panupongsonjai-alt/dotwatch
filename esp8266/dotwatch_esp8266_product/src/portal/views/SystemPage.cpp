#include "portal/views/PortalView.h"

String PortalView::systemPageHtml() {
  String html;
  html += "<section id='system' class='dashboard-page' data-page-title='System Operations'><div class='card'><div class='section-head'><div><div class='kicker'>Operations</div><h2>ตรวจสอบและดูแลอุปกรณ์</h2><p class='muted'>เครื่องมือสำหรับตรวจงานติดตั้ง แก้ปัญหา และเริ่มตั้งค่าใหม่</p></div></div><div class='system-grid'>";
  html += "<div class='operation-card'><h3>Status JSON</h3><p>เปิดข้อมูลสถานะจาก Firmware สำหรับตรวจสอบ Wi-Fi, Backend, TLS และ Sensor</p><div class='button-row'><a class='btn btn-secondary' href='/json" + authQuery() + "'>ดู Status JSON</a></div></div>";
  html += "<div class='operation-card'><h3>Restart ESP8266</h3><p>Restart อุปกรณ์โดยไม่ล้าง Wi-Fi, Device Code หรือการตั้งค่าเดิม</p><form method='POST' action='/restart' class='button-row'>" + pinHiddenInput() + "<button class='btn-secondary' type='submit'>Restart ESP8266</button></form></div>";
  html += "<div class='operation-card danger-card' style='grid-column:1/-1'><h3>Factory Reset</h3><p>ล้าง Wi-Fi, Backend, Device Code/Secret, PIN และ Sensor Settings ทั้งหมด ใช้เมื่อเริ่มติดตั้งใหม่เท่านั้น</p><form method='POST' action='/reset' onsubmit='return confirm(\"ล้างการตั้งค่าทั้งหมดของ ESP8266 หรือไม่?\")' class='button-row'>" + pinHiddenInput() + "<button class='btn-danger' type='submit'>Factory Reset Config</button></form></div>";
  html += "</div></div></section>";
  return html;
}
