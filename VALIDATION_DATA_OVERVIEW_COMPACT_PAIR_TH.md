# Validation — Data Overview Compact Pair

## ผลที่ตรวจผ่าน

- คืน Temperature และ Humidity เป็นคนละ Card
- ไม่มี Combined Value Card ใน Dashboard JSX
- `dot-TH-W1` ถูกระบุเป็น Compact Model
- `dot-WT-W1` ถูกระบุเป็น Compact Model
- ชื่อเดิม `ESP32-DHT3` และ `Weather API Demo` ยังรองรับ
- Model อื่นไม่ถูกเปลี่ยนเป็น Compact Model
- กล่อง Compact Model ใช้ Grid สองคอลัมน์
- กล่อง Model อื่นครอบเต็มแถว
- มี Responsive breakpoint ที่ 860px และ 520px
- Temperature ใช้ `°C` และ Icon `Thermometer`
- Humidity ใช้ `%RH` และ Icon `Droplets`
- Verification script ผ่าน
- Dashboard JSX transpile syntax ผ่าน
- JavaScript syntax check ผ่าน
- CSS parse ผ่าน
- ZIP integrity ผ่าน
- ไม่แก้ Backend หรือ Database
- ไม่ต้องรัน Migration

## Production Build

ยังไม่ได้ยืนยัน Production Build ในสภาพแวดล้อมจัดทำไฟล์ เนื่องจากไม่สามารถติดตั้ง npm dependencies ให้เสร็จภายในข้อจำกัดของเครื่องมือ

ให้รันบน Local ก่อน Push:

```powershell
npm --prefix apps/dashboard run build
```
