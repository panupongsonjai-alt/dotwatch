# Phase 10B — ESP32 HTTPS Root CA + Ingest E2E

เป้าหมายของ Phase 10B คือให้ ESP32 ส่งข้อมูลเข้า `https://dotwatch-backend.onrender.com/api/ingest` ได้โดยยังคงเปิด TLS verification ตาม production policy

จาก Phase 10A Wi‑Fi memory ผ่านแล้ว ถ้า Serial monitor ยังขึ้น:

```text
POST skipped: HTTPS Root CA is required in production firmware
SERVER_ERROR
```

แปลว่า Wi‑Fi/DHT/loop ทำงานแล้ว แต่ firmware ยังไม่มี Root CA สำหรับตรวจ HTTPS certificate

## สิ่งที่เพิ่ม

- เพิ่มไฟล์ `dotwatch_root_ca.h` สำหรับ embedded Root CA
- Portal-saved Root CA ยัง override embedded Root CA ได้
- JSON status เพิ่ม `tlsCaCertSource`, `tlsPortalCaCertSet`, `tlsEmbeddedCaCertSet`
- Firmware version เป็น `esp32-dht3-security-0.8.0`
- เพิ่ม script `scripts/phase10b-esp32-install-root-ca.ps1` สำหรับ fetch CA และเขียน header ให้อัตโนมัติ

## ติดตั้ง Root CA แบบ embedded

จาก root project:

```powershell
cd "D:\IoT Project\dotwatch"

powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\phase10b-esp32-install-root-ca.ps1 `
  -BackendHost "dotwatch-backend.onrender.com"
```

ถ้าต้องการใช้ bundle แทน candidate:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\phase10b-esp32-install-root-ca.ps1 `
  -BackendHost "dotwatch-backend.onrender.com" `
  -UseBundle
```

script จะเขียนไฟล์:

```text
esp32/dotwatch_esp32_dht3_tls_hardened/src/dotwatch_root_ca.h
esp32/dotwatch_esp32_dht3_tls_hardened/dotwatch_root_ca.h
```

## Build / Upload / Monitor

```powershell
cd "D:\IoT Project\dotwatch\esp32\dotwatch_esp32_dht3_tls_hardened"

py -m platformio run
py -m platformio run -t upload
py -m platformio device monitor
```

หรือให้ script ทำต่อเลย:

```powershell
cd "D:\IoT Project\dotwatch"

powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\phase10b-esp32-install-root-ca.ps1 `
  -BackendHost "dotwatch-backend.onrender.com" `
  -Build `
  -Upload `
  -Monitor
```

## ผลลัพธ์ที่ควรเห็น

หลัง flash ใหม่ Serial ควรมี:

```text
Firmware: esp32-dht3-security-0.8.0
TLS Mode: Root CA enabled (embedded)
TLS mode: Root CA verification enabled, source=embedded
POST status=200
SERVER_OK
```

ถ้า portal เคยมี Root CA ที่บันทึกไว้ จะเห็น `source=portal` เพราะ portal override embedded CA ได้

## ถ้าต้องการลบ embedded CA

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\phase10b-esp32-install-root-ca.ps1 -Clear
```

จากนั้น build/upload ใหม่

## หมายเหตุด้านความปลอดภัย

Root CA เป็น public certificate ไม่ใช่ secret/password/private key แต่ถ้า cert chain ของ Render เปลี่ยนในอนาคต ให้รัน script นี้ใหม่แล้ว flash firmware ใหม่ หรือ paste Root CA ใหม่ผ่าน Local Admin Portal
