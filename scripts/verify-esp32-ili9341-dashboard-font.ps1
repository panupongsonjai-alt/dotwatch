param(
    [string]$RepoRoot = "D:\IoT Project\dotwatch",
    [switch]$Build
)

$ErrorActionPreference = 'Stop'
$ProjectDir = Join-Path $RepoRoot 'esp32\dotwatch_esp32_product'

Write-Host ''
Write-Host '============================================================' -ForegroundColor Red
Write-Host 'dotWatch ILI9341 Dashboard Font verification' -ForegroundColor Red
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
Write-Host 'Required files: OK' -ForegroundColor Green

$platformio = Get-Content -LiteralPath (Join-Path $ProjectDir 'platformio.ini') -Raw
$firmware = Get-Content -LiteralPath (Join-Path $ProjectDir 'include\FirmwareVersion.h') -Raw
$lvConf = Get-Content -LiteralPath (Join-Path $ProjectDir 'include\lv_conf.h') -Raw
$appHeader = Get-Content -LiteralPath (Join-Path $ProjectDir 'src\app\AppController.h') -Raw
$appSource = Get-Content -LiteralPath (Join-Path $ProjectDir 'src\app\AppController.cpp') -Raw
$displayHeader = Get-Content -LiteralPath (Join-Path $ProjectDir 'src\display\TftDisplay.h') -Raw
$displaySource = Get-Content -LiteralPath (Join-Path $ProjectDir 'src\display\TftDisplay.cpp') -Raw
$productConfig = Get-Content -LiteralPath (Join-Path $ProjectDir 'include\ProductConfig.h') -Raw

$checks = [ordered]@{
    'Firmware dashboard font version' = $firmware -match '1\.1\.7-ili9341-dashboard-font'
    'LVGL dependency' = $platformio -match 'lvgl/lvgl'
    'LVGL config include flag' = $platformio -match 'LV_CONF_INCLUDE_SIMPLE'
    'Montserrat 12 enabled' = $lvConf -match 'LV_FONT_MONTSERRAT_12\s+1'
    'Montserrat 14 enabled' = $lvConf -match 'LV_FONT_MONTSERRAT_14\s+1'
    'Montserrat 18 enabled' = $lvConf -match 'LV_FONT_MONTSERRAT_18\s+1'
    'Montserrat 28 enabled' = $lvConf -match 'LV_FONT_MONTSERRAT_28\s+1'
    'Montserrat 40 enabled' = $lvConf -match 'LV_FONT_MONTSERRAT_40\s+1'
    'LVGL display driver' = $displaySource -match 'lv_disp_drv_register'
    'LVGL partial draw buffer' = $displayHeader -match 'DRAW_BUFFER_ROWS'
    'Dashboard value typography' = $displaySource -match 'lv_font_montserrat_40'
    'Dashboard brand typography' = $displaySource -match 'lv_font_montserrat_28'
    'Bitmap FreeSans removed' = $displaySource -notmatch 'FreeSans'
    'Adafruit setTextSize removed' = $displaySource -notmatch 'setTextSize'
    'Red dashboard palette' = (
        $displaySource -match 'COLOR_RED_PRIMARY_HEX' -and
        $displaySource -match 'COLOR_RED_BRIGHT_HEX'
    )
    'Metric bars retained' = $displaySource -match 'lv_bar_create'
    'Session extrema retained' = $displaySource -match 'updateSessionExtrema'
    'WiFi RSSI retained' = $displaySource -match 'WiFi\.RSSI\(\)'
    'IP address retained' = $displaySource -match 'WiFi\.localIP\(\)'
    'Sensor age retained' = $displaySource -match 'lastSensorReadAtMs'
    'LVGL architecture banner' = $appSource -match 'LVGL ILI9341 dashboard'
    'Display controller attached' = $appHeader -match 'TftDisplay\s+tftDisplay_'
    'TFT SCK GPIO 18' = $productConfig -match 'TFT_SCK_PIN\s*=\s*18'
    'TFT MOSI GPIO 23' = $productConfig -match 'TFT_MOSI_PIN\s*=\s*23'
    'TFT MISO GPIO 19' = $productConfig -match 'TFT_MISO_PIN\s*=\s*19'
    'TFT CS GPIO 25' = $productConfig -match 'TFT_CS_PIN\s*=\s*25'
    'TFT DC GPIO 27' = $productConfig -match 'TFT_DC_PIN\s*=\s*27'
    'TFT RST GPIO 26' = $productConfig -match 'TFT_RST_PIN\s*=\s*26'
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
    Write-Host 'Running PlatformIO build...' -ForegroundColor Cyan
    Push-Location $ProjectDir
    try {
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
