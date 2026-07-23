# Validation — Device Center Selected Device Layout

## ผลตรวจสอบที่ผ่าน

- Scrollbar เปิดเฉพาะเมื่อ `draftMetrics.length > 3`
- ความสูง Scrollbar คำนวณจาก Value Group 3 รายการแรก
- ใช้ `ResizeObserver` รองรับความสูงที่เปลี่ยนเมื่อ Alarm Rule เปลี่ยน
- มี `overflow-y: auto`
- มี `scrollbar-gutter: stable`
- Icon Dropdown ยังใช้งานได้ โดยปลด Scroll clipping ขณะเปิด Dropdown
- Security component และ Password flow เดิมไม่ถูกเปลี่ยน
- Security surface, radius, row height, columns และ spacing ตรงกับ Overview
- Security label `13px`, helper `11px`, value `15px` ตรงกับ Overview
- Responsive Security layout ผ่าน
- Verification script ผ่าน
- MetricConfigPanel JSX syntax ผ่าน
- SelectedDevicePanel JSX syntax ผ่าน
- devices.css parse ผ่าน
- Git whitespace check ผ่าน
- ZIP integrity ผ่าน
- ไม่แก้ Backend หรือ Database
- ไม่ต้องรัน Migration

## Production Build

มีการพยายามรัน `npm ci` และ Dashboard production build ในสภาพแวดล้อมจัดทำไฟล์ แต่การติดตั้ง dependency ใช้เวลานานเกินข้อจำกัดและถูก timeout ทำให้ `vite` ยังไม่พร้อมใช้งานในสภาพแวดล้อมนี้

ต้องยืนยันบน Local ก่อน Push:

```powershell
npm --prefix apps/dashboard run build
```
