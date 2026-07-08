# dotWatch Production Release Checklist — Phase 4K

ใช้ checklist นี้ก่อนประกาศ baseline พร้อมใช้งานจริง

## 1. Scope

```text
[ ] Raspberry Pi / DW20CH ยังใช้งานได้
[ ] ESP32-DHT3 เป็น model เพิ่มเติม ไม่แทนที่ Pi
[ ] Backend ingest ใช้งานได้
[ ] Dashboard แสดง ESP32 metrics ถูกต้อง
[ ] Admin Models ใช้จัดการ device models ได้
[ ] ESP32 Local Admin Portal ใช้แก้ Wi-Fi ผ่าน IP บ้านได้
```

## 2. Git / Repo

```text
[ ] git status สะอาด หรือเหลือเฉพาะ _cleanup_trash ที่ไม่ commit
[ ] ไม่มี .env ถูก stage
[ ] ไม่มี device secret ถูก commit
[ ] ไม่มี _reports ถูก commit
[ ] ไม่มี .pio ถูก commit
[ ] ไม่มี deleted files ค้าง
[ ] main branch push ล่าสุดแล้ว
```

## 3. Backend

```text
[ ] /health HTTP 200
[ ] database = connected
[ ] firebase = configured
[ ] migration runner services/backend/migrations/run.js อยู่ครบ
[ ] migration 018_esp32_dht3_model.sql อยู่ครบ
[ ] device_models มี esp32_dht3
[ ] device_models มี dw_20ch
[ ] device_model_metrics ของ esp32_dht3 มี metric_1/2/3
[ ] ingest simulator ของ ESP32 ได้ status 201 หรือ 200
```

## 4. Dashboard

```text
[ ] npm run build ผ่านใน apps/dashboard
[ ] Devices page มี ESP32-DHT3 ใน model list
[ ] Devices list แสดง Temp / Hum / RSSI
[ ] Device Detail > Metrics แสดง Temperature / Humidity / WiFi RSSI
[ ] Device Detail > Overview แสดง Local Admin URL hint
[ ] Device Detail > Overview แสดง Default PIN hint
[ ] Dashboard deploy บน Render สำเร็จ
[ ] https://dotwatch.onrender.com เปิดได้
```

## 5. dotwatch-admin

```text
[ ] npm run build ผ่านใน apps/admin
[ ] Admin sidebar มี Models
[ ] Models page เปิดได้
[ ] เพิ่ม model ได้
[ ] แก้ไข model ได้
[ ] soft delete / restore model ได้
[ ] ไม่ลบ dw_20ch
[ ] ไม่ลบ esp32_dht3 โดยไม่ตั้งใจ
```

## 6. ESP32-DHT3 Firmware

```text
[ ] Phase 4H firmware อยู่ที่ esp32/dotwatch_esp32_dht3_local_admin
[ ] Firmware version = esp32-dht3-local-admin-0.4.0
[ ] py -m platformio run ผ่าน
[ ] upload firmware ผ่าน
[ ] Serial Monitor 115200 อ่านได้
[ ] Wi-Fi connected
[ ] POST status=201 หรือ 200
[ ] SERVER_OK
[ ] Dashboard แสดง device online
```

## 7. ESP32 Local Admin Portal

```text
[ ] Serial Monitor แสดง Local Admin URL
[ ] เปิด http://ESP32_IP/ ได้
[ ] เข้าได้ด้วย PIN
[ ] Default PIN = 6 ตัวท้ายของ Device Code
[ ] ตั้ง Custom PIN ใหม่ได้
[ ] แก้ Wi-Fi SSID/password ได้
[ ] Save & Restart แล้ว reconnect ได้
[ ] Device Secret ไม่แสดงเต็มในหน้าเว็บ
[ ] ลืม PIN แล้วกด BOOT ค้าง 6 วินาที reset config ได้
```

## 8. Raspberry Pi / DW20CH Regression

```text
[ ] Pi service ยัง active
[ ] dotwatch-pi-agent.service active
[ ] dotwatch-pi-config-ui.service active
[ ] Pi agent ส่ง SERVER_OK
[ ] DW20CH metrics ยังไม่ถูกเปลี่ยน
[ ] Backend ยังรับ payload จาก Pi ได้
[ ] Dashboard ยังแสดง Pi device ได้
```

## 9. Security

```text
[ ] ไม่มี secret ใน git status
[ ] ไม่มี secret ใน README/report
[ ] Device Secret ที่เคย paste ใน log ถูก rotate แล้ว ถ้า log ถูก commit/shared
[ ] ESP32 local admin มี PIN
[ ] _reports ไม่ถูก commit
[ ] _cleanup_trash ไม่ถูก commit
[ ] .env อยู่ใน .gitignore
```

## 10. Release Lock

```text
[ ] สร้าง baseline report แล้ว
[ ] commit เอกสาร Phase 4K แล้ว
[ ] push main แล้ว
[ ] สร้าง git tag เช่น phase4k-production-20260708 แล้ว
[ ] push tag แล้ว
[ ] บันทึก commit hash ล่าสุดไว้
```

## Final Approval

```text
Release owner:
Release date:
Git commit:
Git tag:
Status: READY / HOLD
Notes:
```
