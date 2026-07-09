param(
  [string]$RepoRoot = "D:\IoT Project\dotwatch",
  [string]$PackDir = "D:\IoT Project\dotwatch",
  [string]$Port = "",
  [switch]$InstallFiles,
  [switch]$Build,
  [switch]$Upload,
  [switch]$Monitor,
  [switch]$Commit,
  [switch]$Push
)

$ErrorActionPreference = "Stop"

function Section($Title) {
  Write-Host ""
  Write-Host "============================================================" -ForegroundColor DarkGray
  Write-Host $Title -ForegroundColor Cyan
  Write-Host "============================================================" -ForegroundColor DarkGray
}

function Ensure-Dir($Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
  }
}

function Copy-PackFile($SourceName, $Destination) {
  $source = Join-Path $PackDir $SourceName
  if (-not (Test-Path -LiteralPath $source)) {
    throw "Missing pack file: $source"
  }

  Ensure-Dir (Split-Path $Destination -Parent)

  $sourceFull = [System.IO.Path]::GetFullPath($source)
  $destFull = [System.IO.Path]::GetFullPath($Destination)

  if ($sourceFull.Equals($destFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    Write-Host "Skip self-copy: $SourceName" -ForegroundColor Yellow
    return
  }

  Copy-Item -LiteralPath $source -Destination $Destination -Force
  Write-Host "Copied $SourceName -> $Destination" -ForegroundColor Green
}

function Run-Pio($ProjectDir, $ArgsList) {
  Push-Location $ProjectDir
  try {
    Write-Host "> py -m platformio $($ArgsList -join ' ')" -ForegroundColor DarkGray
    & py -m platformio @ArgsList
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed: py -m platformio $($ArgsList -join ' ')"
    }
  } finally {
    Pop-Location
  }
}

$RepoRoot = [System.IO.Path]::GetFullPath($RepoRoot)
$PackDir = [System.IO.Path]::GetFullPath($PackDir)

if (-not (Test-Path -LiteralPath $RepoRoot)) {
  throw "RepoRoot not found: $RepoRoot"
}

Set-Location $RepoRoot

$ProjectDir = Join-Path $RepoRoot "esp32\dotwatch_esp32_dht3_tls_hardened"
$MainCpp = Join-Path $ProjectDir "src\main.cpp"

Section "dotWatch Phase 5A - ESP32 TLS Hardening"
Write-Host "RepoRoot    : $RepoRoot"
Write-Host "PackDir     : $PackDir"
Write-Host "ProjectDir  : $ProjectDir"
Write-Host "Port        : $(if ($Port) { $Port } else { '(auto)' })"
Write-Host "InstallFiles: $InstallFiles"
Write-Host "Build       : $Build"
Write-Host "Upload      : $Upload"
Write-Host "Monitor     : $Monitor"
Write-Host "Commit      : $Commit"
Write-Host "Push        : $Push"

if ($InstallFiles) {
  Section "1. Install files"
  Copy-PackFile "main.cpp" $MainCpp
  Copy-PackFile "dotwatch_esp32_dht3_tls_hardened.ino" (Join-Path $ProjectDir "dotwatch_esp32_dht3_tls_hardened.ino")
  Copy-PackFile "platformio.ini" (Join-Path $ProjectDir "platformio.ini")
  Copy-PackFile "README_PHASE5A_ESP32_TLS_HARDENING.md" (Join-Path $RepoRoot "README_PHASE5A_ESP32_TLS_HARDENING.md")
} else {
  Section "1. Install skipped"
  Write-Host "Add -InstallFiles to copy files into repo." -ForegroundColor Yellow
}

Section "2. Verify project structure"
if (-not (Test-Path -LiteralPath (Join-Path $ProjectDir "platformio.ini"))) { throw "Missing platformio.ini" }
if (-not (Test-Path -LiteralPath $MainCpp)) { throw "Missing src\main.cpp" }

$content = Get-Content -LiteralPath $MainCpp -Raw
if ($content -notmatch "esp32-dht3-tls-hardening-0\.5\.0") { throw "Firmware version marker missing" }
if ($content -notmatch "setCACert") { throw "setCACert marker missing" }
if ($content -notmatch "Root CA Certificate") { throw "Root CA UI marker missing" }
if ($content -notmatch "TLS mode: Root CA verification enabled") { throw "TLS Serial marker missing" }

Write-Host "Phase 5A TLS markers OK" -ForegroundColor Green

Get-ChildItem -Force $ProjectDir | Select-Object Name, Length | Format-Table -AutoSize
Get-ChildItem -Force (Join-Path $ProjectDir "src") | Select-Object Name, Length | Format-Table -AutoSize

Section "3. PlatformIO"
& py -m platformio --version
if ($LASTEXITCODE -ne 0) {
  throw "PlatformIO is not available. Run: py -m pip install --upgrade platformio"
}

if ($Build) {
  Section "4. Build"
  Run-Pio $ProjectDir @("run")
}

if ($Upload) {
  Section "5. Upload"
  $args = @("run", "-t", "upload")
  if ($Port) { $args += @("--upload-port", $Port) }
  Run-Pio $ProjectDir $args
}

if ($Monitor) {
  Section "6. Monitor"
  Write-Host "Press Ctrl+C to stop monitor." -ForegroundColor Yellow
  Push-Location $ProjectDir
  try {
    $args = @("-m", "platformio", "device", "monitor", "-b", "115200")
    if ($Port) { $args += @("-p", $Port) }
    & py @args
  } finally {
    Pop-Location
  }
}

Section "7. Git status"
git status --short

if ($Commit) {
  Section "8. Stage Phase 5A files only"
  git restore --staged . 2>$null

  git add `
    "esp32/dotwatch_esp32_dht3_tls_hardened/platformio.ini" `
    "esp32/dotwatch_esp32_dht3_tls_hardened/src/main.cpp" `
    "esp32/dotwatch_esp32_dht3_tls_hardened/dotwatch_esp32_dht3_tls_hardened.ino" `
    "README_PHASE5A_ESP32_TLS_HARDENING.md"

  if ($LASTEXITCODE -ne 0) { throw "git add failed" }

  Section "9. Staged diff"
  git diff --cached --name-status

  $bad = git diff --cached --name-status | Where-Object {
    $_ -match "^D\s+" -or $_ -match "_cleanup_trash|_reports|Pasted text|\.env|secret|SECRET|\.pio"
  }

  if ($bad) {
    Write-Host "Blocked unsafe staged files:" -ForegroundColor Red
    $bad | ForEach-Object { Write-Host $_ -ForegroundColor Red }
    exit 2
  }

  Section "10. Commit"
  git diff --cached --quiet
  if ($LASTEXITCODE -eq 0) {
    Write-Host "No staged changes to commit." -ForegroundColor Yellow
  } else {
    git commit -m "Add ESP32 TLS hardening firmware"
    if ($LASTEXITCODE -ne 0) { throw "git commit failed" }
  }

  if ($Push) {
    Section "11. Push"
    git push origin main
    if ($LASTEXITCODE -ne 0) { throw "git push failed" }
  }
}

Section "Done"
Write-Host "Phase 5A ESP32 TLS hardening is ready." -ForegroundColor Green
