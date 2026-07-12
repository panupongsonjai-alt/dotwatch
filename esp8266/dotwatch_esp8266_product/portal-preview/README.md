# dotTH ESP8266 Web App

โครงสร้าง Web App สำหรับ Local Device Console ของ ESP8266 ถูกแยกให้คล้าย Dashboard เพื่อให้แก้หน้า เมนู สี และ JavaScript ได้เป็นส่วน ๆ โดยไม่ต้องแก้ไฟล์ HTML/CSS ขนาดใหญ่ไฟล์เดียว

## โครงสร้างหลัก

```text
portal-preview/
├─ src/
│  ├─ app/
│  │  ├─ index.template.html       # โครง App Shell
│  │  ├─ navigation.js             # การเปลี่ยนหน้าและ Sidebar
│  │  └─ bootstrap.js              # จุดเริ่มต้น Firmware Web App
│  ├─ components/
│  │  ├─ Sidebar.html
│  │  ├─ MobileHeader.html
│  │  ├─ Footer.html
│  │  └─ PreviewToolbar.html
│  ├─ pages/
│  │  ├─ OverviewPage.html
│  │  ├─ WifiPage.html
│  │  ├─ DevicePage.html
│  │  ├─ SensorPage.html
│  │  ├─ SecurityPage.html
│  │  └─ SystemPage.html
│  ├─ features/
│  │  ├─ wifi/wifi.js
│  │  └─ status/status.js
│  ├─ shared/dom.js
│  ├─ styles/
│  │  ├─ 01-tokens.css             # สี, Theme, Radius, Shadow
│  │  ├─ 02-base.css               # Reset และ Font
│  │  ├─ 03-layout.css             # Sidebar, Workspace, Content
│  │  ├─ 04-components.css         # Card, Button, Badge
│  │  ├─ 05-pages.css              # Overview, Wi-Fi, Sensor, System
│  │  ├─ 06-responsive.css         # Tablet และ Mobile
│  │  └─ preview.css               # เฉพาะเครื่องมือ Preview
│  ├─ preview/preview.js            # Realtime/Mock เฉพาะ Preview
│  └─ mocks/mock-device.js
├─ scripts/
│  ├─ build-web.mjs                 # ประกอบ HTML/CSS/JS
│  ├─ sync-firmware-assets.mjs      # ฝัง CSS/JS เข้า Firmware
│  └─ verify-structure.mjs          # ตรวจโครงสร้างก่อน Build
├─ generated/
│  ├─ portal.css                    # Generated ห้ามแก้ตรงนี้
│  └─ firmware.js                   # Generated ห้ามแก้ตรงนี้
└─ index.html                       # Generated สำหรับ Preview
```

## แก้ไขส่วนไหน

- เปลี่ยนสีหรือ Dark Theme: `src/styles/01-tokens.css`
- ปรับ Sidebar/Layout: `src/styles/03-layout.css` และ `src/components/Sidebar.html`
- ปรับ Card/Button/Badge: `src/styles/04-components.css`
- ปรับหน้าใดหน้าหนึ่ง: `src/pages/<PageName>.html` และ `src/styles/05-pages.css`
- ปรับการเปลี่ยนหน้า: `src/app/navigation.js`
- ปรับ Wi-Fi Scan: `src/features/wifi/wifi.js`
- ปรับ Realtime Status: `src/features/status/status.js`

อย่าแก้ `generated/*`, `index.html` หรือ `src/portal/PortalAssets.h` โดยตรง เพราะไฟล์เหล่านี้สร้างอัตโนมัติ

## เปิด Preview

```powershell
cd "D:\IoT Project\dotwatch\esp8266\dotwatch_esp8266_product\portal-preview"
$env:ESP8266_TARGET = "http://192.168.1.212"
npm run dev
```

เปิด:

```text
http://localhost:5174
```

Preview Server จะ Build ใหม่และ Reload หน้าอัตโนมัติเมื่อแก้ไฟล์ภายใน `src/`

## Build Web App

```powershell
npm run build
```

คำสั่งนี้สร้าง:

```text
index.html
generated/portal.css
generated/firmware.js
```

## Sync เข้า Firmware

```powershell
npm run sync
```

คำสั่งนี้ Build Web App และสร้างไฟล์:

```text
src/portal/PortalAssets.h
```

## ตรวจสอบทั้งหมด

```powershell
npm run check
```

การตรวจสอบครอบคลุม JavaScript syntax, ไฟล์ Page/Component, Generated assets และยืนยันว่า `PortalServer.cpp` ไม่มี HTML ของแต่ละหน้าอยู่ภายในแล้ว

## Firmware View Structure

HTML ที่ใช้งานบน ESP8266 จริงแยกอยู่ที่:

```text
src/portal/views/
├─ PortalView.cpp
├─ CommonPages.cpp
├─ OverviewPage.cpp
├─ WifiPage.cpp
├─ DevicePage.cpp
├─ SensorPage.cpp
├─ SecurityPage.cpp
└─ SystemPage.cpp
```

`PortalServer.cpp` รับผิดชอบเฉพาะ HTTP routes, validation, LittleFS และคำสั่งอุปกรณ์ ส่วน HTML อยู่ใน `PortalView` และ Page files เท่านั้น
