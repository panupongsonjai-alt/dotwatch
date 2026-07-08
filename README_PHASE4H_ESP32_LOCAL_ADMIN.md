# dotWatch Phase 4H — ESP32 Local Admin Portal with PIN

Phase 4H เพิ่มหน้า Local Admin Portal ให้ ESP32-DHT3 ที่ต่อ Wi-Fi อยู่แล้วสามารถแก้ Wi-Fi/backend/device settings ผ่าน IP บ้านได้ โดยไม่ต้อง factory reset ทุกครั้ง

ยังเป็น ESP32 model เพิ่มเติม ไม่แทนที่ Raspberry Pi / DW20CH

## เพิ่มอะไรจาก Phase 4F

```text
1. ESP32 เปิด local web server ใน normal mode
2. เข้าได้จาก http://<ESP32_IP>/
3. มี Local Admin PIN ก่อนแก้ config
4. แก้ Wi-Fi SSID/password ได้จากหน้าเว็บ
5. แก้ Backend URL, Device Code/Secret, DHT Pin/Type, Send Interval ได้
6. ยังมี setup AP เดิมเมื่อไม่มี config หรือ Wi-Fi ต่อไม่ได้
7. ยังมี BOOT long-press reset config 6 วินาที
```

## PIN เริ่มต้น

ถ้ายังไม่เคยตั้ง Custom PIN:

```text
PIN เริ่มต้น = 6 ตัวท้ายของ Device Code
```

ตัวอย่าง:

```text
Device Code = DW-1783498262178
PIN         = 262178
```

หลังเข้าได้แล้วให้ตั้ง `Local Admin PIN` ใหม่ในหน้าเว็บ

## ติดตั้งไฟล์เข้า repo

แตก zip ลงที่:

```text
D:\IoT Project\dotwatch
```

แล้วรัน:

```powershell
cd "D:\IoT Project\dotwatch"

powershell -NoProfile -ExecutionPolicy Bypass -File .\dotwatch-phase4h-esp32-local-admin.ps1 `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -PackDir "D:\IoT Project\dotwatch" `
  -InstallFiles `
  -Build
```

## Upload

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\dotwatch-phase4h-esp32-local-admin.ps1 `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -Upload
```

ถ้ารู้ COM port:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\dotwatch-phase4h-esp32-local-admin.ps1 `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -Port "COM5" `
  -Upload
```

## เปิด Monitor

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\dotwatch-phase4h-esp32-local-admin.ps1 `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -Monitor
```

## วิธีใช้งานหน้าเว็บหลัง ESP32 ต่อ Wi-Fi แล้ว

ดู Serial Monitor จะเห็น:

```text
Wi-Fi connected. IP=192.168.x.x
Local Admin URL: http://192.168.x.x/
```

เปิด browser:

```text
http://192.168.x.x/
```

ใส่ PIN แล้วแก้ Wi-Fi ได้

## คำเตือน

- Local Admin เปิดเฉพาะในวง LAN ของ Wi-Fi ที่ ESP32 ต่ออยู่
- อย่าใช้ PIN ง่ายเกินไป
- Device Secret จะไม่แสดงเต็มในหน้าเว็บ
- ถ้าลืม PIN ให้กด BOOT ค้าง 6 วินาทีเพื่อ reset config แล้วตั้งค่าใหม่ผ่าน setup AP

## Commit + Push หลังทดสอบผ่าน

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\dotwatch-phase4h-esp32-local-admin.ps1 `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -InstallFiles `
  -Build `
  -Commit `
  -Push
```
