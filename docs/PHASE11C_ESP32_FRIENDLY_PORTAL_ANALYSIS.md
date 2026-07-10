# Phase 11C — ESP32 Friendly Portal UX Analysis

## Goal

Make the ESP32 Local Portal easier for general users while keeping the visual direction aligned with the dotWatch Dashboard.

This phase improves the ESP32 page only. It does not share React/dashboard code with the firmware and does not change backend, database, dashboard, admin, ingest routes, TLS behavior, or the metric payload.

## Current issue found after Phase 11B

Phase 11B aligned the ESP32 portal structure with Dashboard patterns, but the page still felt technical for general users:

- The page exposed many technical sections at the same level.
- Users had to understand Backend, TLS, Root CA, Device Secret, DHT, and JSON all at once.
- Important daily status information was mixed with configuration details.
- Advanced fields were visible too early, making the setup page look harder than it is.
- Labels such as RSSI, TLS Mode, Root CA, and Status JSON were useful for engineers but not friendly as the first interaction.

## Safer implementation approach

The safe approach is to keep the firmware routes and config fields exactly as-is, but change the portal presentation:

- Keep Dashboard-like card, sidebar, hero, stat and badge style.
- Add a simple 4-step setup flow.
- Show friendly readiness status first.
- Keep only the required setup fields visible by default.
- Move advanced security and sensor fields into expandable panels.
- Keep JSON/test/reset routes unchanged.
- Keep all form input names unchanged so existing save logic remains valid.

## What changed

### User-facing changes

- Added a friendly 4-step setup guide:
  1. Connect Wi-Fi
  2. Connect Backend
  3. Enter Device Code/Secret
  4. Save & Restart
- Added readiness summary: `x/5 พร้อมใช้งาน`.
- Changed status labels to human-readable Thai labels.
- Added signal quality text such as `ดีมาก`, `ดี`, `พอใช้`, or `สัญญาณอ่อน` while still showing RSSI details.
- Changed the main form to show only the most important sections first.
- Moved TLS Root CA and Local Admin PIN settings to an advanced panel.
- Moved DHT/sensor tuning to an advanced panel.
- Moved Factory Reset into a collapsed danger panel.

### Preserved behavior

- Routes remain the same: `/`, `/save`, `/reset`, `/json`, `/test`.
- Config storage remains ESP32 Preferences/NVS.
- Wi-Fi memory behavior remains unchanged.
- TLS Root CA rules remain unchanged.
- Device Code/Secret behavior remains unchanged.
- Metric payload remains:
  - `metric_1` = Temperature
  - `metric_2` = Humidity
  - `metric_3` = Wi-Fi RSSI
- PlatformIO `src/main.cpp` and Arduino `.ino` are kept identical.

## Files changed

- `esp32/dotwatch_esp32_dht3_tls_hardened/src/main.cpp`
- `esp32/dotwatch_esp32_dht3_tls_hardened/dotwatch_esp32_dht3_tls_hardened.ino`
- `scripts/phase11c-esp32-friendly-portal-verify.mjs`
- `docs/PHASE11C_ESP32_FRIENDLY_PORTAL.md`
- `docs/PHASE11C_ESP32_FRIENDLY_PORTAL_ANALYSIS.md`
- `package.json`

## Risk notes

This phase is intentionally UI-only for the ESP32 portal. It avoids changing transport, authentication, TLS verification, backend endpoints, database schema, dashboard, and admin app code.
