# dotWatch Phase S3B — ESP32 Secure Boot v2 และ Flash Encryption

เอกสารนี้ใช้กับ ESP32 รุ่นดั้งเดิม (`board = esp32dev`) ของ dotWatch และต้องดำเนินการบนบอร์ดทดลองที่ยอมสูญเสียได้ก่อนเท่านั้น

> คำเตือน: Secure Boot และ Flash Encryption เปลี่ยน eFuse แบบถาวร การใช้คีย์ผิด ไฟดับระหว่าง first boot หรือใช้ chip revision ที่ไม่รองรับ อาจทำให้บอร์ด boot หรือ reflash ไม่ได้

## ขอบเขตชุดไฟล์

ชุด Phase S3B เป็น cumulative overlay รวม:

- Phase S3A: Signed OTA ด้วย ECDSA P-256 และ software anti-rollback
- Phase S3B: Secure Boot v2, Flash Encryption, NVS encryption และ hardware posture reporting

Firmware:

- Version: `esp32-product-1.4.0-hardware-trust`
- Build: `1400`
- OTA slot สูงสุด: `0x170000` bytes ต่อ slot

## หลักการออกแบบความปลอดภัย

มี 3 build profiles:

1. `esp32_product` — Arduino ปกติและเป็น default; ไม่แตะ eFuse
2. `esp32_product_secure_pilot` — Secure Boot v2 + Flash Encryption development mode สำหรับบอร์ดทดลองที่ยอมสูญเสียได้
3. `esp32_product_secure_release` — Secure Boot v2 + Flash Encryption release mode สำหรับ manufacturing หลัง pilot ผ่านเท่านั้น

Secure profile ใช้ Arduino เป็น ESP-IDF component เพื่อให้ใช้ sdkconfig ด้าน hardware security ได้

## ข้อกำหนดบอร์ด

- ESP32 chip revision ต้องเป็น v3.0 ขึ้นไป
- Flash 4 MB
- USB cable และไฟเลี้ยงต้องเสถียร
- ปิด Serial Monitor/Arduino IDE ที่จับ COM port อยู่
- ต้องมี backup flash และ eFuse summary ก่อน provisioning

## แยกคีย์ให้ชัดเจน

Phase S3 ใช้คีย์คนละวัตถุประสงค์:

- OTA release signing key: ECDSA P-256 จาก Phase S3A ใช้ลงลายเซ็น metadata ของ release
- Secure Boot key: RSA-3072 ใช้ลงลายเซ็น bootloader/app และผูก public-key digest กับ eFuse
- Flash Encryption key: ESP32 สร้าง AES-256 key ด้วย hardware RNG บน first boot และเก็บใน eFuse ที่ read/write protected

ห้ามนำคีย์ OTA มาใช้เป็น Secure Boot key และห้าม commit private key ใด ๆ

## 1. ลง Direct Overlay

```powershell
$ZipFile = "$env:USERPROFILE\Downloads\dotwatch-phase-s3-hardware-trust-direct-to-dotwatch.zip"
$RepoRoot = "D:\IoT Project\dotwatch"

Expand-Archive `
  -LiteralPath $ZipFile `
  -DestinationPath $RepoRoot `
  -Force
```

## 2. ตรวจ source ก่อนต่อบอร์ด

```powershell
Set-Location "D:\IoT Project\dotwatch"

npm run verify:phase-s1:security
npm run test:phase-s2
npm run test:phase-s3a
npm run test:phase-s3b
npm --prefix services/ota-server run check
```

ผลที่ต้องได้:

```text
Phase S3A security verification passed (11 checks).
Phase S3A release signing tests passed.
Phase S3A OTA server integration tests passed.
Phase S3B security verification passed (13 checks).
Phase S3B safety tests passed.
```

## 3. ติดตั้งเครื่องมือ

```powershell
python -m pip install --upgrade platformio esptool

python -m platformio --version
python -m esptool version
python -m espefuse --help
python -m espsecure --help
```

## 4. ตรวจ COM port

```powershell
python -m platformio device list
```

ตัวอย่าง:

```text
COM5
Hardware ID: USB VID:PID=10C4:EA60
```

ตัวอย่างนี้ใช้ `COM5`; ให้เปลี่ยนตามเครื่องจริง

## 5. Readiness check — ห้ามข้าม

```powershell
npm run esp32:security:readiness -- `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -Port "COM5"
```

ตัวอย่างผ่าน:

