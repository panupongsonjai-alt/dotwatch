# Phase 12A — ESP32 Product Core

## เป้าหมาย

สร้าง Firmware โครงสร้างใหม่แบบ Add-only เพื่อให้แก้ไข ทดสอบ และเพิ่มรุ่น Product ได้โดยไม่ต้องแก้ไฟล์ `main.cpp` ขนาดใหญ่ไฟล์เดียว

## โครงสร้าง

```text
esp32/dotwatch_esp32_product/
├── include/
│   ├── AppTypes.h
│   ├── FirmwareVersion.h
│   ├── ProductConfig.h
│   └── dotwatch_root_ca.h
├── src/
│   ├── main.cpp
│   ├── app/
│   ├── backend/
│   ├── config/
│   ├── network/
│   ├── portal/
│   ├── recovery/
│   ├── sensors/
│   ├── status/
│   └── utils/
├── platformio.ini
└── README.md
```

## Module Responsibilities

| Module | หน้าที่ |
|---|---|
| `AppController` | ควบคุม State และลำดับการทำงานหลัก |
| `ConfigStore` | โหลด/บันทึก NVS, Schema Migration, Wi-Fi profiles |
| `WiFiManager` | Connect, Scan, AP และ Pending Wi-Fi rollback |
| `TimeService` | NTP และ ISO timestamp |
| `SensorManager` | DHT11/DHT22 และ fallback |
| `BackendClient` | TLS และ POST `/api/ingest` |
| `PortalServer` | Setup Portal, Local Admin, Status JSON |
| `StatusLed` | รูปแบบไฟตาม State |
| `RecoveryManager` | BOOT reset และ self-recovery |

## State Model

```text
BOOTING
  └─ CONNECTING_WIFI
       ├─ SETUP_PORTAL
       └─ CONNECTING_BACKEND
             ├─ ONLINE
             └─ DEGRADED
```

`RECOVERY` ใช้เมื่อ Factory Reset หรือ Self-Recovery Restart

## NVS Migration

ใช้ namespace `dotwatch` และ key เดิมทั้งหมด จึงอัปโหลด Firmware ใหม่ทับบอร์ดเดิมได้โดยไม่ต้องกรอก Config ใหม่

เพิ่มเฉพาะ key ใหม่:

```text
cfgVer
pendSsid
pendPass
pendWifi
pendBackup
```

## Acceptance Test บนบอร์ดจริง

1. Build ผ่าน
2. Upload ผ่าน
3. Config เก่าถูกอ่านได้
4. เชื่อม Wi-Fi เดิมได้
5. Local Admin เปิดได้
6. Sensor Test อ่านค่าได้
7. ส่ง `metric_1`, `metric_2`, `metric_3` เข้า Render ได้
8. เปลี่ยน Wi-Fi เป็นค่าถูกต้องและ Promote สำเร็จ
9. เปลี่ยน Wi-Fi ด้วยรหัสผิดแล้ว Rollback กลับเครือข่ายเดิม
10. กด BOOT 6 วินาทีแล้ว Factory Reset ได้

## Rollback Firmware

Firmware เดิมยังอยู่ใน:

```text
esp32/dotwatch_esp32_dht3_tls_hardened
```

หาก Product Core ยังไม่ผ่าน Acceptance Test ให้ Upload Firmware เดิมกลับ โดยไม่ต้องลบโฟลเดอร์ใหม่
