# dotWatch Phase S1 — Security Hardening

วันที่จัดทำ: 15 กรกฎาคม 2026

## 1. ขอบเขตของชุดแก้ไข

ชุดนี้แก้ Production Blocker ลำดับแรกโดยไม่เปลี่ยน UX/UI หลักของ Dashboard และไม่เปลี่ยน schema ฐานข้อมูล

### Firmware ESP32 และ ESP8266

- ยกเลิกรหัส Setup AP แบบเดียวกันทุกเครื่อง
- สร้างรหัสสุ่มเฉพาะอุปกรณ์ 14 ตัวอักษรและบันทึกลง NVS/EEPROM configuration
- หมุนรหัสเดิมอัตโนมัติเมื่อพบ `admin`, `dotwatch-setup` หรือ `dotth-setup`
- Local Admin เปลี่ยนจาก PIN ใน URL เป็น `POST /login`
- ใช้ session cookie `HttpOnly; SameSite=Strict`
- session มีอายุ 30 นาทีและต่ออายุเมื่อมีการใช้งาน
- บล็อกการเข้าสู่ระบบ 5 นาทีเมื่อกรอกผิด 5 ครั้งภายใน 5 นาที
- เพิ่ม `POST /logout` และปุ่มออกจากระบบ
- Setup Portal เปิดได้โดยตั้งใจเท่านั้น:
  - อุปกรณ์ใหม่ที่ยังตั้งค่าไม่ครบเปิดอัตโนมัติ
  - อุปกรณ์ที่ตั้งค่าแล้วต้องกด BOOT/FLASH ค้าง 2 วินาที
  - กดค้าง 6 วินาทียังคงเป็น Factory Reset ตามระบบเดิม
- Setup Portal หมดอายุอัตโนมัติภายใน 15 นาที
- ปิด Setup AP เมื่อ commissioning สำเร็จ
- Wi-Fi หลุดบนอุปกรณ์ที่ตั้งค่าแล้วจะไม่เปิด AP เอง
- Portal Preview เปลี่ยนจาก `?pin=` และ `localStorage` เป็น POST login + session cookie

### Backend และ PostgreSQL

- ลบ encryption key ตัวอย่างที่ใช้งานได้จริงออกจาก `.env.example`
- บล็อก known public key เดิมทั้งใน runtime validator และ production checker
- Production บังคับ:

```env
DATABASE_SSL_DISABLED=false
DATABASE_SSL_REJECT_UNAUTHORIZED=true
```

- รองรับ `DATABASE_SSL_CA` สำหรับ private CA bundle
- Migration runner ใช้กฎ TLS เดียวกับ backend runtime
- เพิ่มตัวตรวจอัตโนมัติ:

```powershell
npm run verify:phase-s1:security
npm run test:phase-s1:prod-env
```

## 2. เรื่องสำคัญก่อนนำไฟล์ไปใช้

### ห้ามเปลี่ยน DEVICE_SECRET_ENCRYPTION_KEY ของ Production โดยไม่วางแผน

คีย์นี้ใช้ถอดรหัส Device Secret ที่เก็บอยู่แล้ว การเปลี่ยนคีย์ทันทีทำให้ backend อ่าน secret เดิมไม่ได้

ตรวจค่าใน Render ก่อน deploy:

```text
DEVICE_SECRET_ENCRYPTION_KEY
```

- หากเป็นคีย์สุ่มที่ใช้อยู่จริงและไม่ใช่ค่าด้านล่าง ให้คงค่าเดิมไว้
- หากเป็นคีย์สาธารณะเดิมนี้ ระบบใหม่จะบล็อกการเริ่มทำงาน:

```text
RameT7KiqYLV5vio0fsHKfxkQmh10+N+u4OAveuq5NI=
```

กรณีพบคีย์ดังกล่าว ต้องสำรองฐานข้อมูลและดำเนินการ rotate/re-encrypt Device Secret ก่อน deploy ชุดนี้ ไม่ควรสร้างคีย์ใหม่แล้วแทนทันที

### PostgreSQL CA

Render PostgreSQL หรือผู้ให้บริการบางรายอาจต้องใช้ CA certificate เมื่อเปิด certificate verification หาก connection ล้มเหลวด้วยข้อความ certificate chain ให้กำหนด `DATABASE_SSL_CA` เป็น PEM CA ที่ผู้ให้บริการออกให้ ห้ามแก้กลับเป็น `DATABASE_SSL_REJECT_UNAUTHORIZED=false`

## 3. วิธีติดตั้งไฟล์ Patch บน Windows PowerShell

สมมติ repository อยู่ที่:

```text
D:\IoT Project\dotwatch
```

### 3.1 สำรองและใช้ตัวติดตั้งอัตโนมัติ

แตก ZIP patch แล้วเปิด PowerShell ในโฟลเดอร์ patch:

