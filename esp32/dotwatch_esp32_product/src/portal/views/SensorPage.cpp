#include "portal/views/PortalView.h"

#include "utils/StringUtils.h"

String PortalView::sensorPageHtml() {
  String html;
  const String temperatureText = status_->sensorReadingAvailable
                                     ? String(status_->lastTemperature, 1)
                                     : String("--");
  const String humidityText = status_->sensorReadingAvailable
                                  ? String(status_->lastHumidity, 1)
                                  : String("--");

  html += "<section id='sensor' class='dashboard-page' data-page-title='Sensor Monitor'><div class='card'><div class='section-head'><div><div class='kicker'>Live Sensor</div><h2>Temperature และ Humidity</h2><p class='muted'>แสดงค่าล่าสุดจาก Sensor และตั้งรอบส่งข้อมูลเข้า dotTH</p></div><span class='badge " + String(status_->sensorReadingAvailable ? "ok'>Live" : "warn'>Waiting") + "</span></div>";
  html += "<form method='POST' action='/device-save'>" + pinHiddenInput();
  html += "<input type='hidden' name='apiUrl' value='" + StringUtils::htmlEscape(config_->apiUrl) + "'><input type='hidden' name='deviceCode' value='" + StringUtils::htmlEscape(config_->deviceCode) + "'>";
  html += "<div class='sensor-live-grid'>";
  html += "<div class='sensor-live-card'><div class='sensor-live-name'>Temperature</div><div class='sensor-live-value'><strong id='sensorTemperature'>" + temperatureText + "</strong><span>°C</span></div></div>";
  html += "<div class='sensor-live-card'><div class='sensor-live-name'>Humidity</div><div class='sensor-live-value'><strong id='sensorHumidity'>" + humidityText + "</strong><span>%</span></div></div>";
  html += "</div>";
  html += "<div id='sensorLiveStatus' class='sensor-live-status'>";
  html += status_->sensorReadingAvailable
              ? "ค่าล่าสุดจาก Sensor · อัปเดตอัตโนมัติ"
              : "กำลังรอค่าจาก Sensor";
  html += "</div>";
  html += "<div class='form-grid sensor-settings-grid'><div class='field'><label>Send Interval</label><select id='sendInterval' name='sendIntervalSec'>";
  const int intervals[] = {10, 20, 30, 60, 120};
  for (int index = 0; index < 5; index++) {
    html += "<option value='" + String(intervals[index]) + "'";
    if (config_->sendIntervalMs / 1000UL ==
        static_cast<unsigned long>(intervals[index])) {
      html += " selected";
    }
    html += ">" + String(intervals[index]) + " sec</option>";
  }
  html += "</select></div></div><div class='button-row'><button class='btn-primary' type='submit'>บันทึกรอบส่งข้อมูล</button></div></form></div></section>";
  return html;
}
