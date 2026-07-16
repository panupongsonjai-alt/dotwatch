# dotWatch Mobile Phase M3–M4
ติดตั้งต่อจาก Mobile Foundation

เพิ่ม Alarm tab, Active/History, Acknowledge, History API และกราฟ Temperature/Humidity ช่วง 1h/6h/24h/7d

```powershell
npm --prefix apps/mobile install
npm run check:mobile
npm run mobile:start
```

ไฟล์ Device Detail ฉบับเต็มสำหรับกราฟจะถูกเพิ่มใน patch ถัดไปหลังตรวจ metric key จากอุปกรณ์จริง หากอุปกรณ์ใช้ `temperature` และ `humidity` สามารถนำ `getMetricHistory` และ `HistoryChart` ไปเชื่อมได้ทันที
