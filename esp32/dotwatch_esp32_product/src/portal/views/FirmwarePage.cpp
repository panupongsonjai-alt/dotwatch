#include "portal/views/PortalView.h"

#include "FirmwareVersion.h"
#include "ProductConfig.h"
#include "utils/StringUtils.h"

String PortalView::firmwarePageHtml() {
  const String otaUrl = config_->otaBaseUrl.length() > 0
                            ? config_->otaBaseUrl
                            : config_->apiUrl;
  const unsigned long intervalMinutes = config_->otaCheckIntervalMs / 60000UL;
  const String availableVersion = status_->otaAvailableVersion.length() > 0
                                      ? status_->otaAvailableVersion
                                      : String("—");
  const String availableBuild = status_->otaAvailableBuild > 0
                                    ? String("Build ") + String(status_->otaAvailableBuild)
                                    : String("ยังไม่พบอัปเดต");
  const String releaseNotes = status_->otaReleaseNotes.length() > 0
                                  ? status_->otaReleaseNotes
                                  : String("Release notes จะแสดงหลังตรวจพบ Firmware ใหม่");

  String html;
  html += "<section id='firmware' class='dashboard-page' data-page-title='Firmware Update'>";
  html += "<div class='card'><div class='section-head'><div><div class='kicker'>Internet OTA</div><h2>Firmware Update</h2><p class='muted'>ตรวจสอบ ดาวน์โหลด ยืนยัน SHA-256 และติดตั้ง Firmware ใหม่โดยไม่ต้องต่อสาย USB</p></div><span id='otaStateBadge' class='badge warn'>" + StringUtils::htmlEscape(status_->otaState) + "</span></div>";

  html += "<div class='ota-summary-grid'>";
  html += "<div class='stat'><small>Current Version</small><strong id='otaCurrentVersion'>" + String(DOTWATCH_FIRMWARE_VERSION) + "</strong><span class='help'>Build " + String(DOTWATCH_FIRMWARE_BUILD) + "</span></div>";
  html += "<div class='stat'><small>Available Version</small><strong id='otaAvailableVersion'>" + StringUtils::htmlEscape(availableVersion) + "</strong><span id='otaAvailableBuild' class='help'>" + StringUtils::htmlEscape(availableBuild) + "</span></div>";
  html += "<div class='stat'><small>Channel</small><strong id='otaChannelValue'>" + StringUtils::htmlEscape(config_->otaChannel) + "</strong><span class='help'>ตรวจทุก " + String(intervalMinutes) + " นาที</span></div>";
  html += "<div class='stat'><small>Update Policy</small><strong id='otaPolicyValue'>" + String(config_->otaAutoInstall ? "Auto install" : "Manual install") + "</strong><span class='help'>" + String(config_->otaEnabled ? "Internet OTA enabled" : "Internet OTA disabled") + "</span></div>";
  html += "</div>";

  html += "<div class='ota-progress-card'><div class='ota-progress-head'><div><strong id='otaStatusMessage'>" + StringUtils::htmlEscape(status_->otaMessage) + "</strong><span id='otaByteProgress'>" + String(status_->otaDownloadedBytes) + " / " + String(status_->otaTotalBytes) + " bytes</span></div><b id='otaProgressValue'>" + String(status_->otaProgressPercent) + "%</b></div><div class='ota-progress-track'><i id='otaProgressBar' style='width:" + String(status_->otaProgressPercent) + "%'></i></div><p id='otaReleaseNotes' class='help'>" + StringUtils::htmlEscape(releaseNotes) + "</p></div>";

  html += "<div class='button-row'><button id='otaCheckButton' class='btn-secondary' type='button'>Check for Update</button><button id='otaInstallButton' class='btn-primary' type='button'" + String(status_->otaUpdateAvailable ? "" : " disabled") + ">Install Update</button></div>";
  html += "<div id='otaActionMessage' class='notice info' style='display:none;margin-top:12px'></div>";
  html += "</div>";

  html += "<div class='card'><div class='section-head'><div><div class='kicker'>OTA Settings</div><h2>แหล่งอัปเดตและนโยบาย</h2><p class='muted'>เว้น OTA Base URL ว่างเพื่อใช้ Backend API URL เดียวกับการส่งค่า Sensor</p></div></div>";
  html += "<form method='POST' action='/ota-save' class='form-grid'>" + pinHiddenInput();
  html += "<div class='field full'><label>OTA Base URL</label><input name='otaBaseUrl' type='url' value='" + StringUtils::htmlEscape(config_->otaBaseUrl) + "' placeholder='" + StringUtils::htmlEscape(config_->apiUrl) + "'><div class='help'>Effective URL: " + StringUtils::htmlEscape(otaUrl) + "</div></div>";
  html += "<div class='field'><label>Update Channel</label><select name='otaChannel'><option value='stable'" + String(config_->otaChannel == "stable" ? " selected" : "") + ">Stable</option><option value='beta'" + String(config_->otaChannel == "beta" ? " selected" : "") + ">Beta</option></select></div>";
  html += "<div class='field'><label>Check Interval</label><select name='otaCheckIntervalMinutes'>";
  const unsigned long options[] = {15, 30, 60, 180, 360, 720, 1440};
  for (const unsigned long option : options) {
    html += "<option value='" + String(option) + "'" + String(intervalMinutes == option ? " selected" : "") + ">" + String(option) + " min</option>";
  }
  html += "</select></div>";
  html += "<div class='field full'><label class='check'><input type='checkbox' name='otaEnabled' value='true'" + String(config_->otaEnabled ? " checked" : "") + "><span><strong>Enable Internet OTA</strong><small>อนุญาตให้อุปกรณ์ตรวจสอบ Firmware ผ่าน HTTPS</small></span></label><label class='check'><input type='checkbox' name='otaAutoInstall' value='true'" + String(config_->otaAutoInstall ? " checked" : "") + "><span><strong>Auto Install</strong><small>ติดตั้งอัตโนมัติเฉพาะ Release ที่ Server อนุญาต autoInstall หรือ mandatory</small></span></label></div>";
  html += "<div class='field full'><div class='notice info'>ครั้งแรกต้อง Upload Firmware ชุด OTA นี้ผ่านสาย USB เพื่อเปลี่ยน Partition Table หลังจากนั้นจึงอัปเดตผ่านอินเทอร์เน็ตได้</div></div>";
  html += "<div class='field full'><div class='button-row'><button class='btn-primary' type='submit'>Save OTA Settings</button></div></div></form></div>";
  html += "</section>";
  return html;
}
