# OTA release public key

Run the key generator from the repository root:

```powershell
npm run ota:key:generate -- --key-id dotwatch-release-2026-01
```

The command creates:

- `release-signing.public.pem` — public key; commit this file.
- `release-signing-key.json` — public metadata; commit this file.
- `esp32/dotwatch_esp32_product/include/OtaSigningKey.h` — embedded public key; commit this file.
- A private key under `%USERPROFILE%\.dotwatch\ota-signing\`; never commit this file.
