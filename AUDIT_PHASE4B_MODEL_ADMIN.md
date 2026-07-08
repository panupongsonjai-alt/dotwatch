# Audit result for latest dotWatch zip

ตรวจไฟล์ล่าสุด `dotwatch-clean-20260708-143513.zip` แล้วพบจุดสำคัญ:

## สาเหตุที่หน้า Device ยังไม่มี ESP32

หน้า Dashboard `apps/dashboard/src/pages/Devices.jsx` ใช้ `DEVICE_MODEL_OPTIONS` แบบ hardcoded มีแค่:

- DW2CH
- DW10CH
- DW20CH

จึงไม่เห็น `ESP32-DHT3` แม้ database มี `esp32_dht3` แล้ว

## การแก้ในแพ็กนี้

- เพิ่ม `getDeviceModels()` ใน `apps/dashboard/src/services/api.js`
- ให้ `Devices.jsx` โหลด `/api/device-models` จาก backend จริง
- ปรับ backend `deviceModelsController` ให้คืนชื่อ field ทั้ง snake_case และ camelCase เพื่อ frontend ใช้ง่าย

## dotwatch-admin model CRUD

เพิ่มหน้าใหม่:

- `apps/admin/src/pages/AdminModels.jsx`
- เพิ่มเมนู `Models` ใน sidebar
- เพิ่ม API client ใน `apps/admin/src/services/adminApi.js`
- เพิ่ม backend admin routes/controller สำหรับ CRUD model list

## ความปลอดภัย

- DELETE model เป็น soft delete (`is_active=false`) เพื่อไม่กระทบ devices เดิม
- Create/Update/Delete จำกัด `requireSuperAdmin`
- GET model list ใช้ admin role ได้
- ไม่แตะ Pi service / Raspberry Pi model เดิม

## ESP32 seed

อัปเดต `seed-esp32-dht3-model-add-only.cjs` ให้ seed ทั้ง:

- device_models row: `esp32_dht3`
- default metrics 3 rows ใน `device_model_metrics`

จึงทำให้ create device ESP32 แล้ว dashboard มี metric display names ครบ
