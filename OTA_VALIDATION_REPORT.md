# dotWatch ESP32 Internet OTA — Validation Report

Date: 2026-07-12

## Included scope

- ESP32 dual-slot OTA partition table for 4 MB ESP32 Dev Module
- HTTPS/HTTP OTA manifest check with per-device credentials
- Streaming firmware download to inactive OTA slot
- SHA-256 verification before activating the new image
- Local ESP32 Firmware Update page
- Standalone Node.js OTA server suitable for Render
- Release publishing and verification PowerShell scripts

## Checks completed

- ESP32 modular portal build/sync: PASSED
- Generated `PortalAssets.h`: PASSED
- Portal JavaScript syntax: PASSED
- Portal modular structure verification: PASSED
- OTA server JavaScript syntax: PASSED
- OTA publish script syntax: PASSED
- OTA server end-to-end test: PASSED
  - publish test binary
  - authenticated manifest check
  - authenticated binary download
  - SHA-256 equality
  - status report submission
- Partition table validation: PASSED
  - no overlap
  - final address `0x400000`
  - two application slots of `0x180000` bytes
- C++ source brace and declaration smoke checks: PASSED
- Archive excludes `.pio`, `node_modules`, `.env`, and device secrets: REQUIRED

## Build limitation in delivery environment

A full PlatformIO firmware build was attempted, but the environment timed out while downloading the `espressif32` platform package. This was a network/package download limitation, not a compiler diagnostic from the project. Run the following on the project machine before the first USB upload:

```powershell
cd "D:\IoT Project\dotwatch\esp32\dotwatch_esp32_product"
py -m platformio run -t clean
py -m platformio run
```

The PlatformIO platform is pinned to `espressif32@7.0.1`, matching the version previously used successfully by the project.
