# dotWatch Secret Rotation After Exposure

Use this document when a real secret was pasted into chat, screenshots, logs, exported files, or committed files.

## Secrets that must be rotated

- Render PostgreSQL `DATABASE_URL` / database password
- Firebase Admin private key
- Firebase Web API config if abused or public exposure is not intended
- `DEVICE_SECRET_ENCRYPTION_KEY`
- Device secrets shown in full
- Admin tokens or service credentials

## Render PostgreSQL password rotation

1. Open Render Dashboard.
2. Open the PostgreSQL database used by dotWatch.
3. Rotate or reset the database password if the plan/UI supports it.
4. Copy the new External Database URL.
5. Update the backend service environment variable:

```text
DATABASE_URL=<new external database URL>
```

6. Redeploy backend.
7. Confirm health:

```powershell
npm run ops:health -- -BackendUrl "https://dotwatch-backend.onrender.com" -AllowReady503
```

8. Update your local private helper script if you created one, for example `use-render-db.ps1`.

## Firebase Admin private key rotation

1. Open Firebase / Google Cloud service account settings.
2. Create a new service account key.
3. Update Render backend env:

```text
FIREBASE_PRIVATE_KEY=<new escaped private key>
FIREBASE_CLIENT_EMAIL=<service account email>
FIREBASE_PROJECT_ID=<project id>
```

4. Redeploy backend.
5. Delete the old exposed key from Google Cloud.

## Device secret encryption key caution

Do not rotate `DEVICE_SECRET_ENCRYPTION_KEY` casually if encrypted device secrets already exist. Rotating it without a migration/re-encryption plan can make stored device secrets unreadable. If exposed, use a planned key-rotation migration.

## Device secrets

If a device secret was exposed:

1. Reset/regenerate the device secret from admin tooling.
2. Update the device/Pi/ESP32 config.
3. Confirm ingest works.
4. Confirm old secret no longer works.

## Local files to check after exposure

```powershell
npm run scan:secrets
npm run export:clean
```

Never include real `.env`, `_backups`, private keys, or database dumps in export zip files.
