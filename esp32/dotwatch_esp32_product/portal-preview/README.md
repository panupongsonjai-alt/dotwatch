# dotTH ESP32 Portal Live Preview

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

> การเปลี่ยนโครงสร้าง HTML ใน `index.html` ยังเป็น Preview เท่านั้น เพราะ HTML จริงถูกประกอบใน `PortalServer.cpp` ส่วนการแก้ CSS และ Firmware JS สามารถ Sync อัตโนมัติได้ทันที
