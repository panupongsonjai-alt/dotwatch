# dotWatch Phase S2 — Network, Ingest และ OTA Hardening

## ขอบเขต

Phase S2 แก้ความเสี่ยงที่สามารถนำขึ้น production ได้โดยไม่เปลี่ยน firmware binary และไม่แตะ UX/UI ของ Dashboard/Admin ได้แก่:

1. WebSocket connection/payload/message-rate protection
2. Device ingest และ device-auth abuse protection
3. OTA request/authentication rate limiting
4. OTA device-to-model/channel authorization
5. OTA report audit-field integrity
6. HTTP timeout และ socket controls ของ OTA server

Phase นี้ยัง **ไม่ใช่ OTA Digital Signature / ESP32 Secure Boot / Flash Encryption** ซึ่งจะทำใน Phase S3 หลังระบบ OTA server มี authorization boundary ที่ชัดเจนแล้ว

---

## 1. รายการไฟล์สำคัญที่เปลี่ยน

### Backend

- `services/backend/src/server.js`
- `services/backend/src/config/env.js`
- `services/backend/src/middlewares/authDevice.js`
- `services/backend/src/middlewares/deviceIngestRateLimit.js`
- `services/backend/src/routes/ingest.routes.js`
- `services/backend/src/security/fixedWindowLimiter.js`
- `services/backend/.env.example`
- `services/backend/.env.production.example`

### OTA Server

- `services/ota-server/server.mjs`
- `services/ota-server/lib/fixed-window-limiter.mjs`
- `services/ota-server/.env.example`
- `services/ota-server/README.md`
- `services/ota-server/render.yaml`

### Verification

- `scripts/verify-phase-s2-security.mjs`
- `scripts/test-phase-s2-rate-limiters.mjs`
- `scripts/test-phase-s2-ota-security.mjs`

---

## 2. WebSocket ที่แก้ไข

เดิม Backend รับ WebSocket connection ก่อน แล้วค่อยรอ subscribe token ทำให้ connection ที่ยังไม่ authenticate ใช้ทรัพยากรได้ง่าย

Phase S2 เปลี่ยนเป็น `WebSocketServer({ noServer: true })` และตรวจ HTTP Upgrade ก่อนรับ socket:

- ตรวจ path ตาม `WS_PATH`
- ตรวจ browser `Origin` จาก allowlist เดียวกับ `CORS_ORIGIN`
- จำกัด connection ทั้งระบบ
- จำกัด connection ต่อ IP
- จำกัด unauthenticated connection ต่อ IP
- จำกัด authenticated connection ต่อ Firebase user
- จำกัด payload ด้วย `maxPayload`
- ปิด `perMessageDeflate` เพื่อลด compression pressure
- บังคับ message แรกเป็น `subscribe`
- ปฏิเสธ binary และ message type ที่ไม่รองรับ
- จำกัดจำนวน message ต่อ socket ต่อช่วงเวลา
- terminate client ที่อ่าน broadcast ช้าและมี `bufferedAmount` สูง
- เก็บ security counters ใน ops heartbeat summary

ค่าที่เพิ่ม:

```env
WS_PATH=/
WS_SUBSCRIBE_TIMEOUT_MS=15000
WS_MAX_PAYLOAD_BYTES=16384
WS_MAX_TOTAL_CLIENTS=2000
WS_MAX_CLIENTS_PER_IP=20
WS_MAX_UNAUTHENTICATED_CLIENTS_PER_IP=5
WS_MAX_CLIENTS_PER_USER=5
WS_MESSAGE_RATE_WINDOW_MS=10000
WS_MAX_MESSAGES_PER_WINDOW=30
WS_MAX_BUFFERED_BYTES=1048576
```

ค่า `WS_PATH=/` เข้ากันได้กับ Dashboard และ Mobile ปัจจุบันโดยไม่ต้องเปลี่ยน client URL

---

## 3. Device ingest และ authentication

### Global ingest limiter

ลดค่าเริ่มต้นจาก 50,000 เป็น 12,000 requests/minute ต่อ IP:

```env
INGEST_RATE_LIMIT_PER_MINUTE=12000
```

