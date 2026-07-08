# dotWatch Phase 4F — PlatformIO Final Firmware Layout

แพ็กนี้เป็นเวอร์ชันจัดโครงสร้างถาวรของ ESP32-DHT3 Hardened Firmware

## แก้อะไร

```text
1. เพิ่ม src/main.cpp สำหรับ PlatformIO
2. เก็บ .ino ไว้สำหรับ Arduino IDE/reference
3. แก้ compile error:
   max(10, server.arg("sendIntervalSec").toInt())
   เพราะ int ชนกับ long int
4. ใช้ py -m platformio แทน pio เพื่อไม่ต้องพึ่ง PATH
```

## Firmware folder หลังติดตั้ง

```text
esp32/dotwatch_esp32_dht3_hardened/
├─ platformio.ini
├─ dotwatch_esp32_dht3_hardened.ino
└─ src/
   └─ main.cpp
```

## ติดตั้ง + Build

```powershell
cd "D:\IoT Project\dotwatch"

powershell -NoProfile -ExecutionPolicy Bypass -File .\dotwatch-phase4f-platformio-final.ps1 `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -PackDir "D:\IoT Project\dotwatch" `
  -InstallFiles `
  -Build
```

## Upload

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\dotwatch-phase4f-platformio-final.ps1 `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -PackDir "D:\IoT Project\dotwatch" `
  -Upload
```

ถ้ารู้ COM port:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\dotwatch-phase4f-platformio-final.ps1 `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -PackDir "D:\IoT Project\dotwatch" `
  -Port "COM5" `
  -Upload
```

## Monitor

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\dotwatch-phase4f-platformio-final.ps1 `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -PackDir "D:\IoT Project\dotwatch" `
  -Monitor
```

## Commit + Push หลัง build/upload ผ่าน

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\dotwatch-phase4f-platformio-final.ps1 `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -PackDir "D:\IoT Project\dotwatch" `
  -InstallFiles `
  -Build `
  -Commit `
  -Push
```

## สิ่งที่ยังไม่แก้

Warning ของ ArduinoJson เรื่อง `StaticJsonDocument` เป็น deprecation warning เท่านั้น ไม่ใช่สาเหตุที่ build fail รอบนี้ จึงยังไม่รื้อเพื่อกัน regression
