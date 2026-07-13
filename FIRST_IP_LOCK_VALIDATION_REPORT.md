# First IP Lock Validation Report

Date: 2026-07-12

## Passed

- Modular portal build: `npm run build`
- Firmware asset sync: `npm run sync`
- JavaScript syntax checks
- Modular structure verification
- Preview server startup
- Preview HTTP response
- Wi-Fi page contains `IP Mode`, `Locked First IP`, and `เรียนรู้ Fixed IP ใหม่`
- Route `/wifi-ip-relearn` is registered
- `/json` includes `ipMode`, `lockedIp`, and `rememberFirstIp`
- Config schema bumped to 3
- Firmware version/build bumped to `esp32-product-1.1.1-fixed-ip` / `1110`
- ZIP excludes `.pio` and `node_modules`

## Firmware compile status

A complete PlatformIO compile could not be completed in the build environment because PlatformIO timed out while downloading `espressif32@7.0.1`. No compiler error from the modified source was produced before the timeout. Run the following on the target Windows machine:

```powershell
cd "D:\IoT Project\dotwatch\esp32\dotwatch_esp32_product"
py -m platformio run -t clean
py -m platformio run
```
