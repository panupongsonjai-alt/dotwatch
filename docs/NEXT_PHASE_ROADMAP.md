# dotWatch Next Phase Roadmap

## Phase 1 - Production hardening

เป้าหมาย: Render + Dashboard + Backend ปลอดภัยและ deploy ซ้ำได้

งานหลัก:

- ตั้ง `NODE_ENV=production` บน Render
- ตั้ง `DEV_AUTH_BYPASS=false` หรือไม่ใส่ตัวแปรนี้บน Render
- ตั้ง `CORS_ORIGIN` เป็น URL จริงเท่านั้น
- Rotate Firebase Admin private key เก่าที่เคยอยู่ในไฟล์ตัวอย่าง
- สร้าง `DEVICE_SECRET_ENCRYPTION_KEY` ใหม่ด้วยคำสั่ง:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

- ย้ายค่าทั้งหมดไปไว้ใน Render Environment Variables
- เพิ่ม audit log สำหรับการ view/reset device secret

## Phase 2 - Raspberry Pi Gateway MVP

เป้าหมาย: Raspberry Pi ใช้งานเป็น gateway จริงได้

งานหลัก:

- Config UI ตั้งค่า API URL, Device Code, Device Secret, Sensor Source ได้
- รองรับ Modbus TCP อ่านต่อเนื่อง 20 ค่า
- รองรับ Modbus RTU USB-RS485
- มี mapping `metric_1` ถึง `metric_20`
- เพิ่ม Test Read และ Test Send ใน Config UI
- ติดตั้ง systemd service ให้ restart อัตโนมัติ
- เพิ่ม offline queue เมื่อ internet/API ล่ม
- เพิ่ม retry/backoff เพื่อไม่ยิง API รัว
- เพิ่ม log rotation

## Phase 3 - Dashboard UX/UI consistency

เป้าหมาย: Dashboard ใช้งานง่ายและหน้าตาเป็นระบบเดียวกัน

งานหลัก:

- รวม design token ให้เป็นแหล่งเดียว
- จัด CSS เป็น design system / components / pages
- Interface Preferences เปลี่ยนแล้วมีผลทุกหน้า
- StatCard, PageHeader, DeviceCard, Device Map ใช้ pattern เดียวกัน
- ลดไฟล์ CSS patch ซ้ำ
- ปรับ loading skeleton และ empty state

## Phase 4 - Data scale and retention

เป้าหมาย: รองรับ device จำนวนมากโดย database ไม่โตเกินควบคุม

งานหลัก:

- ตัดสินใจ retention policy:
  - raw 10 วินาที เก็บ 7-30 วัน
  - aggregate 1 นาที / 1 ชั่วโมง เก็บ 1 ปี
- ใช้ batch insert สำหรับ telemetry
- เพิ่ม continuous aggregate สำหรับ chart
- Query history ตาม resolution อัตโนมัติ
- Load test 10 / 100 / 1,000 devices
- Dashboard แสดง query latency / ingest latency / DB size

## Phase 5 - Commercial features

เป้าหมาย: พร้อมใช้กับลูกค้าหลายราย

งานหลัก:

- Organization / Site / Group
- Role: owner, admin, operator, viewer
- Device limit ตาม plan
- Export report CSV/PDF
- Notification Email / LINE / Telegram
- Audit logs สำหรับ admin action
- Subscription / license status
