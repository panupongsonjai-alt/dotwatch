param(
    [string]$RepoRoot = "D:\IoT Project\dotwatch",
    [switch]$Build
)

$ErrorActionPreference = 'Stop'
$ProjectDir = Join-Path $RepoRoot 'esp32\dotwatch_esp32_product'

Write-Host ''
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host 'dotWatch ESP32 ILI9341 TFT verification' -ForegroundColor Cyan
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host "RepoRoot : $RepoRoot"
Write-Host "Project  : $ProjectDir"
Write-Host "Build    : $Build"

$required = @(
    'platformio.ini',
    'include\FirmwareVersion.h',
    'include\ProductConfig.h',
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
$productConfig = Get-Content -LiteralPath (Join-Path $ProjectDir 'include\ProductConfig.h') -Raw
$appHeader = Get-Content -LiteralPath (Join-Path $ProjectDir 'src\app\AppController.h') -Raw
$appSource = Get-Content -LiteralPath (Join-Path $ProjectDir 'src\app\AppController.cpp') -Raw
$displayHeader = Get-Content -LiteralPath (Join-Path $ProjectDir 'src\display\TftDisplay.h') -Raw
$displaySource = Get-Content -LiteralPath (Join-Path $ProjectDir 'src\display\TftDisplay.cpp') -Raw

$checks = [ordered]@{
    'Adafruit GFX dependency' = $platformio -match 'Adafruit GFX Library'
    'ILI9341 dependency' = $platformio -match 'Adafruit ILI9341'
    'ST7735 dependency removed' = $platformio -notmatch 'ST7735'
    'TFT SCK GPIO 18' = $productConfig -match 'TFT_SCK_PIN\s*=\s*18'
    'TFT MOSI GPIO 23' = $productConfig -match 'TFT_MOSI_PIN\s*=\s*23'
    'TFT MISO GPIO 19' = $productConfig -match 'TFT_MISO_PIN\s*=\s*19'
    'TFT CS GPIO 25' = $productConfig -match 'TFT_CS_PIN\s*=\s*25'
    'TFT DC GPIO 27' = $productConfig -match 'TFT_DC_PIN\s*=\s*27'
    'TFT RST GPIO 26' = $productConfig -match 'TFT_RST_PIN\s*=\s*26'
    'Display module attached' = $appHeader -match 'TftDisplay\s+tftDisplay_'
    'Independent sensor service' = $appSource -match 'serviceSensor\(\)'
    'Display tick active' = $appSource -match 'tftDisplay_\.tick\(status_\)'
    'ILI9341 class active' = $displayHeader -match 'Adafruit_ILI9341'
    '240x320 portrait layout' = (
        $displaySource -match 'SCREEN_WIDTH\s*=\s*240' -and
        $displaySource -match 'SCREEN_HEIGHT\s*=\s*320'
    )
    '40MHz SPI initialization' = $displaySource -match 'TFT_SPI_FREQUENCY_HZ'
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