```text
Chip revision     : 3.1
Secure Boot v2 OK : True
Secure Boot state : False
Flash enc state   : False
PASS: board is eligible for the Phase S3B workflow
```

ตัวอย่างไม่ผ่าน — revision ต่ำกว่า 3:

```text
FAIL: ESP32 chip revision 3.0 or newer is required for Secure Boot v2.
```

ห้ามดำเนินการกับบอร์ดดังกล่าว ให้เปลี่ยนเป็น ESP32 revision v3 หรือรุ่นใหม่ที่ workflow รองรับ

ตัวอย่างไม่ผ่าน — COM ถูกใช้งาน:

```text
Unable to read the board. Check COM port, USB driver, cable, and close Serial Monitor.
```

ปิด PlatformIO Monitor, Arduino Serial Monitor และโปรแกรมอื่นที่ใช้ COM port ก่อน

รายงานจะอยู่ที่:

```text
_reports\esp32-security\readiness-YYYYMMDD-HHMMSS
```

## 6. สร้าง Secure Boot RSA-3072 key

สร้างครั้งเดียวสำหรับ production trust domain และเก็บนอก repository:

```powershell
npm run esp32:security:keygen -- `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -KeyRoot "$env:USERPROFILE\.dotwatch\esp32-security" `
  -KeyId "dotwatch-secure-boot-v2-2026-01"
```

ไฟล์สำคัญ:

```text
C:\Users\<USER>\.dotwatch\esp32-security\dotwatch-secure-boot-v2-2026-01.secure-boot-v2.pem
C:\Users\<USER>\.dotwatch\esp32-security\dotwatch-secure-boot-v2-2026-01.secure-boot-v2.public.pem
C:\Users\<USER>\.dotwatch\esp32-security\dotwatch-secure-boot-v2-2026-01.secure-boot-v2.digest.bin
```

ตัวอย่างไม่ผ่าน — คีย์อยู่ใน repo:

```text
KeyRoot must be outside the dotwatch repository
```

ตัวอย่างไม่ผ่าน — คีย์มีอยู่แล้ว:

```text
Key material already exists ... Use -Force only for an intentional key rotation.
```

ห้ามใช้ `-Force` โดยไม่มีแผน key rotation และ inventory ของบอร์ดที่ผูกกับ key เดิม

## 7. Backup flash และ eFuse

```powershell
npm run esp32:security:backup -- `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -Port "COM5"
```

ผลที่ต้องได้:

```text
PASS: flash and eFuse backup completed
Backup: D:\IoT Project\dotwatch\_backups\esp32-flash\...
SHA-256: ...
```

สำเนา `_backups\esp32-flash` ไปยัง storage อื่นก่อน provisioning

## 8. Build Secure Pilot

```powershell
$SecureBootKey = "$env:USERPROFILE\.dotwatch\esp32-security\dotwatch-secure-boot-v2-2026-01.secure-boot-v2.pem"

npm run esp32:security:build -- `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -Profile pilot `
  -SecureBootKeyPath $SecureBootKey `
  -Clean
```

ตัวอย่างผ่าน:

```text
PASS: secure firmware build completed
Environment: esp32_product_secure_pilot
Firmware   : ...\.pio\build\esp32_product_secure_pilot\firmware.bin
```

ตัวอย่างไม่ผ่าน — toolchain ยังไม่ติดตั้ง:

```text
Platform Manager: Installing espressif32 @ 7.0.1
```

ปล่อยให้ดาวน์โหลดเสร็จและรันคำสั่งเดิมอีกครั้ง หากเครือข่ายองค์กรบล็อก PlatformIO registry ให้เปลี่ยนเครือข่ายหรือ proxy ก่อน ห้ามข้าม build verification

ตัวอย่างไม่ผ่าน — firmware ใหญ่เกิน slot:

```text
Signed firmware exceeds secure OTA slot
```

ห้ามเพิ่ม partition size แบบสุ่ม ต้องลด binary หรือออกแบบ partition ใหม่และตรวจ alignment/flash size ทั้งหมด

## 9. ตรวจ plan โดยยังไม่เปลี่ยนบอร์ด

คำสั่งนี้เป็น plan-only และไม่ upload:

```powershell
npm run esp32:security:provision -- `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -Port "COM5" `
  -Profile pilot `
  -SecureBootKeyPath $SecureBootKey