ค่านี้รองรับประมาณ 1,000 อุปกรณ์หลัง NAT เดียวกันที่ส่งทุก 5 วินาที:

```text
1000 devices × 12 requests/minute = 12,000 requests/minute
```

หากอุปกรณ์ส่งทุก 10 วินาที จำนวนจริงจะประมาณ 6,000 requests/minute

### Per-device ingest limiter

เพิ่ม limiter หลังตรวจ Device Secret สำเร็จ:

```env
INGEST_DEVICE_RATE_LIMIT_PER_MINUTE=180
```

รองรับ device ที่ส่งประมาณ 3 requests/second แต่หยุด device ที่ loop ผิดปกติไม่ให้ใช้ global capacity ทั้งหมด

### Failed-auth limiter

เดิมใช้ `Map` ตามคู่ device/IP และอาจโตโดยไม่มีขอบเขต Phase S2 เปลี่ยนเป็น fixed-window limiter ที่:

- จำกัดตาม IP
- จำกัดตาม Device Code
- ตรวจ lock ก่อน query DB และก่อน bcrypt
- จำกัดจำนวน entries และลบ entry เก่า
- ตอบ `429` พร้อม `Retry-After`

```env
DEVICE_AUTH_FAILURE_WINDOW_MS=300000
DEVICE_AUTH_MAX_FAILURES_PER_IP=30
DEVICE_AUTH_MAX_FAILURES_PER_DEVICE=10
DEVICE_AUTH_FAILURE_TRACKER_MAX_ENTRIES=10000
```

> Limiter ใน Phase S2 เป็น per-process memory limiter หาก Render ขยายหลาย instance ต้องย้าย counter ไป Redis หรือ shared store ใน Phase ถัดไป

---

## 4. OTA Server

### Device registry แบบมี scope

Production ต้องเปลี่ยนจาก:

```env
OTA_DEVICE_SECRETS_JSON={"DW-DEVICE":"secret"}
```

เป็น:

```env
OTA_DEVICE_REGISTRY_JSON={"DW-DEVICE":{"secret":"secret","modelKeys":["esp32_dht3"],"channels":["stable"]}}
```

และตั้ง:

```env
NODE_ENV=production
OTA_ALLOW_UNREGISTERED_DEVICES=false
OTA_REQUIRE_DEVICE_SCOPE=true
```

เมื่อ scope เปิดใช้งาน:

- `/check` ตรวจว่า device ขอ model/channel ที่ได้รับอนุญาต
- `/download/:filename` โหลด manifest แล้วตรวจ model/channel ของไฟล์อีกครั้ง
- Device ที่รู้ filename แต่ไม่ได้รับ scope จะ download ไม่ได้

### Rate limiting

```env
OTA_RATE_LIMIT_WINDOW_MS=60000
OTA_RATE_LIMIT_PER_IP=120
OTA_RATE_LIMIT_PER_DEVICE=60
OTA_AUTH_FAILURE_LIMIT_PER_IP=20
OTA_AUTH_FAILURE_LIMIT_PER_DEVICE=10
OTA_RATE_LIMIT_MAX_ENTRIES=10000
```

### Report integrity

เดิม payload อยู่ท้าย object และสามารถส่ง:

```json
{
  "deviceCode": "SPOOFED",
  "remoteAddress": "SPOOFED",
  "receivedAt": "SPOOFED"
}
```

เพื่อเขียนทับ audit field ได้

Phase S2 ใช้ field whitelist และกำหนดค่า authoritative จาก server เท่านั้น:

- `receivedAt`
- `deviceCode`
- `remoteAddress`

พร้อมจำกัดขนาด body:

```env
OTA_MAX_BODY_BYTES=16384
```

### HTTP controls

- request timeout: 30 วินาที
- header timeout: 15 วินาที
- keep-alive timeout: 5 วินาที
- สูงสุด 100 requests ต่อ socket

---

## 5. วิธีวางไฟล์

ไฟล์ ZIP เป็น Direct Overlay ไม่มีโฟลเดอร์ครอบชั้นนอก

สำรองก่อน:

