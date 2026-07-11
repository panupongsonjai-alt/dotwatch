# dotWatch ESP32 Portal View Structure

โครงสร้างนี้แยก HTTP/Device Logic ออกจากหน้าแสดงผล เพื่อให้แก้ UX/UI ได้ง่ายและลดความเสี่ยงกระทบ Wi-Fi, NVS, Backend และ Sensor logic

## โครงสร้างหลัก

```text
esp32/dotwatch_esp32_product/
├── src/portal/
│   ├── PortalServer.h
│   ├── PortalServer.cpp
│   ├── PortalAssets.h                 # generated CSS/JS; ไม่แก้โดยตรง
│   └── views/
│       ├── PortalView.h
│       ├── PortalView.cpp             # Layout, Sidebar, Header, Login, Shell
│       ├── OverviewPage.cpp           # หน้า Overview
│       ├── WifiPage.cpp               # หน้า Wi-Fi
│       ├── DevicePage.cpp             # หน้า Device
│       ├── SensorPage.cpp             # หน้า Sensor Monitor
│       ├── SecurityPage.cpp           # หน้า Security
│       └── SystemPage.cpp             # หน้า System
└── portal-preview/
    ├── index.html                     # โครงสร้าง Live Preview
    └── src/
        ├── portal.css                 # CSS ที่ใช้ร่วมกับ Firmware จริง
        ├── firmware.js                # JavaScript ที่ใช้ร่วมกับ Firmware จริง
        ├── preview.css                # ใช้เฉพาะ Preview
        └── preview.js                 # ใช้เฉพาะ Preview
```

## กติกาการแก้ไข

### แก้ Layout ส่วนกลาง

แก้ไฟล์:

```text
src/portal/views/PortalView.cpp
```

ใช้สำหรับ Sidebar, Header, Footer, Login และ Dashboard shell

### แก้หน้าเฉพาะ

- Overview: `src/portal/views/OverviewPage.cpp`
- Wi-Fi: `src/portal/views/WifiPage.cpp`
- Device: `src/portal/views/DevicePage.cpp`
- Sensor: `src/portal/views/SensorPage.cpp`
- Security: `src/portal/views/SecurityPage.cpp`
- System: `src/portal/views/SystemPage.cpp`

### แก้สี Font Spacing Responsive

แก้:

```text
portal-preview/src/portal.css
```

จากนั้น Sync เข้า Firmware:

```powershell
cd "D:\IoT Project\dotwatch\esp32\dotwatch_esp32_product\portal-preview"
npm run sync
```

### แก้ Realtime UI และ Navigation

แก้:

```text
portal-preview/src/firmware.js
```

แล้วรัน `npm run sync` เช่นเดียวกัน

### ห้ามใส่ HTML Dashboard กลับเข้า PortalServer.cpp

`PortalServer.cpp` มีหน้าที่เฉพาะ:

- Route และ HTTP request
- ตรวจ Local Admin PIN
- Validate input
- บันทึก NVS
- Restart / Reset
- ส่ง JSON และ Wi-Fi scan

หน้าแสดงผลให้แก้ใน `src/portal/views` เท่านั้น

## เปิด Live Preview

```powershell
cd "D:\IoT Project\dotwatch"

powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\run-esp32-portal-preview.ps1 `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -Esp32Url "http://192.168.1.212"
```

เปิด `http://localhost:5174`

## ตรวจโครงสร้างและ Build

```powershell
cd "D:\IoT Project\dotwatch"

powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\verify-esp32-portal-structure.ps1 `
  -RepoRoot "D:\IoT Project\dotwatch"
```
