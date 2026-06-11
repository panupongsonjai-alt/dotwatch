# dotWatch Starter

Starter project สำหรับระบบ IoT Easy Monitoring รองรับแนวทาง production:

```txt
ESP32 -> Backend API -> PostgreSQL/TimescaleDB -> Dashboard React
Firebase Auth ใช้เฉพาะฝั่ง Login / User Identity
```

## โครงสร้าง

```txt
dotwatch-starter/
├─ dotwatch-backend/
├─ dotwatch-dashboard/
├─ dotwatch-firmware/
├─ docker-compose.yml
└─ docs/
```

## เริ่มแบบ Local

```bash
cd dotwatch-starter
cp dotwatch-backend/.env.example dotwatch-backend/.env
docker compose up -d
```

Backend: http://localhost:4000
Dashboard: http://localhost:5173
PostgreSQL: localhost:5432

## Database migration

```bash
cd dotwatch-backend
npm install
npm run migrate
npm run dev
```

## ทดสอบ ingest

```powershell
Invoke-RestMethod `
  -Method POST `
  -Uri "http://localhost:4000/api/ingest" `
  -Headers @{ "x-device-id"="DW-000001"; "x-device-secret"="dev-secret-001" } `
  -ContentType "application/json" `
  -Body '{"temperature":28.5,"humidity":62.3,"rssi":-61,"firmwareVersion":"1.0.0"}'
```
