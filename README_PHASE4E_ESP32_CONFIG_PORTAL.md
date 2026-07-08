# dotWatch Phase 4E — ESP32 Production Config Portal

เป้าหมาย: ทำให้ ESP32-DHT3 ใช้งานจริงง่ายขึ้น โดยไม่ต้อง hardcode Wi‑Fi และ device secret ใน `.ino`

## สำคัญ

ESP32-DHT3 เป็น model เพิ่มเติม ไม่ได้แทนที่ Raspberry Pi / DW20CH

## Features

```text
- Setup AP เมื่อยังไม่มี config หรือ Wi‑Fi ต่อไม่ได้
- SSID: dotWatch-ESP32-Setup
- URL : http://192.168.4.1/
- บันทึก config ลง ESP32 Preferences / NVS
- ตั้งค่า Wi‑Fi, Backend URL, Device Code/Secret, DHT pin/type, interval ได้ผ่านเว็บ
- ส่ง metrics:
  metric_1 = Temperature
  metric_2 = Humidity
  metric_3 = WiFi RSSI
- ใช้ NTP timestamp เป็น ISO เมื่อ sync เวลาได้
- ส่ง x-device-code และ x-device-secret ผ่าน header
```

## ติดตั้งไฟล์เข้า repo

```powershell
cd "D:\IoT Project\dotwatch"

powershell -NoProfile -ExecutionPolicy Bypass -File .\dotwatch-phase4e-esp32-config-portal.ps1 `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -PackDir "D:\IoT Project\dotwatch" `
  -InstallFiles
```

## ถ้าต้องการ commit + push

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\dotwatch-phase4e-esp32-config-portal.ps1 `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -PackDir "D:\IoT Project\dotwatch" `
  -InstallFiles `
  -Commit `
  -Push
```

สคริปต์จะ stage เฉพาะไฟล์ Phase 4E ไม่ใช้ `git add -A`

## Firmware folder

```text
esp32/dotwatch_esp32_dht3_config_portal/
```

## วิธีใช้งานกับบอร์ดจริง

1. เปิด project ใน PlatformIO หรือ Arduino IDE
2. เลือก board: ESP32 Dev Module / esp32dev
3. Upload firmware
4. เปิด Serial Monitor 115200
5. ถ้ายังไม่มี config บอร์ดจะเปิด AP:

```text
dotWatch-ESP32-Setup
```

6. ต่อ Wi‑Fi เข้า AP แล้วเปิด:

```text
http://192.168.4.1/
```

7. กรอก:

```text
Wi‑Fi SSID
Wi‑Fi Password
Backend API URL = https://dotwatch-backend.onrender.com
Device Code = code ของ ESP32 device
Device Secret = secret ของ ESP32 device
DHT pin = 4
DHT type = DHT11 หรือ DHT22
Send interval = 20 sec
```

8. กด Save & Restart

## การ reset config

เข้า portal แล้วกด `Factory Reset Config`

ถ้าเข้า portal ไม่ได้ ให้ flash firmware ใหม่พร้อม erase flash หรือเพิ่มปุ่ม physical reset ใน phase ถัดไป

## หมายเหตุเรื่อง HTTPS

Firmware นี้ใช้ `WiFiClientSecure.setInsecure()` เพื่อให้ setup ง่ายกับ Render HTTPS

สำหรับ production เข้มงวดกว่านี้ ควรเปลี่ยนเป็น root CA certificate pinning ใน phase ถัดไป
