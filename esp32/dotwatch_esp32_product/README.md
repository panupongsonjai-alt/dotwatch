# dotWatch ESP32 Product Core — Phase 12A

Firmware ชุดนี้เป็นโครงสร้างหลักสำหรับพัฒนา ESP32 ให้เหมาะกับ Product จริง
โดยแยกโมดูลออกจาก `main.cpp` และคงความเข้ากันได้กับค่า NVS จาก Firmware รุ่นก่อนหน้า

Firmware ปัจจุบันอยู่ที่:

```text
esp32/dotwatch_esp32_product
```

## สิ่งที่เปลี่ยนใน Phase 12A

- `main.cpp` เหลือเฉพาะเรียก `AppController`
- แยก Config, Wi-Fi, Portal, Backend, Sensor, LED และ Recovery ออกจากกัน
- ใช้ State ชัดเจน: `BOOTING`, `SETUP_PORTAL`, `CONNECTING_WIFI`, `CONNECTING_BACKEND`, `ONLINE`, `DEGRADED`, `RECOVERY`
- อ่านค่า NVS เดิมได้ โดยใช้ namespace และ key เดิม
- เพิ่ม Config Schema Version โดยไม่ล้างค่าเก่า
- เพิ่ม Pending Wi-Fi + Rollback
  - Wi-Fi ใหม่ยังไม่ทับ Wi-Fi เดิมทันที
  - หลัง Restart ระบบจะลอง Wi-Fi ใหม่ก่อน
  - สำเร็จจึง Promote เป็น Active
  - ล้มเหลวจะกลับไปใช้ Wi-Fi เดิม
- Setup AP แยกตามอุปกรณ์ เช่น `dotWatch-Setup-A1B2C3`
- Portal แยก CSS/JavaScript ออกจาก Core logic
- Web App แยกเป็น `components`, `pages`, `features`, `styles` และ `shared` คล้าย Dashboard
- `PortalServer` ดูแลเฉพาะ route/validation ส่วน HTML จริงอยู่ใน `src/portal/views`
- Payload ยังคงเดิม:
  - `metric_1` = Temperature
  - `metric_2` = Humidity
  - Wi-Fi RSSI is sent as operational metadata (`rssi`), not as a dashboard metric.
- Backend URL, Device Code, Device Secret และ Root CA เดิมยังใช้ได้

## Build

PowerShell:

```powershell
cd "D:\IoT Project\dotwatch\esp32\dotwatch_esp32_product"
python -m platformio run
```

## Upload

```powershell
python -m platformio run --target upload
```

ระบุพอร์ตเมื่อมีหลายอุปกรณ์:

```powershell
python -m platformio run --target upload --upload-port COM5
```

## Serial Monitor

```powershell
python -m platformio device monitor --baud 115200
```

หรือระบุพอร์ต:

```powershell
python -m platformio device monitor --port COM5 --baud 115200
```

ออกจาก Monitor ด้วย `Ctrl + C`

## เปิด Setup Portal

เมื่อยังไม่มี Wi-Fi หรือเชื่อม Wi-Fi ไม่สำเร็จ:

```text
SSID     : dotWatch-Setup-XXXXXX
Password : dotwatch-setup
URL      : http://192.168.4.1/
```

`XXXXXX` คือ 6 ตัวท้ายของ MAC Address ทำให้แยกอุปกรณ์หลายตัวได้ง่ายขึ้น

## Local Admin PIN

เมื่อ ESP32 ออนไลน์ ให้เปิด Local IP ที่แสดงใน Serial Monitor

- ถ้ายังไม่ตั้ง Custom PIN: ใช้ `admin`
- หลังเข้าสู่ระบบแล้วสามารถตั้ง Custom PIN ได้ในหน้า Security

## Wi-Fi Rollback

เมื่อกดบันทึก Wi-Fi ใหม่:

1. Firmware เก็บค่าเป็น `Pending Wi-Fi`
2. Restart
3. ลองเชื่อม Pending Wi-Fi
4. ถ้าสำเร็จ จึงบันทึกเป็น Active Wi-Fi
5. ถ้าไม่สำเร็จ ลบ Pending และกลับไปลอง Active/Backup เดิม

จึงไม่จำเป็นต้อง Factory Reset เมื่อพิมพ์รหัส Wi-Fi ผิด

## Compatibility

Firmware นี้อ่านค่าเดิมจาก Firmware รุ่น `dotwatch_esp32_dht3_tls_hardened` ได้ ได้แก่:

- `wifiSsid`
- `wifiPass`
- `wifiProfiles`
- `apiUrl`
- `devCode`
- `devSecret`
- `adminPin`
- `tlsCaCert`
- `dhtPin`
- `dhtType`
- `sendMs`
- `dummy`

## ยังไม่รวมใน Phase 12A

- Activation Code / QR Provisioning
- Signed OTA และ Firmware Rollback
- Secure Boot / Flash Encryption
- Setup password แยกรายเครื่องบน Sticker
- Offline telemetry queue
- Factory test mode

หัวข้อเหล่านี้จะทำใน Phase 12B–12D หลังทดสอบ Core ใหม่บนบอร์ดจริงผ่านแล้ว
