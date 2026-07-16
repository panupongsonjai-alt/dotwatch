# Phase S3B Windows Secure Build Hotfix v4

## Root cause

PlatformIO mixed-framework mode (`framework = arduino, espidf`) appends the
installed Arduino framework package directory to ESP-IDF `EXTRA_COMPONENT_DIRS`.
The package directory is named `framework-arduinoespressif32`, so declaring
`REQUIRES arduino` in the project component causes ESP-IDF 4.4.7 to fail with:

```
Failed to resolve component 'arduino'.
```

PlatformIO's official mixed Arduino/ESP-IDF examples do not declare an explicit
Arduino component requirement. This hotfix removes only that invalid dependency
while retaining direct ESP-IDF dependencies used by dotWatch source files.

## Safety

This patch changes only CMake dependency metadata. It does not upload firmware,
burn eFuse, enable Secure Boot, or enable Flash Encryption.

## Apply

```powershell
$ZipFile = "$env:USERPROFILE\Downloads\dotwatch-phase-s3b-windows-build-hotfix-v4-direct-to-dotwatch.zip"
$RepoRoot = "D:\IoT Project\dotwatch"

Expand-Archive -LiteralPath $ZipFile -DestinationPath $RepoRoot -Force
```

## Verify

```powershell
Select-String `
  -Path "D:\IoT Project\dotwatch\esp32\dotwatch_esp32_product\src\CMakeLists.txt" `
  -Pattern "REQUIRES arduino|framework-arduinoespressif32"
```

The command may show the explanatory comment containing
`framework-arduinoespressif32`, but must not show an active `REQUIRES arduino`
entry.

## Force a fresh configure and build

```powershell
Set-Location "D:\IoT Project\dotwatch"

$BuildRoot = ".\esp32\dotwatch_esp32_product\.pio\build\esp32_product_secure_pilot"
$GeneratedSdkConfig = ".\esp32\dotwatch_esp32_product\sdkconfig.secure.pilot.generated"

Remove-Item -LiteralPath $BuildRoot -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $GeneratedSdkConfig -Force -ErrorAction SilentlyContinue

$SecureBootKey = "$env:USERPROFILE\.dotwatch\esp32-security\dotwatch-secure-boot-v2-2026-01.secure-boot-v2.pem"

npm run esp32:security:build -- `
  -RepoRoot "D:\IoT Project\dotwatch" `
  -Profile pilot `
  -SecureBootKeyPath $SecureBootKey `
  -Clean
```

Do not use `-ExecuteIrreversible` until build and signature verification pass.
