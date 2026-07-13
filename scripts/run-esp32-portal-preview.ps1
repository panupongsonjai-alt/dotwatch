param(
  [string]$RepoRoot = "D:\IoT Project\dotwatch",
  [string]$Esp32Url = "http://192.168.1.103",
  [ValidateRange(1024, 65535)]
  [int]$Port = 5174,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

function Write-Section {
  param([string]$Text)
  Write-Host ""
  Write-Host "============================================================" -ForegroundColor DarkGray
  Write-Host $Text -ForegroundColor Cyan
  Write-Host "============================================================" -ForegroundColor DarkGray
}

$previewDir = Join-Path $RepoRoot "esp32\dotwatch_esp32_product\portal-preview"
$serverFile = Join-Path $previewDir "dev-server.mjs"

Write-Section "dotWatch ESP32 Portal Live Preview"
Write-Host "RepoRoot : $RepoRoot"
Write-Host "Preview  : $previewDir"
Write-Host "ESP32 URL: $Esp32Url"
Write-Host "Local URL: http://localhost:$Port"

if (-not (Test-Path -LiteralPath $serverFile -PathType Leaf)) {
  throw "Preview server not found: $serverFile"
}

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
  throw "Node.js was not found. Install Node.js or add node.exe to PATH."
}

if ($Esp32Url -notmatch '^https?://[^/]+(?::\d+)?/?$') {
  throw "Esp32Url must look like http://192.168.1.103"
}

$env:ESP32_TARGET = $Esp32Url.TrimEnd('/')
$env:PORT = [string]$Port

if (-not $NoBrowser) {
  Start-Job -ScriptBlock {
    param($Url)
    Start-Sleep -Milliseconds 900
    Start-Process $Url
  } -ArgumentList "http://localhost:$Port" | Out-Null
}

Write-Host ""
Write-Host "Edit these files while the server is running:" -ForegroundColor Yellow
Write-Host "- esp32\dotwatch_esp32_product\portal-preview\index.html"
Write-Host "- esp32\dotwatch_esp32_product\portal-preview\src\styles\ (modular CSS)"
Write-Host ""
Write-Host "Stop the preview with Ctrl+C" -ForegroundColor Yellow
Write-Host ""

Push-Location $previewDir
try {
  & node $serverFile
  if ($LASTEXITCODE -ne 0) {
    throw "Preview server exited with code $LASTEXITCODE"
  }
}
finally {
  Pop-Location
}
