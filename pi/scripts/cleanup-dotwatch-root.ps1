param(
  [switch]$Apply,
  [switch]$Permanent,
  [switch]$CleanRootNodeModules
)

$ErrorActionPreference = "Stop"
$Root = (Get-Location).Path
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$ArchiveDir = Join-Path $Root "_archive\cleanup-$Timestamp"

$ArchiveTargets = @(
  "dotwatch-pi-agent",
  "dotwatch-pi-config-ui-status",
  "dotwatch-realtime-test-tools",
  "scripts"
)

if ($CleanRootNodeModules) {
  $ArchiveTargets += "node_modules"
}

Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "dotWatch root cleanup" -ForegroundColor Cyan
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "Root      : $Root"
Write-Host "Mode      : $(if ($Apply) { if ($Permanent) { 'DELETE PERMANENTLY' } else { 'MOVE TO ARCHIVE' } } else { 'DRY RUN' })"
Write-Host "Archive   : $ArchiveDir"
Write-Host ""

Write-Host "Keep these folders/files:" -ForegroundColor Green
@(
  ".github", ".vscode", "docs", "dotwatch-admin", "dotwatch-backend", "dotwatch-dashboard",
  "dotwatch-firmware", "dotwatch-pi", ".gitignore", ".prettierrc", "docker-compose.yml",
  "package.json", "package-lock.json", "README.md"
) | ForEach-Object { Write-Host "  KEEP    $_" }

Write-Host ""
Write-Host "Archive/delete candidates:" -ForegroundColor Yellow
foreach ($name in $ArchiveTargets) {
  $path = Join-Path $Root $name
  if (Test-Path $path) {
    Write-Host "  FOUND   $name"
  } else {
    Write-Host "  MISSING $name" -ForegroundColor DarkGray
  }
}

Write-Host ""
if (-not $Apply) {
  Write-Host "Dry run only. Nothing was changed." -ForegroundColor Yellow
  Write-Host "Run again with -Apply to move items into _archive." -ForegroundColor Yellow
  exit 0
}

if (-not $Permanent) {
  New-Item -ItemType Directory -Force -Path $ArchiveDir | Out-Null
}

foreach ($name in $ArchiveTargets) {
  $path = Join-Path $Root $name
  if (-not (Test-Path $path)) { continue }

  if ($Permanent) {
    Write-Host "Deleting permanently: $name" -ForegroundColor Red
    Remove-Item -LiteralPath $path -Recurse -Force
  } else {
    $dest = Join-Path $ArchiveDir $name
    Write-Host "Moving to archive: $name -> $dest" -ForegroundColor Yellow
    Move-Item -LiteralPath $path -Destination $dest -Force
  }
}

Write-Host ""
Write-Host "Cleanup completed." -ForegroundColor Green
if (-not $Permanent) {
  Write-Host "Archived files are here: $ArchiveDir" -ForegroundColor Green
  Write-Host "If everything works, you can delete _archive later." -ForegroundColor Green
}
