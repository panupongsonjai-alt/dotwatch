param(
    [string]$RepoRoot = "D:\IoT Project\dotwatch",
    [switch]$Build
)

$ErrorActionPreference = 'Stop'
$ProjectDir = Join-Path $RepoRoot 'esp32\dotwatch_esp32_product'
$PlatformIoFile = Join-Path $ProjectDir 'platformio.ini'
$FirmwareFile = Join-Path $ProjectDir 'include\FirmwareVersion.h'
$LvConfFile = Join-Path $ProjectDir 'include\lv_conf.h'
$DisplaySourceFile = Join-Path $ProjectDir 'src\display\TftDisplay.cpp'

Write-Host ''
Write-Host '============================================================' -ForegroundColor Red
Write-Host 'dotWatch LVGL Font Link Hotfix verification' -ForegroundColor Red
Write-Host '============================================================' -ForegroundColor Red
Write-Host "RepoRoot : $RepoRoot"
Write-Host "Project  : $ProjectDir"
Write-Host "Build    : $Build"

$required = @(
    $PlatformIoFile,
    $FirmwareFile,
    $LvConfFile,
    $DisplaySourceFile
)

$missing = @($required | Where-Object {
    -not (Test-Path -LiteralPath $_ -PathType Leaf)
})

if ($missing.Count -gt 0) {
    Write-Host 'Required files: FAILED' -ForegroundColor Red
    $missing | ForEach-Object { Write-Host "- $_" -ForegroundColor Red }
    exit 1
}

$platformio = Get-Content -LiteralPath $PlatformIoFile -Raw
$firmware = Get-Content -LiteralPath $FirmwareFile -Raw
$lvConf = Get-Content -LiteralPath $LvConfFile -Raw
$displaySource = Get-Content -LiteralPath $DisplaySourceFile -Raw

$fontSizes = @(12, 14, 18, 28, 40)
$checks = [ordered]@{
    'Firmware hotfix version' =
        $firmware -match '1\.1\.8-lvgl-font-link-fix'
    'LVGL pinned to 8.4.0' =
        $platformio -match 'lvgl/lvgl@8\.4\.0'
    'Project include path exported to libraries' =
        $platformio -match '(?m)^\s*-Iinclude\s*$'
    'LV_CONF simple include exported' =
        $platformio -match 'LV_CONF_INCLUDE_SIMPLE=1'
    'LVGL color depth exported' =
        $platformio -match 'LV_COLOR_DEPTH=16'
    'LVGL label enabled globally' =
        $platformio -match 'LV_USE_LABEL=1'
    'LVGL bar enabled globally' =
        $platformio -match 'LV_USE_BAR=1'
    'Display uses Montserrat 40' =
        $displaySource -match 'lv_font_montserrat_40'
}

foreach ($size in $fontSizes) {
    $checks["Montserrat $size compiler flag"] =
        $platformio -match "LV_FONT_MONTSERRAT_${size}=1"
    $checks["Montserrat $size lv_conf setting"] =
        $lvConf -match "LV_FONT_MONTSERRAT_${size}\s+1"
}

$failed = @()
foreach ($entry in $checks.GetEnumerator()) {
    if ($entry.Value) {
        Write-Host "OK   $($entry.Key)" -ForegroundColor Green
    } else {
        Write-Host "FAIL $($entry.Key)" -ForegroundColor Red
        $failed += $entry.Key
    }
}

if ($failed.Count -gt 0) {
    Write-Host ''
    Write-Host 'Verification: FAILED' -ForegroundColor Red
    exit 1
}

if ($Build) {
    Write-Host ''
    Write-Host 'Cleaning stale PlatformIO objects...' -ForegroundColor Cyan
    Push-Location $ProjectDir
    try {
        python -m platformio run --target clean
        if ($LASTEXITCODE -ne 0) {
            throw "PlatformIO clean failed with exit code $LASTEXITCODE"
        }

        Write-Host ''
        Write-Host 'Running clean PlatformIO build...' -ForegroundColor Cyan
        python -m platformio run
        if ($LASTEXITCODE -ne 0) {
            throw "PlatformIO build failed with exit code $LASTEXITCODE"
        }
    }
    finally {
        Pop-Location
    }
}

Write-Host ''
Write-Host 'Verification: PASSED' -ForegroundColor Green
