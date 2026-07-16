# dotWatch Phase S3A — Signed OTA และ Anti-Rollback

## เป้าหมาย

Phase S3A ทำให้ ESP32 ยอมรับ firmware เฉพาะ release ที่ลงลายเซ็น ECDSA P-256/SHA-256 ด้วย private key ของเจ้าของระบบ และปฏิเสธ build ที่ต่ำกว่าหรือเท่ากับ anti-rollback floor ที่ยืนยันแล้ว

> Phase นี้ยังไม่เผา eFuse และไม่เปิด ESP32 Secure Boot/Flash Encryption; งานดังกล่าวอยู่ Phase S3B

## สิ่งที่เปลี่ยน

- OTA release ใช้ canonical payload เวอร์ชัน `dotwatch-ota-release-v1`
- Publisher ลงลายเซ็น metadata ที่สำคัญทั้งหมด รวม SHA-256, size, model, channel, build, flags, publishedAt และ hash ของ release notes
- OTA server ตรวจ public-key fingerprint, key ID และ signature ของทุก release ก่อนเริ่มฟัง port ใน production
- OTA server ส่ง signature metadata ให้ device
- ESP32 ตรวจ ECDSA signature ก่อนยอมรับ release และยังตรวจ SHA-256 ของ binary หลังดาวน์โหลด
- ESP32 บันทึก anti-rollback floor หลัง firmware ใหม่ผ่าน rollback confirmation เท่านั้น
- Publisher ปฏิเสธ build ที่ไม่เพิ่มขึ้น
- Private key ถูกบังคับให้อยู่นอก repository

## ลำดับติดตั้งที่ปลอดภัย

1. แตก Direct Overlay ลง repository
2. รันทดสอบ S1/S2/S3A
3. สร้าง signing key เฉพาะระบบหนึ่งครั้ง
4. Commit public key/header/metadata เท่านั้น
5. Build และ flash firmware 1.3.0 ลงอุปกรณ์ pilot ผ่านสาย USB ก่อน
6. Sign manifest/release
7. ตั้ง Render environment
8. Deploy OTA server
9. ทดสอบ pilot ก่อน rollout

ห้าม Deploy OTA server หลังลง overlay แต่ก่อนสร้าง key และ sign manifest เพราะ production server จะ fail closed ตามการออกแบบ

## 1. วางไฟล์

```powershell
$ZipFile = "$env:USERPROFILE\Downloads\dotwatch-phase-s3a-signed-ota-direct-to-dotwatch.zip"
$RepoRoot = "D:\IoT Project\dotwatch"

Expand-Archive -LiteralPath $ZipFile -DestinationPath $RepoRoot -Force
Set-Location $RepoRoot
```

## 2. ตรวจ source

```powershell
npm run verify:phase-s1:security
npm run test:phase-s2
npm run test:phase-s3a
npm --prefix services/ota-server run check
```

ผลผ่าน:

```text
Phase S3A security verification passed (11 checks).
Phase S3A release signing tests passed.
Phase S3A OTA server integration tests passed.
```

## 3. สร้าง signing key ครั้งแรก

```powershell
Set-Location "D:\IoT Project\dotwatch"

npm run ota:key:generate -- `
  --key-id "dotwatch-release-2026-01"
```

ไฟล์ที่ได้:

```text
Private key: C:\Users\<USER>\.dotwatch\ota-signing\dotwatch-release-2026-01.private.pem
Public key : services\ota-server\keys\release-signing.public.pem
Metadata   : services\ota-server\keys\release-signing-key.json
Header     : esp32\dotwatch_esp32_product\include\OtaSigningKey.h
```

ห้าม commit หรืออัปโหลด private key ไป Render

สำรอง private key แบบเข้ารหัสอย่างน้อย 2 แห่ง หาก private key สูญหายจะไม่สามารถออก firmware ใหม่ให้ device ที่ trust key เดิมได้โดยไม่ใช้ขั้นตอน key rotation

### ตัวอย่างไม่ผ่าน: private key อยู่ใน repository

```text
Private signing key must be stored outside the dotwatch repository
```

แก้โดยใช้ path ใต้ `$env:USERPROFILE\.dotwatch\ota-signing`

### ตัวอย่างไม่ผ่าน: key มีอยู่แล้ว

```text
Private key already exists ... Use --force only for an intentional rotation.
```

อย่าใช้ `--force` กับ production key โดยไม่ทำแผน rotation

## 4. ตรวจว่า private key ไม่ถูก stage

```powershell
git status --short
git check-ignore -v "$env:USERPROFILE\.dotwatch\ota-signing\dotwatch-release-2026-01.private.pem"
```

Private key อยู่นอก repository จึงไม่ควรปรากฏใน `git status`

## 5. Build และ flash trust-chain firmware ผ่าน USB

```powershell
Set-Location "D:\IoT Project\dotwatch\esp32\dotwatch_esp32_product"
python -m platformio run
python -m platformio device list
python -m platformio run -t upload --upload-port COM5
python -m platformio device monitor -b 115200 --port COM5
```

Firmware baseline:

```text
Version: esp32-product-1.3.0-signed-ota
Build  : 1300
```

ต้อง flash firmware นี้ผ่าน USB ให้ pilot device ก่อน เพราะ firmware เก่าไม่ตรวจ signed manifest และยังไม่มี embedded public key ใหม่

## 6. Sign manifest เดิม

ใช้เมื่อจะคง release เก่าใน manifest:

```powershell
Set-Location "D:\IoT Project\dotwatch"

