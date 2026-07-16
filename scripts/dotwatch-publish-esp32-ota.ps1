param(
  [string]$RepoRoot = "D:\IoT Project\dotwatch",
  [string]$Version = "",
  [int]$BuildNumber = 0,
  [ValidateSet("stable", "beta")][string]$Channel = "stable",
  [string]$Notes = "",
  [switch]$Mandatory,
  [switch]$AutoInstall
)

$ErrorActionPreference = "Stop"

$ProductDir = Join-Path $RepoRoot "esp32\dotwatch_esp32_product"
$FirmwarePath = Join-Path $ProductDir ".pio\build\esp32_product\firmware.bin"
$VersionHeader = Join-Path $ProductDir "include\FirmwareVersion.h"
$OtaServerDir = Join-Path $RepoRoot "services\ota-server"
$PublishScript = Join-Path $OtaServerDir "scripts\publish-release.mjs"

if (-not (Test-Path $RepoRoot)) {
  throw "RepoRoot not found: $RepoRoot"
}
if (-not (Test-Path $VersionHeader)) {
  throw "FirmwareVersion.h not found: $VersionHeader"
}
if (-not (Test-Path $FirmwarePath)) {
  throw "Firmware not found: $FirmwarePath`nRun: py -m platformio run"
}
if (-not (Test-Path $PublishScript)) {
  throw "OTA publish script not found: $PublishScript"
}

$headerText = Get-Content -Raw -LiteralPath $VersionHeader
$versionMatch = [regex]::Match($headerText, '#define\s+DOTWATCH_FIRMWARE_VERSION\s+"([^"]+)"')
$buildMatch = [regex]::Match($headerText, '#define\s+DOTWATCH_FIRMWARE_BUILD\s+(\d+)(?:UL|U|L)?')
if (-not $versionMatch.Success -or -not $buildMatch.Success) {
  throw "Cannot read DOTWATCH_FIRMWARE_VERSION / DOTWATCH_FIRMWARE_BUILD from $VersionHeader"
}

$headerVersion = $versionMatch.Groups[1].Value
$headerBuild = [int]$buildMatch.Groups[1].Value

if ([string]::IsNullOrWhiteSpace($Version)) {
  $Version = $headerVersion
} elseif ($Version -ne $headerVersion) {
  throw "Version mismatch: parameter=$Version, FirmwareVersion.h=$headerVersion"
}

if ($BuildNumber -le 0) {
  $BuildNumber = $headerBuild
} elseif ($BuildNumber -ne $headerBuild) {
  throw "Build mismatch: parameter=$BuildNumber, FirmwareVersion.h=$headerBuild"
}

$firmwareInfo = Get-Item -LiteralPath $FirmwarePath
$maxFirmwareBytes = 0x170000
if ($firmwareInfo.Length -le 0 -or $firmwareInfo.Length -gt $maxFirmwareBytes) {
  throw "Firmware size $($firmwareInfo.Length) bytes exceeds OTA slot limit $maxFirmwareBytes bytes"
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "dotWatch ESP32 Internet OTA publish" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Firmware : $FirmwarePath"
Write-Host "Size     : $($firmwareInfo.Length) bytes"
Write-Host "Version  : $Version"
Write-Host "Build    : $BuildNumber"
Write-Host "Channel  : $Channel"
Write-Host "Mandatory: $($Mandatory.IsPresent)"
Write-Host "Auto     : $($AutoInstall.IsPresent)"

Push-Location $OtaServerDir
try {
  $arguments = @(
    $PublishScript,
    "--file", $FirmwarePath,
    "--version", $Version,
    "--build", $BuildNumber.ToString(),
    "--model", "esp32_dht3",
    "--channel", $Channel,
    "--notes", $Notes
  )
  if ($Mandatory.IsPresent) { $arguments += @("--mandatory", "true") }
  if ($AutoInstall.IsPresent) { $arguments += @("--auto", "true") }

  & node @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "publish-release.mjs failed with exit code $LASTEXITCODE"
  }
}
finally {
  Pop-Location
}

Write-Host ""
Write-Host "Release prepared. Review then push:" -ForegroundColor Green
Write-Host "cd `"$RepoRoot`""
Write-Host "git status"
Write-Host "git add services/ota-server/releases"
Write-Host "git commit -m `"release(esp32): publish $Version build $BuildNumber`""
Write-Host "git push origin main"
