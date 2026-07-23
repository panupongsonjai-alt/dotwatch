# dotWatch — Data Overview แบบกะทัดรัดสำหรับ 2 Device Model

## รูปแบบใหม่

เฉพาะ Device Model ต่อไปนี้:

- `dot-TH-W1` หรือ Model Key `esp32_dht3`
- `dot-WT-W1` หรือ Model Key `weather_api_demo`

จะมีพฤติกรรมดังนี้:

1. กลับมาแสดง Temperature และ Humidity เป็นคนละ Overview Card เหมือนรูปแบบเดิม
2. กล่อง Device ของสองโมเดลนี้มีขนาดกะทัดรัดลง
3. กล่อง Device สองตัวสามารถวางคู่กันในแถวเดียว
4. ภายในแต่ละกล่อง Temperature และ Humidity วางคู่กัน
5. Device Model อื่นยังใช้ความกว้างเต็มแถวและขนาดเดิม

## Responsive

- หน้าจอกว้างกว่า 860px: กล่องของสองโมเดลวางได้ 2 กล่องต่อแถว
- หน้าจอ 860px หรือต่ำกว่า: กล่อง Device เรียงทีละกล่อง
- หน้าจอ 520px หรือต่ำกว่า: Temperature และ Humidity เรียงบน–ล่าง

## ความเข้ากันได้

ระบบตรวจจับได้จาก:

- `esp32_dht3`
- `weather_api_demo`
- `dot-TH-W1`
- `dot-WT-W1`
- `ESP32-DHT3`
- `Weather API Demo`

ยังคง fallback Temperature และ Humidity สำหรับกรณี Render ส่ง `metric_configs` มาไม่ครบ

## วิธีติดตั้ง

1. แตกไฟล์ `dotwatch-data-overview-compact-pair-patch-20260722.zip`
2. นำโฟลเดอร์ `dotwatch` วางทับ:

   `D:\IoT Project\dotwatch`

3. ตรวจสอบ:

```powershell
cd "D:\IoT Project\dotwatch"

node .\scripts\verify-data-overview-compact-model-pair.mjs

npm --prefix apps/dashboard run build
```

4. Push ตามไฟล์ `GIT_PUSH_COMMANDS_DATA_OVERVIEW_COMPACT_PAIR_TH.txt`

## Render

หลัง Push:

1. เปิด Dashboard service บน Render
2. เลือก Manual Deploy
3. เลือก Clear build cache & deploy
4. ตรวจว่าใช้ Commit SHA ล่าสุด
5. เปิดหน้า Dashboard แล้วกด `Ctrl + F5`

งานนี้แก้เฉพาะ Dashboard ไม่แก้ Backend และไม่ต้องรัน Database Migration
