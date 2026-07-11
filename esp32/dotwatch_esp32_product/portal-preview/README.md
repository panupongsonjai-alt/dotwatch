# dotWatch ESP32 Portal Live Preview

เครื่องมือ Preview หน้า Local Portal บนคอมพิวเตอร์ โดยไม่ต้อง Build และ Upload Firmware ทุกครั้ง

## คุณสมบัติ

- เปิดหน้า ESP32 Portal ที่ `http://localhost:5174`
- Reload หน้าอัตโนมัติเมื่อแก้ HTML, CSS หรือ JavaScript
- ดึง `/json` จาก ESP32 จริงทุก 2 วินาที
- Proxy `/wifi-scan` ผ่านเครื่องคอมพิวเตอร์ จึงไม่ติด Browser CORS
- มี Mock Data สำหรับปรับ UI แม้ไม่ได้ต่อบอร์ด
- ปิดการ Save, Restart และ Factory Reset ใน Preview เพื่อป้องกันการกดผิด
- Sync CSS และ Firmware JavaScript กลับเข้า `PortalAssets.h`

## เปิด Preview

จากโฟลเดอร์หลัก dotwatch:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\run-esp32-portal-preview.ps1 `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -Esp32Url "http://192.168.1.103"
```

หรือเปิดจากโฟลเดอร์นี้:

```powershell
$env:ESP32_TARGET = "http://192.168.1.103"
$env:PORT = "5174"
node .\dev-server.mjs
```

ไม่ต้อง `npm install` เพราะ Preview Server ใช้เฉพาะ Node.js built-in modules

## ไฟล์ที่ใช้ปรับ UI

- `index.html` — โครงสร้างหน้า Preview
- `src/portal.css` — CSS ที่ใช้ร่วมกับ Firmware จริง
- `src/firmware.js` — JavaScript ที่ฝังใน Firmware จริง
- `src/preview.css` — CSS ของแถบเครื่องมือ Preview เท่านั้น
- `src/preview.js` — Realtime polling และ Mock Data เฉพาะ Preview

## Sync CSS/JS เข้า Firmware

หลังแก้ `src/portal.css` หรือ `src/firmware.js`:

```powershell
cd "D:\IoT Project\dotwatch\esp32\dotwatch_esp32_product\portal-preview"
npm run sync
```

คำสั่งนี้จะสร้างไฟล์:

```text
esp32\dotwatch_esp32_product\src\portal\PortalAssets.h
```

จากนั้น Build Firmware:

```powershell
cd "D:\IoT Project\dotwatch\esp32\dotwatch_esp32_product"
python -m platformio run
```

> HTML ของ Firmware จริงถูกแยกเป็นรายหน้าใน `src/portal/views/` แล้ว ส่วน `index.html` ใช้สำหรับ Live Preview เพื่อดูภาพรวมก่อนนำโครงสร้างไปปรับในไฟล์หน้าที่ตรงกัน CSS และ Firmware JavaScript สามารถ Sync อัตโนมัติด้วย `npm run sync`


## โครงสร้างหน้า Firmware จริง

- `src/portal/views/PortalView.cpp` — Layout, Sidebar, Header, Footer และ Login
- `src/portal/views/OverviewPage.cpp` — Overview
- `src/portal/views/WifiPage.cpp` — Wi-Fi
- `src/portal/views/DevicePage.cpp` — Device
- `src/portal/views/SensorPage.cpp` — Sensor Monitor
- `src/portal/views/SecurityPage.cpp` — Security
- `src/portal/views/SystemPage.cpp` — System

`PortalServer.cpp` เหลือเฉพาะ Route, Validation, NVS, JSON และ Device operations ไม่ควรใส่ Dashboard markup กลับเข้าไฟล์นี้