```powershell
Set-Location "D:\IoT Project"

Copy-Item `
  -LiteralPath ".\dotwatch" `
  -Destination ".\dotwatch-backup-before-phase-s2" `
  -Recurse `
  -Force
```

แตกไฟล์:

```powershell
$ZipFile = "$env:USERPROFILE\Downloads\dotwatch-phase-s2-network-ota-hardening-direct-to-dotwatch.zip"
$RepoRoot = "D:\IoT Project\dotwatch"

Expand-Archive `
  -LiteralPath $ZipFile `
  -DestinationPath $RepoRoot `
  -Force
```

ตรวจรายการไฟล์:

```powershell
Set-Location $RepoRoot
git status --short
```

---

## 6. ทดสอบบนเครื่อง

```powershell
Set-Location "D:\IoT Project\dotwatch"

npm run verify:phase-s1:security
npm run test:phase-s1:prod-env
npm run check:backend
npm --prefix services/ota-server run check
npm run test:phase-s2
```

### ตัวอย่างผ่าน

```text
Phase S1 security verification passed (17 checks).
Phase S1 production environment pass/fail tests completed successfully.
Phase S2 security verification passed (12 checks).
Phase S2 limiter tests passed.
PASS: OTA rejects missing credentials
PASS: OTA rejects unauthorized model scope
PASS: OTA accepts authorized model/channel scope
PASS: OTA report cannot spoof authoritative audit fields
PASS: OTA per-device rate limit returns 429
Phase S2 OTA security integration tests passed.
```

### ตัวอย่างไม่ผ่าน: ไฟล์ไม่ครบ

```text
FAIL: WebSocket connection ceilings are incomplete
```

แก้โดยแตก ZIP ลง `D:\IoT Project\dotwatch` โดยตรงอีกครั้ง ห้ามแตกลง `dotwatch\dotwatch`

### ตัวอย่างไม่ผ่าน: syntax

```text
SyntaxError: Unexpected token
```

ตรวจไฟล์ที่แก้เอง:

```powershell
git diff --check
node --check .\services\backend\src\server.js
node --check .\services\ota-server\server.mjs
```

### ตัวอย่างไม่ผ่าน: OTA production registry เดิม

```text
OTA device DW-... must define modelKeys and channels when OTA_REQUIRE_DEVICE_SCOPE=true
```

แปลว่า Render ยังใช้ `OTA_DEVICE_SECRETS_JSON` แบบเดิม หรือ registry entry ไม่มี scope ให้เพิ่ม `OTA_DEVICE_REGISTRY_JSON` ก่อน deploy

### ตัวอย่างไม่ผ่าน: unregistered devices ใน production

```text
OTA_ALLOW_UNREGISTERED_DEVICES must be false in production
```

ตั้งใน Render:

```env
OTA_ALLOW_UNREGISTERED_DEVICES=false
```

### ตัวอย่าง rate limit ทำงาน

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 60
```

นี่เป็นผลที่ถูกต้องเมื่อ client เกิน limit ไม่ใช่ server crash

---

## 7. ลำดับ Deploy ที่ปลอดภัย

### 7.1 OTA Server — ตั้ง Environment ก่อน Deploy

ใน Render OTA service เพิ่ม/แก้:

```env
NODE_ENV=production
PUBLIC_BASE_URL=https://<ota-service>.onrender.com
OTA_ALLOW_UNREGISTERED_DEVICES=false
OTA_REQUIRE_DEVICE_SCOPE=true
OTA_DEVICE_REGISTRY_JSON={"<DEVICE_CODE>":{"secret":"<DEVICE_SECRET>","modelKeys":["esp32_dht3"],"channels":["stable"]}}
OTA_DEVICE_SECRETS_JSON={}
OTA_MAX_BODY_BYTES=16384
OTA_RATE_LIMIT_WINDOW_MS=60000
OTA_RATE_LIMIT_PER_IP=120
OTA_RATE_LIMIT_PER_DEVICE=60
OTA_AUTH_FAILURE_LIMIT_PER_IP=20
OTA_AUTH_FAILURE_LIMIT_PER_DEVICE=10
OTA_RATE_LIMIT_MAX_ENTRIES=10000
```

กรณีมีหลายอุปกรณ์:

