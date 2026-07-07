# dotWatch Dashboard Performance Patch

## แก้อะไร

หน้าเว็บโหลดช้าเพราะ frontend เรียก API ซ้ำหลายจุด เช่น Dashboard / Devices / Alarm / Activity ใช้ข้อมูลชุดใกล้เคียงกัน แต่ยิง request แยกกันทุกครั้ง

## สิ่งที่ปรับใน api.js

```text
- ลด default timeout จาก 45s เป็น 20s
- เพิ่ม memory cache สำหรับ GET request
- เพิ่ม in-flight dedupe ถ้า request เดิมกำลังโหลดอยู่ จะใช้ promise เดียวกัน
- เคลียร์ cache อัตโนมัติเมื่อมี POST / PUT / DELETE
- ไม่ cache /secret เพื่อความปลอดภัย
```

## ค่า default ใหม่

```text
VITE_REQUEST_TIMEOUT_MS=20000
VITE_API_CACHE_TTL_MS=6000
VITE_API_SLOW_CACHE_TTL_MS=12000
```

## ผลลัพธ์

```text
- สลับหน้าเร็วขึ้น
- ลดการยิง API ซ้ำ
- ลดอาการ loading ค้าง
- ยังปลอดภัย เพราะ Device Secret ไม่ถูก cache
```
