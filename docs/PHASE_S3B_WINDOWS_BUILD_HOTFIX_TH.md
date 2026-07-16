# Phase S3B Windows Secure Build Hotfix

## Root cause

The failed build was caused by two Windows toolchain compatibility issues, not by C++ source code:

1. The repository path contains whitespace: `D:\IoT Project\dotwatch`.
2. PlatformIO created the ESP-IDF 4.4.7 Python environment with Python 3.14, while this ESP-IDF generation requires an older supported Python runtime.

The failure appeared while installing `esp-windows-curses` and then PlatformIO reported a whitespace character in project paths.

## What the hotfix changes

- Selects Python 3.11 automatically when available through `py -3.11`.
- Rejects Python versions newer than 3.11 for this ESP-IDF build.
- Removes only an incompatible disposable `.espidf-4.4.7` virtual environment so PlatformIO can recreate it.
- Maps the ESP32 project temporarily to a free drive letter without whitespace using `subst`.
- Builds into the original repository `.pio` folder and removes the temporary drive mapping afterward.
- Does not move the repository and does not change eFuse or flash the board.

## One-time preparation

```powershell
py -3.11 --version
py -3.11 -m pip install --upgrade platformio esptool
```

If `py -3.11` is not installed, install Python 3.11 first, then rerun the command above.

## Run the secure pilot build

```powershell
Set-Location "D:\IoT Project\dotwatch"

$SecureBootKey = "$env:USERPROFILE\.dotwatch\esp32-security\dotwatch-secure-boot-v2-2026-01.secure-boot-v2.pem"

npm run esp32:security:build -- `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -Profile pilot `
  -SecureBootKeyPath $SecureBootKey `
  -Clean
```

## Expected pass output

```text
Python version     : 3.11
Build path mapping : W: -> D:\IoT Project\dotwatch\esp32\dotwatch_esp32_product
...
PASS: secure firmware build completed
```

## Expected safe failure when Python 3.11 is missing

```text
No compatible PlatformIO Python was found.
ESP-IDF 4.4.7 in this project must use Python 3.11 or older, not Python 3.14.
```

No firmware is flashed and no eFuse is changed when the build fails.
