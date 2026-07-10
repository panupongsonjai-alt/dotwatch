param(
    [string]$RepoRoot = "D:\IoT Project\dotwatch",
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

$ProjectDir = Join-Path $RepoRoot 'esp32\dotwatch_esp32_product'

Write-Host ''
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host 'dotWatch Phase 12A - ESP32 Product Core Verify' -ForegroundColor Cyan
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host "RepoRoot  : $RepoRoot"
Write-Host "ProjectDir: $ProjectDir"
Write-Host "SkipBuild : $SkipBuild"

$requiredFiles = @(
    'platformio.ini',
    'README.md',
    'include\AppTypes.h',
    'include\FirmwareVersion.h',
    'include\ProductConfig.h',
    'include\dotwatch_root_ca.h',
    'src\main.cpp',
    'src\app\AppController.h',
    'src\app\AppController.cpp',
    'src\backend\BackendClient.h',
    'src\backend\BackendClient.cpp',
    'src\config\ConfigStore.h',
    'src\config\ConfigStore.cpp',
    'src\network\WiFiManager.h',
    'src\network\WiFiManager.cpp',
    'src\network\TimeService.h',
    'src\network\TimeService.cpp',
    'src\portal\PortalServer.h',
    'src\portal\PortalServer.cpp',
    'src\portal\PortalAssets.h',
    'src\recovery\RecoveryManager.h',
    'src\recovery\RecoveryManager.cpp',
    'src\sensors\SensorManager.h',
    'src\sensors\SensorManager.cpp',
    'src\status\StatusLed.h',
    'src\status\StatusLed.cpp',
    'src\utils\StringUtils.h',
    'src\utils\StringUtils.cpp'
)

$missing = @()
foreach ($relativePath in $requiredFiles) {
    $fullPath = Join-Path $ProjectDir $relativePath
    if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
        $missing += $relativePath
    }
}

if ($missing.Count -gt 0) {
    Write-Host 'Required files: FAILED' -ForegroundColor Red
    foreach ($item in $missing) {
        Write-Host "- Missing: $item" -ForegroundColor Red
    }
    exit 1
}

Write-Host 'Required files: OK' -ForegroundColor Green

$inoFiles = @(Get-ChildItem -LiteralPath $ProjectDir -Filter '*.ino' -File -Recurse)
if ($inoFiles.Count -gt 0) {
    Write-Host 'Duplicate .ino source: FAILED' -ForegroundColor Red
    $inoFiles | ForEach-Object { Write-Host "- $($_.FullName)" -ForegroundColor Red }
    exit 1
}

Write-Host 'Duplicate .ino source: none' -ForegroundColor Green

$mainPath = Join-Path $ProjectDir 'src\main.cpp'
$mainLineCount = (Get-Content -LiteralPath $mainPath).Count
if ($mainLineCount -gt 30) {
    Write-Host "main.cpp size: FAILED ($mainLineCount lines)" -ForegroundColor Red
    exit 1
}

Write-Host "main.cpp size: OK ($mainLineCount lines)" -ForegroundColor Green

$markers = @(
    @{ Path = 'src\config\ConfigStore.cpp'; Pattern = 'stageWiFi' },
    @{ Path = 'src\network\WiFiManager.cpp'; Pattern = 'promotePendingWiFi' },
    @{ Path = 'src\backend\BackendClient.cpp'; Pattern = 'metric_1' },
    @{ Path = 'src\backend\BackendClient.cpp'; Pattern = 'x-device-secret' },
    @{ Path = 'src\portal\PortalServer.cpp'; Pattern = 'wifi-scan' },
    @{ Path = 'include\FirmwareVersion.h'; Pattern = 'DOTWATCH_FIRMWARE_VERSION' }
)

foreach ($marker in $markers) {
    $path = Join-Path $ProjectDir $marker.Path
    $match = Select-String -LiteralPath $path -SimpleMatch $marker.Pattern
    if (-not $match) {
        Write-Host "Marker check: FAILED ($($marker.Path) -> $($marker.Pattern))" -ForegroundColor Red
        exit 1
    }
}

Write-Host 'Architecture markers: OK' -ForegroundColor Green

if (-not $SkipBuild) {
    Write-Host ''
    Write-Host 'Running PlatformIO build...' -ForegroundColor Yellow
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
    Write-Host 'PlatformIO build: OK' -ForegroundColor Green
}

Write-Host ''
Write-Host 'Phase 12A verification completed.' -ForegroundColor Green
