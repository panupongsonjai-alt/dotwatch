# dotWatch Security Patch 1 - Frontend Hardening

## สถานะ

Patch นี้ทำจากไฟล์ล่าสุด `dotwatch-dashboard.zip` ที่ส่งมา ซึ่งเป็นฝั่ง Dashboard / Frontend

## สิ่งที่แก้แล้ว

### 1. API Client Security

ไฟล์:

```text
src/services/api.js
```

ปรับเพิ่ม:

```text
- บังคับ path ต้องขึ้นต้นด้วย /api/
- ไม่อนุญาต absolute URL ใน apiFetch
- ป้องกัน HTTPS page เรียก HTTP API ที่ไม่ใช่ localhost
- เพิ่ม request timeout ผ่าน VITE_REQUEST_TIMEOUT_MS
- เพิ่ม AbortController
- เพิ่ม X-Request-ID
- เพิ่ม X-dotWatch-Client
- ตั้ง credentials: omit
- ตั้ง cache: no-store
- ถ้าเจอ 401 จะ force refresh Firebase token และ retry 1 ครั้ง
- ถ้ายัง 401 จะ dispatch dotwatchUnauthorized
- ลด console error ใน production
```

### 2. Realtime WebSocket Security

ไฟล์:

```text
src/services/realtime.js
```

ปรับเพิ่ม:

```text
- จำกัด reconnect สูงสุด 8 ครั้ง
- ถ้า WebSocket ปิดด้วย code 1008 จะถือว่า auth ถูก reject
- ส่ง event dotwatchUnauthorized
- ไม่พยายาม reconnect ต่อเมื่อ auth ถูก reject
```

### 3. Session / Storage Security

ไฟล์:

```text
src/utils/clientSecurity.js
src/App.jsx
```

เพิ่ม:

```text
- ล้าง key ที่เสี่ยง เช่น secret / token / password / privateKey เฉพาะ key ของ dotWatch
- ไม่ลบ Firebase internal key
- ล้าง active page / selected device เมื่อ logout หรือ unauthorized
- ติดตั้ง client security guard ตอน App start
- รองรับ dotwatchSecurityReset event
```

### 4. Environment / Git Hygiene

ไฟล์:

```text
.gitignore
.env.example
.env.local.example
.env.production.example
```

ปรับเพิ่ม:

```text
- ignore .env จริงทั้งหมด
- ignore .git ใน exported zip
- ignore node_modules
- เก็บเฉพาะ env example
```

## สิ่งที่ Patch นี้ยังไม่ได้ทำ

เพราะ ZIP ล่าสุดเป็น Dashboard เท่านั้น ยังไม่ได้มี backend code ในชุดนี้ จึงยังไม่ได้แก้:

```text
- Backend user_id isolation
- Backend role permission
- Backend audit log
- Device secret hash / lockout
- Database policy / migration
```

## สิ่งที่ควรทำต่อ

ส่ง ZIP ของ backend ล่าสุดมา แล้วทำ Security Patch 2:

```text
1. ตรวจ auth middleware ทุก route
2. ล็อก query ทุกจุดด้วย user_id
3. เพิ่ม role owner/admin/viewer
4. เพิ่ม audit log
5. เพิ่ม device secret lockout
6. เพิ่ม migration สำหรับ security columns/index
```
