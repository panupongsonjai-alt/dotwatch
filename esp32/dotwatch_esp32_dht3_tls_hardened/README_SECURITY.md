# ESP32-DHT3 TLS Security Policy

Canonical firmware path:

```text
esp32/dotwatch_esp32_dht3_tls_hardened
```

## Production default

- Setup AP now has a password: `dotwatch-setup`.
- HTTPS ingest requires a Root CA certificate in the local admin portal.
- Firmware no longer calls `setInsecure()` by default.

## Temporary lab-only insecure TLS

Only for short local testing, build with:

```ini
build_flags =
  -D DOTWATCH_ALLOW_INSECURE_TLS_FALLBACK=1
```

Do not use that flag for field devices or production releases.

## Recommended commissioning flow

1. Flash firmware.
2. Join AP `dotWatch-ESP32-Setup` using password `dotwatch-setup`.
3. Configure Wi-Fi, Backend URL, Device Code, Device Secret and Admin PIN.
4. Paste the backend Root CA certificate in the TLS Root CA field.
5. Save and reboot.
6. Confirm `/status` shows `TLS Mode: Root CA enabled` and dashboard receives `metric_1`, `metric_2`, `metric_3`.

## Phase 10A Wi-Fi memory

Firmware version `esp32-dht3-security-0.7.0` stores remembered Wi-Fi profiles in ESP32 Preferences/NVS under `wifiProfiles`.

- Maximum remembered profiles: 5
- Passwords are not shown in portal or JSON output
- Factory Reset Config clears all remembered Wi-Fi profiles
- The device scans available SSIDs and connects to the strongest remembered network first
- If scan fails or the network is hidden, it falls back to the primary saved SSID

## Phase 10B embedded Root CA

This firmware can use an embedded Root CA from `dotwatch_root_ca.h` when no portal Root CA is saved. Generate it with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/phase10b-esp32-install-root-ca.ps1 -BackendHost dotwatch-backend.onrender.com
```

Portal-saved Root CA overrides the embedded CA at runtime.
