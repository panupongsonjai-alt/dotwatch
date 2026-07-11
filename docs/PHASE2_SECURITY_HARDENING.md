# dotWatch Phase 2 - Security Hardening

Last updated: 2026-07-08

## Goals

Phase 2 closes the biggest field/security risks before adding more features.

## Changes

### Raspberry Pi Config UI

- Default bind changed from `0.0.0.0:8080` to `127.0.0.1:8080`.
- Installer generates a strong `CONFIG_UI_PASSWORD` if the old default is present.
- LAN exposure now requires explicit `--lan` and a strong password.
- `.env` permissions are set to `600` when written by the UI/installer.
- Basic Auth comparison uses constant-time `hmac.compare_digest`.

Safe access:

```powershell
ssh -L 8080:127.0.0.1:8080 pi@<PI_IP>
```

Then open:

```text
http://127.0.0.1:8080
```

### ESP32-DHT3 firmware

- Canonical firmware: `esp32/dotwatch_esp32_product`.
- Setup AP password changed from open AP to `dotwatch-setup`.
- HTTPS ingest now requires Root CA by default.
- `setInsecure()` is available only with a lab-only build flag:

```ini
build_flags =
  -D DOTWATCH_ALLOW_INSECURE_TLS_FALLBACK=1
```

### Backend / Docker

- `services/backend/Dockerfile` is now production-style and runs `node src/server.js`.
- `services/backend/Dockerfile.dev` is used by local `docker-compose.yml`.
- `.env.production.example` no longer includes localhost origins.
- Added production environment check scripts.

## Verification

```powershell
cd "D:\IoT Project\dotwatch"
npm run verify:phase2:security
```

Optional production env check:

```powershell
cd "D:\IoT Project\dotwatch"
node .\scripts\check-production-env.mjs --file .\services\backend\.env.production
```
