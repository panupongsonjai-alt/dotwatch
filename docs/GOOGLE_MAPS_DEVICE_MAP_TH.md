# Google Maps สำหรับ Device Map ของ dotWatch

## สิ่งที่ระบบรองรับ

- ใช้ Google Maps JavaScript API ในหน้า Dashboard
- ค่าเริ่มต้นเป็น `hybrid` เพื่อแสดงภาพถ่ายดาวเทียมพร้อมชื่อถนนและสถานที่
- ผู้ใช้สลับระหว่าง `Roadmap`, `Hybrid` และ `Satellite` ได้จากปุ่มบนแผนที่
- ใช้พิกัด `latitude` และ `longitude` เดิมของ Device
- คง marker สถานะ การรวม Device ใกล้กัน และการคลิกเปิด Device
- หากยังไม่ตั้ง API key หรือ Google Maps โหลดไม่สำเร็จ ระบบจะกลับไปใช้ OpenStreetMap อัตโนมัติ

## ตัวแปร Environment ของ Dashboard

```env
VITE_GOOGLE_MAPS_API_KEY=your-google-maps-browser-api-key
VITE_GOOGLE_MAPS_DEFAULT_TYPE=hybrid
VITE_GOOGLE_MAPS_LANGUAGE=th
VITE_GOOGLE_MAPS_REGION=TH
```

ค่าของ `VITE_GOOGLE_MAPS_DEFAULT_TYPE` รองรับ:

```text
roadmap
hybrid
satellite
```

## การตั้งค่า Google Cloud

1. สร้างหรือเลือก Google Cloud Project
2. เปิด Billing ให้ Project
3. เปิดใช้งาน Maps JavaScript API
4. สร้าง API key สำหรับ Browser
5. ตั้ง Application restriction เป็น Websites หรือ HTTP referrers
6. เพิ่มโดเมน Dashboard ที่อนุญาต เช่นโดเมน Render ของ dotWatch
7. ตั้ง API restriction ให้ key ใช้ได้เฉพาะ Maps JavaScript API

API key ของ JavaScript Map จะถูกส่งไปยัง Browser จึงไม่ควรใช้ key ที่ไม่มี restriction และไม่ควรนำ server-side secret มาใส่แทน

## ตั้งค่าใน Render

ไปที่ Dashboard Static Site หรือ Web Service ที่ Build `apps/dashboard` แล้วเพิ่ม Environment Variables:

```text
VITE_GOOGLE_MAPS_API_KEY
VITE_GOOGLE_MAPS_DEFAULT_TYPE=hybrid
VITE_GOOGLE_MAPS_LANGUAGE=th
VITE_GOOGLE_MAPS_REGION=TH
```

จากนั้นสั่ง Manual Deploy หรือ Clear build cache and deploy เพื่อให้ Vite ฝังค่า Environment ชุดใหม่ลงใน Production build

## การทดสอบ

```powershell
cd "D:\IoT Project\dotwatch"
npm run check:dashboard
npm run audit:dashboard-style
```

เมื่อเปิดหน้า Dashboard:

- มุมขวาบนของแผนที่ต้องมีตัวเลือก Map/Satellite
- ป้ายมุมซ้ายบนควรแสดง `Google Maps · Hybrid` หรือชนิดแผนที่ที่เลือก
- หากไม่มี API key จะเห็น `OpenStreetMap fallback`