```

ผล:

```text
PLAN ONLY: no flash or eFuse-changing operation was executed.
Confirmation token: ENABLE_HARDWARE_TRUST_<MAC>
```

บันทึก token ที่แสดงเฉพาะบอร์ดนั้น

## 10. Provision pilot board — irreversible

ทำเฉพาะบอร์ดทดลองที่ยอมสูญเสียได้:

```powershell
npm run esp32:security:provision -- `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -Port "COM5" `
  -Profile pilot `
  -SecureBootKeyPath $SecureBootKey `
  -ExecuteIrreversible `
  -Confirmation "ENABLE_HARDWARE_TRUST_A1B2C3D4E5F6"
```

ใช้ token ที่คำสั่ง plan-only แสดงจริง ห้ามคัดลอกตัวอย่าง

ระหว่าง first boot:

- ห้ามถอด USB
- ห้ามกด Reset
- ห้ามปิดเครื่อง
- การเข้ารหัส in-place อาจใช้เวลาถึงประมาณหนึ่งนาที
- บอร์ดอาจ reboot มากกว่าหนึ่งครั้ง

## 11. Verify หลัง first boot

```powershell
npm run esp32:security:verify-device -- `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -Port "COM5" `
  -Profile pilot
```

ตัวอย่างผ่าน:

```text
PASS: hardware security state matches the pilot profile
Secure Boot       : True
Flash Encryption  : True
FLASH_CRYPT_CNT   : 1
```

ตัวอย่างไม่ผ่าน:

```text
FAIL: Secure Boot and Flash Encryption were not both detected.
```

ห้ามลอง burn eFuse เพิ่มเอง ให้เก็บ serial log, readiness report, backup และ verification report เพื่อตรวจ root cause ก่อน

## 12. Pilot validation ก่อน Release mode

ต้องผ่านอย่างน้อย:

- Boot ต่อเนื่องหลัง power cycle
- Setup Portal และ credential persistence
- Wi-Fi reconnect
- Temperature/Humidity ingest
- Dashboard realtime
- Signed OTA build ที่มากกว่า 1400
- ปฏิเสธ OTA signature ผิด
- ปฏิเสธ firmware downgrade
- OTA rollback เมื่อ firmware boot ไม่ผ่าน
- Backup/restore procedure review

## 13. Release profile

Release mode ปิด recovery/debug path มากกว่า pilot และเหมาะกับ manufacturing เท่านั้น

ตรวจ plan:

```powershell
npm run esp32:security:provision -- `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -Port "COM5" `
  -Profile release `
  -SecureBootKeyPath $SecureBootKey `
  -AllowReleaseMode
```

ดำเนินการจริงต้องเพิ่มทั้ง:

```text
-ExecuteIrreversible
-Confirmation "ENABLE_HARDWARE_TRUST_<MAC>"
-AllowReleaseMode
```

ห้ามเปลี่ยนบอร์ด pilot ที่มีสถานะ eFuse ไม่ชัดเจนเป็น release แบบเดาสุ่ม ควรเริ่ม production release profile บนบอร์ดใหม่ revision v3 ที่ผ่าน incoming inspection

## 14. Git workflow

เนื่องจาก S3A ยังไม่ได้ Merge ชุด commit นี้ต้องรวมทั้ง S3A และ S3B:

```powershell
Set-Location "D:\IoT Project\dotwatch"

git switch main
git pull --ff-only origin main
git switch -c security/phase-s3-hardware-trust

npm run test:phase-s3a
npm run test:phase-s3b

git add .gitignore package.json docs scripts services/ota-server esp32/dotwatch_esp32_product

git diff --cached --check
git status --short
git diff --cached --stat

git commit -m "security: add signed OTA and ESP32 hardware trust"
git push -u origin security/phase-s3-hardware-trust
```

ตรวจ staged files ว่าไม่มี private key:

```powershell
git diff --cached --name-only |
  Select-String -Pattern "private|secure-boot-v2\.pem$|flash-encryption-key|sdkconfig\.secure\.local$"
```

ผลต้องไม่มี private key หรือ local sdkconfig

## เอกสารอ้างอิงหลัก

- Espressif ESP32 Secure Boot v2: https://docs.espressif.com/projects/esp-idf/en/latest/esp32/security/secure-boot-v2.html
- Espressif ESP32 Flash Encryption: https://docs.espressif.com/projects/esp-idf/en/latest/esp32/security/flash-encryption.html
- PlatformIO ESP-IDF Secure Boot example: https://github.com/platformio/platform-espressif32/tree/master/examples/espidf-security-secureboot
