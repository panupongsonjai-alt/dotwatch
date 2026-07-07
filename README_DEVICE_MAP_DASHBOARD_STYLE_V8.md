# dotWatch Device Map Dashboard Style V8

ชุดนี้ปรับเฉพาะส่วน Device Map ของ Dashboard ให้เข้าธีมเดียวกับหน้า Dashboard โดยไม่แตะ Backend, Admin หรือ Raspberry Pi

## Files changed

- `apps/dashboard/src/styles/device-map-title-status-restore.css`
- `apps/dashboard/src/styles/dashboard.css`
- `apps/dashboard/src/components/DeviceMap.jsx` included for ready-to-place reference, no logic change required

## What changed

- จัด header ของ Device Map ใหม่ให้ title/subtitle ไม่เบียดกับ badge
- ปรับ status badge เป็น grid 2x2 และขยายเป็น 1 แถวเมื่อหน้าจอกว้าง
- ปรับ map frame ให้เป็น glass/dark card เหมือน Dashboard
- ปรับปุ่ม zoom ของ Leaflet จากสีขาว default เป็น dark theme
- ปรับ attribution ของ Leaflet ให้ไม่หลุดธีม
- ปรับ tooltip/popup ของ device ให้เป็น card สีเดียวกับระบบ
- ปรับ marker dot ให้ดูชัดขึ้นและมี pulse effect
- เพิ่ม responsive สำหรับ tablet/mobile

## How to use

Copy the files in this zip into your project root and replace existing files.

Then run local check:

```powershell
cd "D:\IoT Project\dotwatch\apps\dashboard"
npm run build
npm run dev
```

For Render:

1. Commit and push
2. Deploy `dotwatch-dashboard`
3. Use `Clear build cache & deploy`

## Note

Build was not fully executed inside the sandbox because the uploaded `node_modules` came from Windows and Rollup optional Linux dependency was missing. CSS brace checks passed.