```powershell
Set-Location "$env:USERPROFILE\Downloads\dotwatch-phase-s1-security-hardening"

powershell -NoProfile -ExecutionPolicy Bypass -File .\apply-dotwatch-phase-s1-security.ps1 `
  -RepoRoot "D:\IoT Project\dotwatch"
```

ตัวติดตั้งจะ:

1. ตรวจว่าโฟลเดอร์เป้าหมายมี `package.json`
2. สำรองเฉพาะไฟล์ที่จะถูกแทนที่ไว้ใน `.dotwatch-backup\phase-s1-<เวลา>`
3. คัดลอกไฟล์ใหม่ตามโครงสร้างเดิม
4. ไม่คัดลอก `node_modules`, `.env`, `dist` หรือ firmware build cache

### 3.2 ตรวจไฟล์หลังวางทับ

```powershell
Set-Location "D:\IoT Project\dotwatch"

git status --short
npm run verify:phase-s1:security
npm run test:phase-s1:prod-env
```

ผลที่ต้องได้:

```text
Phase S1 security verification passed (17 checks).
Phase S1 production environment pass/fail tests completed successfully.
```

## 4. ติดตั้ง dependency และตรวจทั้งระบบ

ใช้ `npm ci` เพื่อยึดตาม lock file:

```powershell
Set-Location "D:\IoT Project\dotwatch"

npm --prefix services/backend ci
npm --prefix apps/dashboard ci
npm --prefix apps/admin ci
npm --prefix apps/mobile ci

npm run check:all
```

### ตัวอย่างรันผ่าน

```text
> dotwatch@0.1.0 check:all
> npm run check:backend && npm run check:dashboard && npm run check:admin && npm run check:mobile

✓ dashboard built
✓ admin built
> tsc --noEmit
```

### ตัวอย่างรันไม่ผ่าน: dependency ยังไม่ติดตั้ง

```text
'vite' is not recognized as an internal or external command
```

แก้ด้วย:

```powershell
npm --prefix apps/dashboard ci
npm --prefix apps/admin ci
```

### ตัวอย่างรันไม่ผ่าน: lock file ไม่ตรง

```text
npm error `npm ci` can only install packages when package.json and package-lock.json are in sync
```

อย่าใช้ `npm install --force` ทันที ให้ตรวจ diff ของ `package.json` และ `package-lock.json` ก่อน

## 5. ตั้งค่า Render Backend

### 5.1 ค่าที่ต้องมี

ใน Render > Backend Service > Environment:

```env
NODE_ENV=production
DATABASE_URL=<Render PostgreSQL URL>
DATABASE_SSL_DISABLED=false
DATABASE_SSL_REJECT_UNAUTHORIZED=true
DATABASE_SSL_CA=
DEVICE_SECRET_ENCRYPTION_KEY=<คีย์เดิมที่ปลอดภัย หรือคีย์สุ่มสำหรับระบบใหม่>
```

สร้างคีย์ใหม่สำหรับระบบใหม่เท่านั้น:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 5.2 ตรวจไฟล์ environment ก่อน deploy

สร้างไฟล์ local สำหรับตรวจเท่านั้น และอย่า commit:

```powershell
Copy-Item .\services\backend\.env.production.example .\services\backend\.env.production.local
notepad .\services\backend\.env.production.local
```

จากนั้นตรวจ:

```powershell
npm run env:prod:check -- --file .\services\backend\.env.production.local
```

### ตัวอย่างรันผ่าน

```text
Production environment check passed.
Generated key helper: <random-key>
```

### ตัวอย่างรันไม่ผ่าน: ใช้ public encryption key เดิม

```text
Production environment check failed:
- DEVICE_SECRET_ENCRYPTION_KEY must not be a placeholder or all-zero key
```

### ตัวอย่างรันไม่ผ่าน: ปิดการตรวจ certificate

```text
Production environment check failed:
- DATABASE_SSL_REJECT_UNAUTHORIZED must be true in production
```

### ตัวอย่างรันไม่ผ่าน: CA chain ไม่ถูกต้องระหว่างเชื่อม DB

```text
SELF_SIGNED_CERT_IN_CHAIN
unable to verify the first certificate
```

แนวทางแก้:

1. ใช้ Render Internal Database URL เมื่อ service และ database อยู่ region/network เดียวกัน
2. ใส่ CA PEM ที่ถูกต้องใน `DATABASE_SSL_CA`
3. ตรวจว่า PEM เก็บ newline ถูกต้อง
4. คง `DATABASE_SSL_REJECT_UNAUTHORIZED=true`

## 6. Build Firmware

### 6.1 ESP32

```powershell
Set-Location "D:\IoT Project\dotwatch\esp32\dotwatch_esp32_product"
python -m platformio run
```

Upload:

```powershell
python -m platformio run -t upload
python -m platformio device monitor -b 115200
```

### 6.2 ESP8266

```powershell
Set-Location "D:\IoT Project\dotwatch\esp8266\dotwatch_esp8266_product"
python -m platformio run
python -m platformio run -t upload
python -m platformio device monitor -b 115200
```

### ตัวอย่างรันผ่าน

```text
========================= [SUCCESS] Took ... seconds =========================
```

### ตัวอย่างรันไม่ผ่าน: PlatformIO ไม่พบ

```text
python: No module named platformio
```

ติดตั้ง:

```powershell
python -m pip install --upgrade platformio
python -m platformio --version
```

### ตัวอย่างรันไม่ผ่าน: COM port ถูกใช้งาน

```text
PermissionError: Access is denied
```

แก้โดยปิด Serial Monitor/Arduino IDE ตัวอื่น แล้วตรวจ port:

```powershell
python -m platformio device list
python -m platformio run -t upload --upload-port COM5
```

## 7. Commissioning อุปกรณ์หลัง Flash

### อุปกรณ์ใหม่หรือ Factory Reset

1. เปิด Serial Monitor ที่ 115200
2. อ่านค่า:

```text
Setup AP started. SSID=dotWatch-Setup-XXXXXX
Setup AP Password: <รหัสสุ่ม 14 ตัว>
Setup AP URL: http://192.168.4.1
```

3. เชื่อมต่อ Setup AP ด้วยรหัสเฉพาะเครื่อง
4. เปิด `http://192.168.4.1`
5. เข้าสู่ Local Admin ด้วยรหัสเดียวกัน
6. ตั้ง Wi-Fi, Backend URL, Device Code และ Device Secret
7. เมื่อเชื่อม Wi-Fi และ config ครบ ระบบจะปิด Setup AP อัตโนมัติ
8. เข้าเมนู Security แล้วเปลี่ยน Local Admin PIN เป็นอย่างน้อย 8 ตัวอักษร