npm run ota:manifest:sign -- `
  --private-key "$env:USERPROFILE\.dotwatch\ota-signing\dotwatch-release-2026-01.private.pem" `
  --key-id "dotwatch-release-2026-01"
```

สคริปต์จะลงลายเซ็น release ที่ยัง unsigned และไม่แก้ binary

## 7. Publish firmware ใหม่แบบ signed

```powershell
Set-Location "D:\IoT Project\dotwatch"

npm run ota:publish:esp32 -- `
  --file ".\esp32\dotwatch_esp32_product\.pio\build\esp32dev\firmware.bin" `
  --version "esp32-product-1.3.1-signed-ota" `
  --build 1301 `
  --model "esp32_dht3" `
  --channel "stable" `
  --private-key "$env:USERPROFILE\.dotwatch\ota-signing\dotwatch-release-2026-01.private.pem" `
  --key-id "dotwatch-release-2026-01" `
  --notes "Signed OTA pilot release"
```

### ตัวอย่างผ่าน

```text
Signed firmware release published locally
Build       : 1301
Key ID      : dotwatch-release-2026-01
```

### ตัวอย่างไม่ผ่าน: build ซ้ำหรือลดลง

```text
Anti-rollback policy rejected build 1300; latest esp32_dht3/stable build is 1300
```

แก้ด้วยการเพิ่ม `DOTWATCH_FIRMWARE_BUILD` และ `--build` เป็นเลขที่สูงกว่าเท่านั้น ห้ามลด floor ใน production

## 8. Render OTA Environment

```env
NODE_ENV=production
OTA_REQUIRE_SIGNED_RELEASES=true
OTA_RELEASE_KEY_ID=dotwatch-release-2026-01
OTA_RELEASE_PUBLIC_KEY_FILE=keys/release-signing.public.pem
OTA_RELEASE_PUBLIC_KEY_SHA256=<ค่าจาก release-signing-key.json>
```

ไม่ต้องและห้ามตั้ง `OTA_SIGNING_PRIVATE_KEY_FILE` บน Render; การ sign ต้องเกิด offline/release workstation เท่านั้น

### ตัวอย่าง server ไม่ผ่าน: manifest ยัง unsigned

```text
OTA manifest release signature verification failed
```

แก้โดยรัน `npm run ota:manifest:sign` แล้ว commit manifest ใหม่

### ตัวอย่าง server ไม่ผ่าน: fingerprint ไม่ตรง

```text
OTA release public key fingerprint mismatch
```

ตรวจว่า Render fingerprint, public PEM และ `OtaSigningKey.h` มาจาก key generation รอบเดียวกัน

## 9. Git

```powershell
Set-Location "D:\IoT Project\dotwatch"
git switch main
git pull --ff-only origin main
git switch -c security/phase-s3a-signed-ota

npm run test:phase-s3a
npm run test:phase-s2
npm --prefix services/ota-server run check

git add .gitignore package.json docs scripts services/ota-server `
  esp32/dotwatch_esp32_product/include/FirmwareVersion.h `
  esp32/dotwatch_esp32_product/include/OtaSigningKey.h `
  esp32/dotwatch_esp32_product/src/ota/OtaManager.cpp `
  esp32/dotwatch_esp32_product/src/ota/OtaManager.h

git diff --cached --check
git status --short
git commit -m "security: add signed OTA and anti-rollback"
git push -u origin security/phase-s3a-signed-ota
```

ก่อน commit ตรวจว่าไม่มีไฟล์ `*.private.pem`, `.env` หรือ private key ใดถูก stage

## Rollout

- USB flash pilot 1–3 เครื่อง
- ตรวจ signed check และ rejected tamper cases
- OTA pilot 5%
- รอ telemetry และ reboot confirmation
- 20% → 50% → 100%

ห้ามเปิด auto-install ใน release แรกของ trust-chain
