# Deployment Notes

## Minimum Production Setup

```txt
Frontend: Vercel / Netlify / Firebase Hosting
Backend: VPS / Cloud Run / Render / Railway
Database: Managed PostgreSQL + TimescaleDB
Auth: Firebase Auth
```

## Required Before Production

- HTTPS
- Real Firebase Admin credentials
- CORS locked to real dashboard domain
- backup automation
- server monitoring
- log collection
- OTA firmware strategy
- per-device secret rotation
