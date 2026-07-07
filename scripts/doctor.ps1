param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [switch]$RunBuild
)

$ErrorActionPreference = 'Stop'
$projectRootPath = (Resolve-Path $ProjectRoot).Path
Push-Location $projectRootPath

try {
  Write-Host 'dotWatch project doctor' -ForegroundColor Cyan
  Write-Host "Project root: $projectRootPath"
  Write-Host ''

  $requiredFiles = @(
    'package.json',
    'docker-compose.yml',
    'services/backend/package.json',
    'services/backend/.env.example',
    'apps/dashboard/package.json',
    'apps/dashboard/.env.example',
    'apps/admin/package.json',
    'apps/admin/.env.example',
    'pi/agent/main.py',
    'pi/agent/.env.example'
  )

  foreach ($file in $requiredFiles) {
    if (Test-Path (Join-Path $projectRootPath $file)) {
      Write-Host "OK      $file" -ForegroundColor Green
    } else {
      Write-Host "MISSING $file" -ForegroundColor Red
    }
  }

  Write-Host ''
  Write-Host 'Tool check:' -ForegroundColor Cyan

  foreach ($tool in @('node', 'npm', 'docker')) {
    $cmd = Get-Command $tool -ErrorAction SilentlyContinue
    if ($cmd) {
      $version = (& $tool --version 2>$null | Select-Object -First 1)
      Write-Host "OK      $tool $version" -ForegroundColor Green
    } else {
      Write-Host "MISSING $tool" -ForegroundColor Yellow
    }
  }

  Write-Host ''
  Write-Host 'Sensitive file scan:' -ForegroundColor Cyan
  & (Join-Path $projectRootPath 'scripts/scan-sensitive-files.ps1') -ProjectRoot $projectRootPath -AllowLocalEnv

  if ($RunBuild) {
    Write-Host ''
    Write-Host 'Running install/build checks. This can take a while on first run.' -ForegroundColor Cyan
    npm run install:all
    npm run check:all
  } else {
    Write-Host ''
    Write-Host 'Skip build check. Add -RunBuild to install dependencies and run build checks.' -ForegroundColor Yellow
  }
} finally {
  Pop-Location
}
