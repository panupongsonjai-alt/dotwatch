# Phase 11B — ESP32 Local Portal Structure Analysis

## Goal

Align the ESP32 local web portal with the Dashboard visual and information structure while keeping ESP32 behavior, firmware routes, configuration, and device-specific details separate.

This phase is intentionally scoped to the ESP32 firmware local portal only.
It does not change backend API contracts, database schema, Dashboard React code, Admin React code, or ingest payload semantics.

## Current state before Phase 11B

The ESP32 firmware already had a functional local portal:

- Setup AP: `dotWatch-ESP32-Setup`
- Local Admin portal on the ESP32 Wi-Fi IP
- PIN protection outside setup mode
- `/`, `/save`, `/reset`, `/json`, `/test` routes
- Wi-Fi memory with up to 5 remembered profiles
- HTTPS Root CA handling with embedded CA and optional portal override
- Device code / device secret configuration
- DHT pin/type/interval configuration
- metric payload: `metric_1`, `metric_2`, `metric_3`

The issue was structure and usability. The page was a single form with a snapshot column. It worked, but it did not feel like the Dashboard workspace and it mixed network, security, device identity, sensor, and operations into one long area.

## Dashboard pattern to mirror

Dashboard/Admin structure now uses these workspace patterns:

- Brand/sidebar region
- Page hero/header
- Status badges
- Card-based sections
- Common visual tokens: dark surface, border, muted text, red accent, rounded panels
- Section grouping by intent
- Responsive layout
- Clear action zones

ESP32 cannot import Dashboard components because it is firmware-rendered HTML, not React. Therefore the correct approach is structure mirroring, not code sharing.

## Design decision

Use the same layout logic and visual hierarchy as Dashboard, but keep the ESP32 portal fully self-contained in firmware:

- No React dependency
- No Dashboard imports
- No browser-side fetch/localStorage dependency
- No backend or database changes
- No change to security model
- No change to ingest payload

## Risks checked

### 1. Firmware behavior risk

The following runtime behavior is preserved:

- `/` renders the portal
- `/save` saves config and restarts
- `/reset` clears config and restarts
- `/json` returns status JSON
- `/test` reads local sensor data
- `x-device-code` and `x-device-secret` are still sent on ingest
- `metric_1`, `metric_2`, `metric_3` are unchanged
- Root CA verification remains enforced unless build flag explicitly enables insecure fallback
- Wi-Fi memory remains unchanged

### 2. Secret leakage risk

Device secret is still masked in the portal snapshot. The password/secret inputs still leave existing values unchanged when blank.

### 3. Compatibility risk

Both firmware entry files are synchronized:

- `esp32/dotwatch_esp32_dht3_tls_hardened/src/main.cpp`
- `esp32/dotwatch_esp32_dht3_tls_hardened/dotwatch_esp32_dht3_tls_hardened.ino`

PlatformIO users build `src/main.cpp`. Arduino IDE users see the same portal code in the `.ino` file.

### 4. Embedded HTML size risk

The portal CSS and HTML are larger than before. This is acceptable for ESP32, but the change is kept to a single local portal page and uses plain CSS/HTML without external assets or JavaScript frameworks.

## Result

The ESP32 local portal now has a Dashboard-like workspace structure:

- Sidebar/brand area
- Workspace navigation anchors
- Status card
- Page hero
- Live Device Snapshot
- Network section
- Security section
- Device Identity section
- Sensor section
- Operations section
- Danger zone section

ESP32-specific details remain ESP32-specific.
