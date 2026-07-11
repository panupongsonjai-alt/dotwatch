# dotWatch

Production-ready dotWatch IoT monitoring monorepo.

## Source of truth

| Area | Path |
|---|---|
| Dashboard | `apps/dashboard` |
| Admin console | `apps/admin` |
| Backend API | `services/backend` |
| Raspberry Pi agent | `pi/agent` |
| ESP32 production firmware | `esp32/dotwatch_esp32_product` |
| Operations scripts | `scripts` |
| Project documentation | `docs` |

## Common commands

```powershell
cd "D:\IoT Project\dotwatch"

npm run install:all
npm run dashboard:dev
npm run admin:dev
npm run backend:dev
```

## Production/ops checks

```powershell
npm run check:backend
npm run verify:phase10e:dashboard-auth
npm run ops:health -- -BackendUrl "https://dotwatch-backend.onrender.com" -AllowReady503
npm run db:parity:compat -- -LocalDatabaseUrl "$LocalDbUrl" -RenderDatabaseUrl "$RenderDbUrl"
```

## ESP32 production firmware

```powershell
cd "D:\IoT Project\dotwatch\esp32\dotwatch_esp32_product"
python -m platformio run
python -m platformio run --target upload
python -m platformio device monitor --baud 115200
```

ตรวจโครงสร้าง Firmware โดยไม่ Build:

```powershell
npm run verify:esp32:product -- -SkipBuild
```

## Local/Render database parity

Render is the production source. Local `localhost:5432` can be used as a Render clone after restoring a Render backup into the local TimescaleDB/PostgreSQL 18 container.

The latest confirmed parity target is:

```text
Core compatibility parity: OK
Full core column signature parity: OK
```

## Secrets

Do not commit real `.env`, Firebase service account JSON, private keys, database dumps, or backup files. Use the included `.env.example` / `.env.local.example` files only.
