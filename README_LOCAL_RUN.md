# dotWatch Local Run Guide

คู่มือนี้ใช้สำหรับรัน dotWatch บนเครื่อง Windows/VS Code แบบ local

## 1. เตรียม env local

จาก root folder:

```powershell
npm run env:local
```

คำสั่งนี้จะสร้างไฟล์ถ้ายังไม่มี:

- `services/backend/.env`
- `apps/dashboard/.env.local`
- `apps/admin/.env.local`

> หมายเหตุ: ไฟล์ `.env` จริงใช้รันเครื่องเราได้ แต่ห้าม commit และห้ามส่งต่อ

## 2. Start database

```powershell
docker compose up -d db
```

## 3. Install dependencies

```powershell
npm run install:all
```

## 4. Run database migrations

```powershell
npm run backend:migrate
```

## 5. Run backend

```powershell
npm run backend:dev
```

Backend should start at:

```text
http://localhost:4000
```

Check health:

```powershell
Invoke-RestMethod http://localhost:4000/health
```

## 6. Run dashboard

Open a new terminal:

```powershell
npm run dashboard:dev
```

Dashboard should start at:

```text
http://localhost:5173
```

## 7. Run admin

Open a new terminal:

```powershell
npm run admin:dev
```

Admin should start at:

```text
http://localhost:5174
```

## Local auth note

`services/backend/.env` ใช้ local ได้ด้วย:

```text
DEV_AUTH_BYPASS=true
```

ค่านี้ช่วยให้ test backend ได้แม้ยังไม่ได้ตั้ง Firebase Admin service account ในเครื่อง local

Production/Render ต้องใช้:

```text
NODE_ENV=production
DEV_AUTH_BYPASS=false
```

หรือไม่ต้องใส่ `DEV_AUTH_BYPASS` เลย

## Clean export

เมื่อจะส่งโปรเจกต์ให้คนอื่นหรือ backup แบบสะอาด ให้ใช้:

```powershell
npm run export:clean
```

อย่า zip ทั้งโฟลเดอร์เอง เพราะอาจติด `.git`, `node_modules`, `dist`, `.env` จริง และ secret ได้
