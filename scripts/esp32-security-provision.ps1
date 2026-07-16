param(
  [string]$RepoRoot = "D:\IoT Project\dotwatch",
  [Parameter(Mandatory = $true)][string]$Port,
  [ValidateSet("pilot", "release")][string]$Profile = "pilot",
  [Parameter(Mandatory = $true)][string]$SecureBootKeyPath,
  [string]$Confirmation = "",
  [switch]$ExecuteIrreversible,
  [switch]$AllowReleaseMode,
  [string]$Python = "python"
)

$ErrorActionPreference = "Stop"
$RepoRoot = [IO.Path]::GetFullPath($RepoRoot)

if ($Profile -eq "release" -and -not $AllowReleaseMode) {
  throw "Release mode requires -AllowReleaseMode after a successful expendable-board pilot."
}

$chip = & $Python -m esptool --chip esp32 --port $Port chip_id 2>&1
if ($LASTEXITCODE -ne 0) { throw "Unable to read chip identity" }
$chipText = $chip -join "`n"
if ($chipText -notmatch '(?i)MAC:\s*([0-9a-f:]{17})') { throw "Unable to determine device MAC" }
$mac = $Matches[1].ToLowerInvariant()
$token = "ENABLE_HARDWARE_TRUST_" + ($mac -replace ':', '').ToUpperInvariant()

Write-Host "============================================================"
Write-Host "IRREVERSIBLE ESP32 SECURITY OPERATION"
Write-Host "============================================================"
Write-Host "Port       : $Port"
Write-Host "MAC        : $mac"
Write-Host "Profile    : $Profile"
Write-Host "Confirmation token: $token"
Write-Host ""
Write-Host "This operation can permanently restrict serial reflashing and JTAG."
Write-Host "It must be performed first on a dedicated expendable pilot board."

if (-not $ExecuteIrreversible) {
  Write-Host ""
  Write-Host "PLAN ONLY: no flash or eFuse-changing operation was executed."
  Write-Host "Run readiness, backup, and build first:"
  Write-Host "powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\esp32-security-readiness.ps1 -RepoRoot `"$RepoRoot`" -Port `"$Port`""
  Write-Host "powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\esp32-security-backup-flash.ps1 -RepoRoot `"$RepoRoot`" -Port `"$Port`""
  Write-Host "powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\esp32-security-build.ps1 -RepoRoot `"$RepoRoot`" -Profile `"$Profile`" -SecureBootKeyPath `"$SecureBootKeyPath`" -Clean"
  Write-Host ""
  Write-Host "To execute after review, add: -ExecuteIrreversible -Confirmation `"$token`""
  exit 0
}

if ($Confirmation -cne $token) {
  throw "Confirmation mismatch. Required exact token: $token"
}

& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "scripts\esp32-security-readiness.ps1") -RepoRoot $RepoRoot -Port $Port -Python $Python
if ($LASTEXITCODE -ne 0) { throw "Readiness check failed" }
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "scripts\esp32-security-backup-flash.ps1") -RepoRoot $RepoRoot -Port $Port -Python $Python
if ($LASTEXITCODE -ne 0) { throw "Flash backup failed" }
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "scripts\esp32-security-build.ps1") -RepoRoot $RepoRoot -Profile $Profile -SecureBootKeyPath $SecureBootKeyPath -Python $Python -Clean
if ($LASTEXITCODE -ne 0) { throw "Secure build failed" }

$env:DOTWATCH_SECURE_BOOT_SIGNING_KEY = [IO.Path]::GetFullPath($SecureBootKeyPath)
$environment = if ($Profile -eq "release") { "esp32_product_secure_release" } else { "esp32_product_secure_pilot" }
$ProductRoot = Join-Path $RepoRoot "esp32\dotwatch_esp32_product"
Push-Location $ProductRoot
try {
  & $Python -m platformio run -e $environment -t upload --upload-port $Port
  if ($LASTEXITCODE -ne 0) { throw "Secure firmware upload failed before first boot verification" }
} finally {
  Pop-Location
}

Write-Host "Upload completed. Do not disconnect power during the first encrypted boot."
Write-Host "Wait until the device completes encryption and reboots, then verify:"
Write-Host "powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\esp32-security-verify-device.ps1 -RepoRoot `"$RepoRoot`" -Port `"$Port`" -Profile `"$Profile`""