### อุปกรณ์ที่ตั้งค่าแล้วแต่ต้องแก้ Wi-Fi

1. เปิดอุปกรณ์
2. กด BOOT บน ESP32 หรือ FLASH บน ESP8266 ค้างประมาณ 2 วินาทีแล้วปล่อย
3. Setup AP จะเปิดสูงสุด 15 นาที
4. ใช้รหัสเฉพาะเครื่องจากฉลากหรือ Serial Monitor

### กรณี Wi-Fi หลุด

ระบบจะพยายาม reconnect แต่จะไม่เปิด Setup AP เอง นี่เป็นพฤติกรรมที่ตั้งใจเพื่อป้องกันอุปกรณ์ Outdoor เปิดจุดตั้งค่าโดยไม่ตั้งใจ

### ตัวอย่างเข้าสู่ระบบไม่ผ่าน

หลังกรอก PIN ผิด 5 ครั้ง:

```text
เข้าสู่ระบบผิดหลายครั้ง กรุณารอ 5 นาทีแล้วลองใหม่
```

รอครบ 5 นาที หรือ restart อุปกรณ์ในพื้นที่ที่ควบคุมได้ ห้ามลดค่า lockout ใน production

## 8. Portal Preview

Preview ไม่ส่ง PIN ผ่าน URL และไม่บันทึก PIN ลง `localStorage` แล้ว

ESP32:

```powershell
Set-Location "D:\IoT Project\dotwatch\esp32\dotwatch_esp32_product\portal-preview"
$env:ESP32_TARGET="http://192.168.1.212"
npm run dev
```

ESP8266:

```powershell
Set-Location "D:\IoT Project\dotwatch\esp8266\dotwatch_esp8266_product\portal-preview"
$env:ESP8266_TARGET="http://192.168.1.213"
npm run dev
```

กรอก Local Admin PIN ในแถบ Preview ระบบจะส่ง POST login และรับ session cookie ผ่าน proxy

## 9. Rollback

หากยังไม่ commit:

```powershell
Set-Location "D:\IoT Project\dotwatch"
git restore --worktree --staged .
```

หรือกู้เฉพาะไฟล์จากโฟลเดอร์ backup ที่ apply script แจ้งไว้

หาก commit แล้วแต่ยังไม่ push:

```powershell
git reset --hard HEAD~1
```

หาก push แล้ว ให้ใช้ revert เพื่อรักษาประวัติ:

```powershell
git revert <commit-sha>
git push
```

## 10. งานที่ยังไม่รวมใน Phase S1 ชุดนี้

- Digital signature สำหรับ OTA firmware
- ESP32 Secure Boot และ Flash Encryption
- WebSocket connection/origin/rate hardening
- Shared device-auth rate limiter
- Dependency vulnerability upgrade
- Production static-site Docker/Render deployment

ควรทำต่อเป็น Phase S1.2 และ S2 หลังทดสอบชุดนี้บนบอร์ดจริง
