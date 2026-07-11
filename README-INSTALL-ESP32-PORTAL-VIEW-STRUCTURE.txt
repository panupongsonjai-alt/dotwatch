dotWatch ESP32 - Portal View Structure
======================================

วางโฟลเดอร์ esp32, docs และ scripts ทับที่:
D:\IoT Project\dotwatch

โครงสร้างใหม่:
- PortalServer.cpp / .h = HTTP routes, validation, NVS, JSON และ device operations
- src/portal/views/PortalView.cpp = layout, sidebar, header, footer, login
- src/portal/views/OverviewPage.cpp = Overview
- src/portal/views/WifiPage.cpp = Wi-Fi
- src/portal/views/DevicePage.cpp = Device
- src/portal/views/SensorPage.cpp = Sensor Monitor
- src/portal/views/SecurityPage.cpp = Security
- src/portal/views/SystemPage.cpp = System
- portal-preview/src/portal.css = CSS shared with firmware
- portal-preview/src/firmware.js = JavaScript shared with firmware

ตรวจโครงสร้างและ Build:
cd "D:\IoT Project\dotwatch"
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-esp32-portal-structure.ps1 -RepoRoot "D:\IoT Project\dotwatch"

ตรวจเฉพาะโครงสร้างโดยไม่ Build:
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-esp32-portal-structure.ps1 -RepoRoot "D:\IoT Project\dotwatch" -SkipBuild

Build โดยตรง:
cd "D:\IoT Project\dotwatch\esp32\dotwatch_esp32_product"
python -m platformio run
