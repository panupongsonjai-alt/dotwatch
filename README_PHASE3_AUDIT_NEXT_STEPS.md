# dotWatch Phase 3 Audit - Next Steps

ตรวจจาก `dotwatch-clean-20260707-203205.zip` แล้ว สถานะหลักคือ Pi agent ทำงานและส่ง credentials ผ่าน header ถูกแล้ว แต่ backend `/api/ingest` ยังตอบ HTTP 500

## สาเหตุที่เป็นไปได้สูงสุด

Raspberry Pi agent ใช้ Python `datetime.now(timezone.utc).isoformat()` ซึ่งได้ timestamp รูปแบบนี้:

```text
2026-07-07T13:07:14.457046+00:00
```

แต่ backend `services/backend/src/controllers/ingest.controller.js` ใช้ Zod schema:

```js
timestamp: z.string().datetime().optional()
```

Zod `.datetime()` มักเข้มงวดกับรูปแบบ UTC `Z` และไม่รับ offset แบบ `+00:00` ถ้าไม่ได้เปิด offset ทำให้ validation fail ก่อนเข้า `normalizeTimestamp()`

ปัญหายิ่งสับสนเพราะ `services/backend/src/middlewares/errorHandler.js` ยังไม่ map `ZodError` เป็น HTTP 400 จึงกลายเป็น HTTP 500 และ response ถูกซ่อนเป็น `Internal server error`

## ไฟล์ที่ควรแก้ทันที

1. `services/backend/src/controllers/ingest.controller.js`
   - เปลี่ยน schema timestamp ให้รับ string ISO ทั่วไป แล้วให้ `normalizeTimestamp()` เป็นตัว validate จริง
   - เหตุผล: offline queue เก่ามี timestamp `+00:00` อยู่แล้ว ถ้าแก้เฉพาะ Pi ให้ส่ง `Z` queue เก่าก็ยังส่งไม่ผ่าน

2. `services/backend/src/middlewares/errorHandler.js`
   - map `ZodError` เป็น HTTP 400 พร้อม details
   - เหตุผล: ต่อไปถ้า payload ผิด จะไม่กลายเป็น 500 ที่ดูเหมือน backend พัง

## ไฟล์ที่ยังไม่ควรแก้ตอนนี้

- `pi/agent/main.py` ไม่ควรแก้ เพราะไม่ได้ post HTTP เอง
- `pi/agent/services/dotwatch_api.py` ส่ง `x-device-code` และ `x-device-secret` อยู่แล้ว
- ห้ามลบ offline queue จนกว่า backend ingest จะผ่าน

## คำสั่งแนะนำหลังวางไฟล์แก้

```powershell
cd "D:\IoT Project\dotwatch"

Copy-Item ".\services\backend\src\controllers\ingest.controller.js" ".\services\backend\src\controllers\ingest.controller.js.bak-before-timestamp-fix" -Force
Copy-Item ".\services\backend\src\middlewares\errorHandler.js" ".\services\backend\src\middlewares\errorHandler.js.bak-before-zod-fix" -Force

Copy-Item ".\ingest.controller.fixed.js" ".\services\backend\src\controllers\ingest.controller.js" -Force
Copy-Item ".\errorHandler.fixed.js" ".\services\backend\src\middlewares\errorHandler.js" -Force

npm run check:backend
npm run verify:phase2
npm run verify:phase3
```

จากนั้น commit/deploy backend ไป Render แล้วค่อย start Pi agent:

```powershell
ssh pi@192.168.1.237 "sudo systemctl start dotwatch-pi-agent.service"
ssh pi@192.168.1.237 "journalctl -u dotwatch-pi-agent.service -n 80 --no-pager"
```

ถ้าแก้สำเร็จ ควรเห็น `QUEUE_FLUSHED` หรือ `SENT` และ `SERVER_OK` แทน HTTP 500

## สิ่งที่ควร cleanup หลัง ingest ผ่าน

- ลบไฟล์ patch/backup ชั่วคราวใน root เช่น `fix-phase3-*.ps1`, `dotwatch_api.fixed.py`
- แก้/แทนที่ `scripts/pi-ingest-diagnostic.ps1` เพราะตัวใน export ยังยิง credentials ใน JSON body ทำให้ผล probe หลอกได้
- ย้ายหรือ mark `services/backend/migrations/20260707_create_device_metric_latest.sql` ว่า `DO_NOT_RUN_MANUALLY` เพราะไฟล์นี้สร้าง `device_metric_latest` เป็น VIEW แบบ legacy ในขณะที่ backend ปัจจุบันต้องการ table สำหรับ upsert