```json
{
  "DW-AAAAAA": {
    "secret": "secret-a",
    "modelKeys": ["esp32_dht3"],
    "channels": ["stable"]
  },
  "DW-BBBBBB": {
    "secret": "secret-b",
    "modelKeys": ["esp32_dht3"],
    "channels": ["stable"]
  }
}
```

JSON ต้องอยู่บรรทัดเดียวใน Render Environment Variable

### 7.2 Backend — เพิ่ม Environment

```env
INGEST_RATE_LIMIT_PER_MINUTE=12000
INGEST_DEVICE_RATE_LIMIT_PER_MINUTE=180
DEVICE_AUTH_FAILURE_WINDOW_MS=300000
DEVICE_AUTH_MAX_FAILURES_PER_IP=30
DEVICE_AUTH_MAX_FAILURES_PER_DEVICE=10
DEVICE_AUTH_FAILURE_TRACKER_MAX_ENTRIES=10000
WS_PATH=/
WS_SUBSCRIBE_TIMEOUT_MS=15000
WS_MAX_PAYLOAD_BYTES=16384
WS_MAX_TOTAL_CLIENTS=2000
WS_MAX_CLIENTS_PER_IP=20
WS_MAX_UNAUTHENTICATED_CLIENTS_PER_IP=5
WS_MAX_CLIENTS_PER_USER=5
WS_MESSAGE_RATE_WINDOW_MS=10000
WS_MAX_MESSAGES_PER_WINDOW=30
WS_MAX_BUFFERED_BYTES=1048576
```

### 7.3 Deploy OTA ก่อน Backend

1. ตั้ง OTA registry ให้ครบ
2. Deploy OTA
3. ตรวจ `/health`
4. ทดสอบ firmware check ด้วยอุปกรณ์จริงหนึ่งเครื่อง
5. Deploy Backend
6. ตรวจ Dashboard realtime และ ingest

---

## 8. Smoke test หลัง Deploy

### Backend

```powershell
Invoke-RestMethod "https://dotwatch-backend.onrender.com/health/ready"
```

Dashboard ควร:

- เชื่อม WebSocket ได้
- ได้ message `subscribed`
- realtime ยังอัปเดต
- reconnect ได้หลัง Render restart

### OTA check แบบผ่าน

```powershell
$Headers = @{
  "x-device-code" = "<DEVICE_CODE>"
  "x-device-secret" = "<DEVICE_SECRET>"
  "x-model-key" = "esp32_dht3"
  "x-firmware-version" = "esp32-product-current"
}

Invoke-RestMethod `
  -Uri "https://<ota-service>.onrender.com/api/device-firmware/check?modelKey=esp32_dht3&channel=stable&currentBuild=0" `
  -Headers $Headers
```

### OTA scope แบบไม่ผ่านตามที่ตั้งใจ

```powershell
Invoke-RestMethod `
  -Uri "https://<ota-service>.onrender.com/api/device-firmware/check?modelKey=not-authorized&channel=stable&currentBuild=0" `
  -Headers $Headers
```

ควรได้ HTTP 403:

```text
Device is not authorized for this firmware scope
```

---

## 9. Rollback

ถ้า Backend realtime มีปัญหา:

1. Rollback Render backend ไป commit ก่อน Phase S2
2. ค่า environment ใหม่สามารถคงไว้ได้ เพราะ code เก่าจะไม่อ่านค่า WS ใหม่

ถ้า OTA startup ไม่ผ่านเพราะ registry:

1. แก้ `OTA_DEVICE_REGISTRY_JSON` ให้ครบ scope
2. ไม่แนะนำให้ปิด `OTA_REQUIRE_DEVICE_SCOPE` ใน production
3. กรณีฉุกเฉินให้ rollback service commit แทนการเปิด unregistered devices

---

## 10. งานถัดไป

Phase S3:

1. Ed25519/ECDSA signed OTA manifest
2. Public-key verification ใน ESP32 ก่อนติดตั้ง firmware
3. Signing key แยกจาก Render และ repository
4. Anti-rollback
5. ESP32 Secure Boot และ Flash Encryption สำหรับ manufacturing build
