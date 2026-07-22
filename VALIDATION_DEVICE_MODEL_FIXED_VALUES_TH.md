# ผลการตรวจสอบ — Device Model Fixed Values

วันที่ตรวจสอบ: 21 กรกฎาคม 2026

## ขอบเขตที่แก้ไข

- เปลี่ยนชื่อแสดงผล `ESP32-DHT3` เป็น `dot-TH-W1`
- เปลี่ยนชื่อแสดงผล `Weather API Demo` เป็น `dot-WT-W1`
- ล็อกทั้งสองโมเดลให้มี Value จำนวน 2 รายการเท่านั้น
  1. `Temperature` / `°C` / `Thermometer`
  2. `Humidity` / `%RH` / `Droplets`
- ปิดการเพิ่ม ลบ หรือเปลี่ยนชื่อ ชนิด หน่วย และ Icon ของ Value ทั้งใน Admin, Dashboard และ Backend API
- คง Model Key เดิม `esp32_dht3` และ `weather_api_demo` เพื่อรักษาความเข้ากันได้กับ Firmware, OTA, Weather Polling และข้อมูลเดิม

## ผลการตรวจสอบ

| รายการ | ผลลัพธ์ |
|---|---|
| Static policy verification (`node scripts/verify-locked-device-models.mjs`) | ผ่าน |
| Backend JavaScript syntax check (`node --check`) | ผ่าน |
| Dashboard production build | ผ่าน |
| Admin production build | ผ่าน |
| ESLint เฉพาะไฟล์ AdminModels.jsx ที่แก้ไข | ผ่าน |
| ตรวจว่าไม่มีชื่อเดิมใน Runtime ที่เกี่ยวข้อง | ผ่าน |
| ตรวจความสมบูรณ์ของ ZIP | ผ่านก่อนส่งมอบ |

## ข้อสังเกต

- Dashboard build แสดงคำเตือนเดิมจาก dependency `recharts` เรื่อง deprecated package แต่ไม่ทำให้ Build ล้มเหลว และไม่เกี่ยวข้องกับการแก้ไขรอบนี้
- Full Admin lint ยังพบข้อผิดพลาดเดิมใน `apps/admin/src/components/common/UnifiedSelect.jsx` (`react-hooks/set-state-in-effect`) ซึ่งอยู่นอกขอบเขตงานนี้; ไฟล์ `AdminModels.jsx` ที่แก้ไขผ่าน ESLint และ Admin production build ผ่าน
- ยังไม่ได้รัน Migration กับฐานข้อมูล Render จริง เนื่องจากสภาพแวดล้อมตรวจสอบนี้ไม่มี Production credential ผู้ใช้ต้องรัน `npm run migrate` ที่ Render Backend หลัง Deploy
- ยังไม่ได้ Build/Flash Firmware ลงบอร์ด ESP32 จริง การแก้ Firmware รอบนี้เป็นการเปลี่ยนชื่อแสดงผลของโมเดลเท่านั้น โดยคง Model Key เดิม

## การตรวจหลัง Deploy ที่ต้องได้

1. Admin > Device Models แสดง `dot-TH-W1` และ `dot-WT-W1`
2. แต่ละโมเดลแสดง `Fixed 2 Values` และไม่มีปุ่ม Add/Remove
3. Value Name, Unit และ Icon เป็นแบบอ่านอย่างเดียว
4. Dashboard > Devices ของสองโมเดลไม่มีปุ่ม Add/Delete Value
5. API ปฏิเสธการลบ Value ของโมเดลที่ล็อกด้วย HTTP 409
6. ข้อมูลอุปกรณ์เดิมเหลือเฉพาะ Temperature และ Humidity หลัง Migration
7. Icon ของ Temperature เป็น `Thermometer` และ Humidity เป็น `Droplets` ทั้ง Default Model และ Device Value
