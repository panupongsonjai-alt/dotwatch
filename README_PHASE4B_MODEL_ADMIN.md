# dotWatch Phase 4B — Device Models Admin + ESP32 visible in Dashboard

แพ็กนี้แก้ 2 เรื่องหลัก:

1. หน้า Dashboard > Devices จะโหลด `Device Model` จาก backend จริงผ่าน `/api/device-models` แทน list static เดิม จึงเห็น `ESP32-DHT3` เมื่อ database มี model นี้แล้ว
2. เพิ่มหน้า `dotwatch-admin > Models` สำหรับเพิ่ม / แก้ไข / ลบ model list และ default metrics

## สิ่งที่ไม่แตะ

- ไม่แทนที่ Raspberry Pi / DW20CH
- ไม่ลบ model เดิม
- ไม่แก้ Pi service
- ไม่ commit `.env` หรือ secret

## Backend API ใหม่

```text
GET    /api/admin/device-models?includeInactive=true
POST   /api/admin/device-models
PUT    /api/admin/device-models/:modelId
DELETE /api/admin/device-models/:modelId
```

หมายเหตุ: DELETE เป็น soft delete โดย set `is_active=false` เพื่อไม่กระทบ device เดิมที่อ้าง model นั้นอยู่

## Dashboard fix

เดิมหน้า `Devices.jsx` มี `DEVICE_MODEL_OPTIONS` hardcoded เป็น DW2CH/DW10CH/DW20CH เท่านั้น ทำให้ ESP32 ไม่ขึ้น แม้ database มี `esp32_dht3` แล้ว

แพ็กนี้เพิ่ม:

```js
getDeviceModels()
```

และให้หน้า Device wizard ใช้ model จาก backend จริง

## Admin Models

เพิ่มหน้าใหม่ใน dotwatch-admin:

```text
Models
```

ทำได้:

- Create model
- Edit model
- Soft delete/deactivate model
- Restore inactive model
- Edit default metrics ของ model
- มี ESP32 template ให้กดกรอกเร็ว

## ติดตั้ง + push

แตก zip นี้ลงที่ root repo:

```text
D:\IoT Project\dotwatch
```

แล้วรัน:

```powershell
cd "D:\IoT Project\dotwatch"

powershell -NoProfile -ExecutionPolicy Bypass -File .\dotwatch-phase4b-model-admin-safe-push.ps1 `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -PackDir "D:\IoT Project\dotwatch" `
  -RunSeed `
  -Commit `
  -Push
```

สคริปต์จะ stage เฉพาะไฟล์ในแพ็กนี้ ไม่ใช้ `git add -A` เพื่อกันเผลอ push ไฟล์ README ที่ถูกลบค้าง

## หลัง deploy backend แล้ว

รัน migration หรือ seed อย่างใดอย่างหนึ่ง:

```powershell
cd "D:\IoT Project\dotwatch\services\backend"
node .\src\scripts\seed-esp32-dht3-model-add-only.cjs
node .\src\scripts\check-device-models.cjs
```

หรือถ้าบน Render ใช้ Pre-Deploy Command:

```text
npm run migrate
```

หลังเสร็จ หน้า Dashboard > Devices > Create Device ควรเห็น:

```text
ESP32-DHT3
```

และ dotwatch-admin ควรมีเมนู:

```text
Models
```
