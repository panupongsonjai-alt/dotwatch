# dotWatch Phase S1 — Validation Report

วันที่ตรวจ: 15 กรกฎาคม 2026

## ผลตรวจที่ผ่าน

### Static security verification

คำสั่ง:

```text
npm run verify:phase-s1:security
```

ผล:

```text
Phase S1 security verification passed (17 checks).
```

ครอบคลุม ESP32 และ ESP8266:

- ไม่มี fleet-wide Setup AP password constant
- credential เฉพาะเครื่องถูกสร้างและบันทึก
- Local Admin ใช้ POST login และ session cookie
- ไม่มี PIN ใน URL/hidden field
- Setup Portal มี deliberate activation และ timeout
- Portal Preview ไม่ใช้ `?pin=` หรือเก็บ PIN ใน localStorage
- มี explicit logout

ครอบคลุม Backend:

- ลบ committed encryption key
- บล็อก known public key
- บังคับ PostgreSQL certificate verification ใน production

### Production environment pass/fail tests

คำสั่ง:

```text
npm run test:phase-s1:prod-env
```

ผล:

```text
PASS: secure-production-env (exit=0)
PASS: known-public-encryption-key-is-blocked (exit=1)
PASS: database-certificate-verification-is-required (exit=1)
Phase S1 production environment pass/fail tests completed successfully.
```

### Backend/Dashboard/Admin/Mobile

คำสั่ง:

```text
npm run check:all
```

ผล:

- Backend syntax: ผ่าน
- Dashboard Vite production build: ผ่าน
- Admin Vite production build: ผ่าน
- Mobile TypeScript typecheck: ผ่าน

### Portal Preview JavaScript

ตรวจด้วย `node --check` ทั้ง ESP32 และ ESP8266:

- `portal-preview/dev-server.mjs`: ผ่าน
- `portal-preview/src/preview/preview.js`: ผ่าน

## ข้อจำกัดของการตรวจใน environment นี้

PlatformIO ถูกติดตั้งแล้ว แต่การดาวน์โหลด platform package `espressif32` ไม่เสร็จภายในเวลาของ environment จึงยังไม่ได้ผล compiler จริงของ firmware ในรอบนี้ ไม่พบ compiler error เพราะขั้นตอนยังไม่ถึงการ compile

ต้องตรวจบนเครื่องโครงการด้วย:

```powershell
python -m platformio run -d .\esp32\dotwatch_esp32_product
python -m platformio run -d .\esp8266\dotwatch_esp8266_product
```

และต้องทดสอบบนบอร์ดจริง:

- credential migration จาก firmware รุ่นเดิม
- Setup AP password จาก Serial Monitor/ฉลาก
- กด BOOT/FLASH 2 วินาที
- timeout 15 นาที
- login success/failure/lockout/logout
- reboot แล้ว credential/session behavior ถูกต้อง
- commissioning สำเร็จแล้ว AP ปิด
- Wi-Fi หลุดแล้ว AP ไม่เปิดอัตโนมัติ
- backend เชื่อม PostgreSQL ด้วย certificate verification

## คำตัดสิน

ชุดไฟล์ผ่าน static checks และ application build checks ที่เกี่ยวข้อง แต่สถานะก่อน deploy คือ **พร้อมสำหรับ hardware verification และ controlled pilot** ไม่ใช่การเปิด production ทันทีจนกว่า PlatformIO build และ board test ข้างต้นจะผ่าน
