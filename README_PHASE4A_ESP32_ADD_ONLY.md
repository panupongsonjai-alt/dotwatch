# dotWatch Phase 4A — Add ESP32 as an Additional Model

สำคัญ: ESP32 ตัวนี้เป็น **model เพิ่มเติม** ไม่ได้แทนที่ Raspberry Pi / DW20CH

## Existing models ที่ต้องยังอยู่

```text
dw_2ch
dw_10ch
dw_20ch
```

## New model ที่เพิ่ม

```text
model_key    = esp32_dht3
model_name   = ESP32-DHT3
metric_count = 3
```

## Metrics

```text
metric_1 = Temperature (°C)
metric_2 = Humidity (%)
metric_3 = WiFi RSSI (dBm)
```

## ติดตั้งไฟล์เข้า repo

```powershell
cd "D:\IoT Project\dotwatch"

powershell -NoProfile -ExecutionPolicy Bypass -File .\dotwatch-phase4a-esp32-add-only.ps1 `
  -PackDir "D:\IoT Project\dotwatch" `
  -InstallFiles
```

## เพิ่ม model ลง database

### ใช้ Node seed

```powershell
cd "D:\IoT Project\dotwatch\services\backend"

node .\src\scripts\seed-esp32-dht3-model-add-only.cjs
node .\src\scripts\check-device-models.cjs
```

ผลที่ต้องการคือ `dw_20ch` ยังอยู่ และมี `esp32_dht3` เพิ่มเข้ามา

### หรือใช้ DBeaver

รันไฟล์ SQL:

```text
services/backend/src/db/migrations/20260708_add_esp32_dht3_model_add_only.sql
```

## ทดสอบ ESP32 ingest โดยไม่ใช้บอร์ดจริง

สร้าง device ใหม่ใน Dashboard เป็น model `ESP32-DHT3` แล้วใช้ code/secret ของ device ESP32 ตัวใหม่เท่านั้น

```powershell
cd "D:\IoT Project\dotwatch"

$env:DOTWATCH_API_URL="https://dotwatch-backend.onrender.com"
$env:DEVICE_CODE="DW-ESP32-XXXX"
$env:DEVICE_SECRET="YOUR_ESP32_DEVICE_SECRET"

node .\esp32\scripts\test-esp32-dht3-ingest.cjs
```

## Firmware

```text
esp32/dotwatch_esp32_dht3/dotwatch_esp32_dht3.ino
```

แก้เฉพาะ:

```cpp
#define WIFI_SSID "..."
#define WIFI_PASSWORD "..."
#define DEVICE_CODE "DW-ESP32-XXXX"
#define DEVICE_SECRET "..."
```

อย่าใช้ device code/secret ของ Raspberry Pi
