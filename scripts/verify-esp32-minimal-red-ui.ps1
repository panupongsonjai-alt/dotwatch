param(
    [string]$RepoRoot = "D:\IoT Project\dotwatch",
    [switch]$Build
)

$ErrorActionPreference = 'Stop'
$ProjectDir = Join-Path $RepoRoot 'esp32\dotwatch_esp32_product'

Write-Host ''
Write-Host '============================================================' -ForegroundColor Red
Write-Host 'dotWatch Minimal Red UI verification' -ForegroundColor Red
Write-Host '============================================================' -ForegroundColor Red
Write-Host "RepoRoot : $RepoRoot"
Write-Host "Project  : $ProjectDir"
Write-Host "Build    : $Build"

$required = @(
    'platformio.ini',
    'include\FirmwareVersion.h',
    'include\ProductConfig.h',
    'include\lv_conf.h',
    'src\app\AppController.h',
    'src\app\AppController.cpp',
    'src\display\TftDisplay.h',
    'src\display\TftDisplay.cpp'
)

$missing = @()
foreach ($relative in $required) {
    $path = Join-Path $ProjectDir $relative
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        $missing += $relative
    }
}

if ($missing.Count -gt 0) {
    Write-Host 'Required files: FAILED' -ForegroundColor Red
    $missing | ForEach-Object { Write-Host "- $_" -ForegroundColor Red }
    exit 1
}

$platformio = Get-Content -LiteralPath (Join-Path $ProjectDir 'platformio.ini') -Raw
$firmware = Get-Content -LiteralPath (Join-Path $ProjectDir 'include\FirmwareVersion.h') -Raw
$productConfig = Get-Content -LiteralPath (Join-Path $ProjectDir 'include\ProductConfig.h') -Raw
$lvConf = Get-Content -LiteralPath (Join-Path $ProjectDir 'include\lv_conf.h') -Raw
$appSource = Get-Content -LiteralPath (Join-Path $ProjectDir 'src\app\AppController.cpp') -Raw
$displayHeader = Get-Content -LiteralPath (Join-Path $ProjectDir 'src\display\TftDisplay.h') -Raw
$displaySource = Get-Content -LiteralPath (Join-Path $ProjectDir 'src\display\TftDisplay.cpp') -Raw

$checks = [ordered]@{
    'Firmware minimal red UI version' = $firmware -match '1\.2\.0-minimal-red-ui'
    'Landscape rotation configured' = $productConfig -match 'TFT_ROTATION\s*=\s*1'
    'Display width 320' = $displayHeader -match 'DISPLAY_WIDTH\s*=\s*320'
    'Display height 240' = $displayHeader -match 'DISPLAY_HEIGHT\s*=\s*240'
    'Black background UI' = $displaySource -match 'COLOR_BACKGROUND_HEX\s*=\s*0x000000'
    'Red accent UI' = $displaySource -match 'COLOR_RED_HEX'
    'Top right signal icon' = $displaySource -match 'createSignalIcon'
    'Top right battery icon' = $displaySource -match 'createBatteryIcon'
    'Bottom online status' = $displaySource -match 'createBottomStatus'
    'Temperature label present' = $displaySource -match '"Temperature"'
    'Humidity label present' = $displaySource -match '"Humidity"'
    'Humidity shows one decimal' = $displaySource -match '"%.1f", status\.lastHumidity'
    'Montserrat 18 label font' = $displaySource -match 'lv_font_montserrat_18'
    'Montserrat 40 value font' = $displaySource -match 'lv_font_montserrat_40'
    'LVGL line enabled in platformio' = $platformio -match 'LV_USE_LINE=1'
    'LVGL line enabled in lv_conf' = $lvConf -match 'LV_USE_LINE\s+1'
    'LVGL font flags exported' = (
        $platformio -match 'LV_FONT_MONTSERRAT_12=1' -and
        $platformio -match 'LV_FONT_MONTSERRAT_14=1' -and
        $platformio -match 'LV_FONT_MONTSERRAT_18=1' -and
        $platformio -match 'LV_FONT_MONTSERRAT_40=1'
    )
    'LVGL pinned to 8.4.0' = $platformio -match 'lvgl/lvgl@8\.4\.0'
    'Architecture banner updated' = $appSource -match 'minimal red live display'
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

$pinValues = @{
    DHT = 4
    LED = 2
    RESET = 0
    TFT_SCK = 18
    TFT_MOSI = 23
    TFT_MISO = 19
    TFT_CS = 25
    TFT_DC = 27
    TFT_RST = 26
}

$duplicates = $pinValues.GetEnumerator() |
    Group-Object Value |
    Where-Object Count -gt 1

if ($duplicates) {
    Write-Host 'Pin conflict check: FAILED' -ForegroundColor Red
    foreach ($group in $duplicates) {
        $names = ($group.Group.Name -join ', ')
        Write-Host "- GPIO $($group.Name): $names" -ForegroundColor Red
    }
    $failed += 'Pin conflict'
} else {
    Write-Host 'Pin conflict check: OK' -ForegroundColor Green
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
