# dotWatch Cleanup Report

## สิ่งที่จัดโครงสร้างใหม่

- รวม project เป็นโครงสร้างเดียว: `apps/dashboard`, `apps/admin`, `services/backend`, `pi`
- ตัดไฟล์ generated/cache ออกทั้งหมด: `node_modules`, `dist`, `.git`, `__pycache__`, `.pyc`
- ตัดไฟล์ environment จริงออก: `.env`, `.env.development`, `.env.production` และเก็บเฉพาะ `.env.example`/`.env.*.example`
- อัปเดต `docker-compose.yml` ให้ตรงกับ path ใหม่
- เพิ่ม root scripts สำหรับรัน Dashboard/Admin/Backend ได้จาก root

## ไฟล์/โฟลเดอร์ใหญ่ที่ไม่ควร commit หรือส่งต่อ

- `dotwatch-dashboard/node_modules` ประมาณ 318 MB
- `dotwatch-admin/node_modules` ประมาณ 280 MB
- `dotwatch-backend/node_modules` ประมาณ 61 MB
- `dotwatch-dashboard/dist` และ `dotwatch-admin/dist` เป็น build output
- `dotwatch-dashboard/.git` เป็น metadata ของ git เดิม

## Dashboard fixes

- แก้ `src/services/api.js` ที่ประกาศ `const useCache` ซ้ำ ทำให้ build fail ได้
- ปรับ `src/main.jsx` ให้ปิด React StrictMode เป็นค่าเริ่มต้น เพื่อลดการเรียก API ซ้ำใน dev mode
- ปรับ `src/App.jsx` เป็น lazy-loaded pages เพื่อลด initial bundle และช่วยให้หน้าแรกเปิดเร็วขึ้น
- ปรับ `src/pages/Settings.jsx` ให้ Interface Preferences apply ทันทีเมื่อเลือก ไม่ต้องรอเปลี่ยนหน้า
- ปรับ `src/components/common/StatCard.jsx` ให้รองรับ `compact`, `className`, และ class ภายในสำหรับ CSS design system
- ลบ duplicate `return 'M'` ใน `Dashboard.jsx`

## Dashboard files removed from clean copy because unused/legacy

- `src/components/DemoActionsCard.jsx`
- `src/components/DemoTemplatesPanel.jsx`
- `src/components/DashboardDeviceCard.jsx`
- `src/components/DeviceCard.jsx`
- `src/components/DeviceHealthCard.jsx`
- `src/components/DeviceHealthCard.css`
- `src/components/ProtectedRoute.jsx`
- legacy patch CSS ที่ไม่ได้ import แล้ว เช่น `statcard-topbar-*`, `device-detail-cleanup-*`, `alarm-center-*` บางชุด
- `services/backend/src/patches/` เพราะเป็น patch snippets เก่าและมี relative import ที่ไม่ตรง path จริง

## สิ่งที่ยังไม่ได้ลบออกแบบ aggressive

- Backend demo routes ยังเก็บไว้ เพราะ `server.js` ยัง register routes อยู่ การลบออกควรทำพร้อม migration/API cleanup รอบแยกต่างหาก
- CSS หลักหลายไฟล์ยังเก็บไว้ เพราะมี import ใช้งานจริงและเป็น design guard ของหน้าปัจจุบัน

## Validation ที่ทำแล้ว

- Parse JSX/JS ของ Dashboard และ Admin ด้วย Babel parser: ผ่าน
- `node --check` ฝั่ง Backend: ผ่าน
- ไม่สามารถรัน `npm run build` จาก zip เดิมใน container นี้ได้ เพราะ `node_modules` ที่แนบมาไม่มี Rollup optional native package สำหรับ Linux ซึ่งเป็นปัญหาปกติของการย้าย `node_modules` ข้าม OS ให้รัน `npm install` ใหม่ในเครื่องก่อน build
