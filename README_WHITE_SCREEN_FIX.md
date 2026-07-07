# dotWatch White Screen Fix

ถ้า Dashboard เปิดแล้วจอขาว ให้เช็คตามลำดับนี้

## 1) Dashboard ต้องมีไฟล์ env

ไฟล์ที่ต้องมี:

```text
apps/dashboard/.env.local
```

ในชุด `dotwatch-clean-v3` ใส่ไฟล์นี้ให้แล้ว โดยตั้ง Backend เป็น local:

```env
VITE_API_URL=http://localhost:4000
VITE_WS_URL=ws://localhost:4000
```

และมี Firebase Web SDK config จากไฟล์ Dashboard เดิมที่คุณส่งมา

## 2) ล้าง cache ของ Vite แล้วรันใหม่

PowerShell จากโฟลเดอร์หลัก `dotwatch-clean`:

```powershell
Remove-Item -Recurse -Force apps\dashboard\node_modules\.vite -ErrorAction SilentlyContinue
npm run dashboard:dev
```

## 3) Backend ต้องรันก่อน

```powershell
docker compose up -d db
npm run backend:migrate
npm run backend:dev
```

## 4) URL ที่ควรเปิด

Dashboard:

```text
http://localhost:5173
```

Backend health:

```text
http://localhost:4000/health
```

## แก้ใน v3 แล้ว

- เพิ่ม `apps/dashboard/.env` และ `apps/dashboard/.env.local`
- ป้องกันจอขาวถ้า Firebase config หาย โดยแสดง error ในหน้า Login แทน
- แก้ CSS syntax ผิด `..settings-stat-card`
- แก้ `crypto?.randomUUID` ให้ปลอดภัยขึ้น
