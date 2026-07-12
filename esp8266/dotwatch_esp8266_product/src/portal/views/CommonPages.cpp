#include "portal/views/PortalView.h"

#include "utils/StringUtils.h"

String PortalView::noticePage(const String &pageTitle,
                              const String &heading,
                              const String &message,
                              const String &backHref,
                              const String &backLabel) {
  String body;
  body += "<section class='card'><h2>" +
          StringUtils::htmlEscape(heading) +
          "</h2><div class='notice'>" +
          StringUtils::htmlEscape(message) +
          "</div>";
  if (backHref.length() > 0) {
    body += "<div class='button-row'><a class='btn btn-secondary' href='" +
            StringUtils::htmlEscape(backHref) +
            "'>" + StringUtils::htmlEscape(backLabel) + "</a></div>";
  }
  body += "</section>";
  return pageShell(pageTitle, body);
}

String PortalView::sensorTestPage(const MetricSnapshot &snapshot,
                                  bool readingOk,
                                  const String &homeHref,
                                  const String &jsonHref) {
  String body;
  body += "<section class='card'><div class='kicker'>Live sensor</div><h2>ทดสอบอ่านค่า</h2><p class='muted'>ค่าที่แสดงใช้ mapping เดียวกับ payload ที่ส่งเข้า dotTH.</p>";
  if (readingOk) {
    body += "<div class='status-grid'>";
    body += "<div class='stat'><small>metric_1</small><strong>" +
            String(snapshot.temperature, 2) + " °C</strong></div>";
    body += "<div class='stat'><small>metric_2</small><strong>" +
            String(snapshot.humidity, 2) + " %</strong></div>";
    body += "<div class='stat'><small>Wi-Fi signal</small><strong>" +
            String(snapshot.rssi) + " dBm</strong></div>";
    body += "<div class='stat'><small>Source</small><strong>" +
            String(snapshot.fallbackUsed ? "Dummy fallback" : "DHT sensor") +
            "</strong></div>";
    body += "</div>";
  } else {
    body += "<div class='notice'>อ่าน DHT ไม่สำเร็จ และปิด Dummy fallback อยู่</div>";
  }
  body += "<div class='button-row'><a class='btn btn-secondary' href='" +
          StringUtils::htmlEscape(homeHref) +
          "'>กลับหน้าหลัก</a><a class='btn btn-secondary' href='" +
          StringUtils::htmlEscape(jsonHref) +
          "'>Status JSON</a></div></section>";
  return pageShell("Sensor Test", body);
}
