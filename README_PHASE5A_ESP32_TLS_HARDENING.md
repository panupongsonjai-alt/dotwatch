# dotWatch Phase 5A — ESP32 HTTPS/TLS Hardening

Phase 5A เพิ่ม TLS hardening ให้ ESP32-DHT3 ต่อจาก Phase 4H Local Admin Portal

## เป้าหมาย

```text
1. เพิ่มช่อง Root CA Certificate ใน Local Admin Portal
2. ถ้าใส่ Root CA แล้ว firmware จะใช้ WiFiClientSecure.setCACert()
3. ถ้ายังไม่ใส่ Root CA จะยัง fallback เป็น setInsecure() เพื่อไม่ให้ device หลุดจาก backend
4. แสดง TLS Mode ในหน้าเว็บและ Serial Monitor
5. ไม่แตะ backend, dashboard, admin, Raspberry Pi
```

## Production firmware ใหม่

```text
esp32/dotwatch_esp32_dht3_tls_hardened
Firmware version: esp32-dht3-tls-hardening-0.5.0
```

Phase 4H ยังอยู่เป็น rollback:

```text
esp32/dotwatch_esp32_dht3_local_admin
Firmware version: esp32-dht3-local-admin-0.4.0
```

## TLS Modes

```text
Root CA enabled
- ESP32 ใช้ setCACert()
- เหมาะสำหรับ production

Insecure fallback
- ESP32 ใช้ setInsecure()
- ใช้ได้เพื่อความเข้ากันได้กับ Render HTTPS
- ควรเปลี่ยนเป็น Root CA เมื่อพร้อม
```

## วิธีติดตั้ง + Build

แตก zip ลงที่:

```text
D:\IoT Project\dotwatch
```

แล้วรัน:

```powershell
cd "D:\IoT Project\dotwatch"

powershell -NoProfile -ExecutionPolicy Bypass -File .\dotwatch-phase5a-esp32-tls-hardening.ps1 `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -PackDir "D:\IoT Project\dotwatch" `
  -InstallFiles `
  -Build
```

## Upload

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\dotwatch-phase5a-esp32-tls-hardening.ps1 `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -Upload
```

ถ้ารู้ COM port:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\dotwatch-phase5a-esp32-tls-hardening.ps1 `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -Port "COM5" `
  -Upload
```

## Monitor

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\dotwatch-phase5a-esp32-tls-hardening.ps1 `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -Monitor
```

ควรเห็น:

```text
Firmware: esp32-dht3-tls-hardening-0.5.0
TLS Mode: Insecure fallback
Local Admin URL: http://192.168.x.x/
```

หลังใส่ Root CA แล้วควรเห็น:

```text
TLS Mode: Root CA enabled
TLS mode: Root CA verification enabled
POST status=201
```

## วิธีใส่ Root CA จากหน้าเว็บ

```text
1. เปิด Serial Monitor
2. ดู Local Admin URL เช่น http://192.168.1.120/
3. เปิด URL นั้น
4. ใส่ Local Admin PIN
5. วาง Root CA PEM ในช่อง Root CA Certificate
6. กด Save & Restart
7. ดู Serial Monitor ว่า TLS Mode เปลี่ยนเป็น Root CA enabled
```

## วิธีลบ Root CA

ในช่อง Root CA Certificate ให้พิมพ์:

```text
CLEAR
```

แล้วกด Save & Restart

## คำเตือน

- Root CA ไม่ใช่ device secret แต่ไม่ควรแก้สุ่ม
- ถ้าใส่ Root CA ผิด ESP32 จะ POST ไม่สำเร็จ ให้เข้า Local Admin แล้วพิมพ์ CLEAR
- ถ้าเข้า Local Admin ไม่ได้ ให้กด BOOT ค้าง 6 วินาทีเพื่อ reset config
- อย่าเปิด Local Admin Portal ออก public internet
