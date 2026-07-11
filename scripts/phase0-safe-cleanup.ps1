param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$ArchiveRoot = '_archive',
  [switch]$Apply
)

$ErrorActionPreference = 'Stop'

function Get-RelativePathCompat {
  param(
    [Parameter(Mandatory = $true)][string]$BasePath,
    [Parameter(Mandatory = $true)][string]$TargetPath
  )

  $base = [System.IO.Path]::GetFullPath($BasePath).TrimEnd([char[]]@('\', '/'))
  $target = [System.IO.Path]::GetFullPath($TargetPath)

  if ($target.StartsWith($base, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $target.Substring($base.Length).TrimStart([char[]]@('\', '/')).Replace('\', '/')
  }

  return $target.Replace('\', '/')
}

function Add-Candidate {
  param(
    [Parameter(Mandatory = $true)]$List,
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Reason
  )

  if (-not (Test-Path -LiteralPath $Path)) { return }

  $item = Get-Item -LiteralPath $Path -Force
  $relative = Get-RelativePathCompat -BasePath $script:Root -TargetPath $item.FullName

  if ($relative -eq '.git' -or $relative.StartsWith('.git/', [System.StringComparison]::OrdinalIgnoreCase)) { return }
  if ($relative -like '*.env' -or $relative -like '*.env.*') { return }

  $List.Add([pscustomobject]@{
    FullName = $item.FullName
    Relative = $relative
    IsDirectory = $item.PSIsContainer
    Reason = $Reason
  }) | Out-Null
}

$script:Root = (Resolve-Path $ProjectRoot).Path
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$archivePath = Join-Path $script:Root (Join-Path $ArchiveRoot "phase0-$timestamp")
$candidates = New-Object System.Collections.Generic.List[object]

# Generated directories and reports that should not live in a clean source export.
$knownDirectories = @(
  '.pio',
  '_reports',
  'diagnostics',
  'apps/dashboard/dist',
  'apps/admin/dist',
  'services/backend/dist',
  'esp32/dotwatch_esp32_product/.pio'
)

foreach ($relative in $knownDirectories) {
  Add-Candidate -List $candidates -Path (Join-Path $script:Root $relative) -Reason 'generated/report/cache directory'
}

# Backup files created by previous patch iterations.
Get-ChildItem -Path $script:Root -Recurse -Force -File | Where-Object {
  $relative = Get-RelativePathCompat -BasePath $script:Root -TargetPath $_.FullName
  $leaf = $_.Name

  if ($relative.StartsWith('_archive/', [System.StringComparison]::OrdinalIgnoreCase)) { return $false }
  if ($relative.StartsWith('_export/', [System.StringComparison]::OrdinalIgnoreCase)) { return $false }
  if ($relative -like '.git/*' -or $relative -like 'node_modules/*' -or $relative -like '*/node_modules/*') { return $false }
  if ($leaf -like '*.bak-*' -or $leaf -like '*.pre-*.bak') { return $true }

  return $false
} | ForEach-Object {
  Add-Candidate -List $candidates -Path $_.FullName -Reason 'backup file from previous patch'
}

# Root-level scratch files. These are archived, not deleted.
$rootScratch = @(
  'config.pi.current-after-429.py',
  'dotwatch_api.fixed.py',
  'dotwatch_api.pi.current.py',
  'errorHandler.fixed.js',
  'ingest.controller.fixed.js',
  'main.pi-final-queue-safe.py',
  'main.pi.current-after-429.py',
  'main.rpi-agent-429-fixed.py',
  'pi_header_probe.py'
)

foreach ($relative in $rootScratch) {
  Add-Candidate -List $candidates -Path (Join-Path $script:Root $relative) -Reason 'root-level scratch/snapshot file'
}

$unique = $candidates | Sort-Object Relative -Unique

Write-Host ''
Write-Host 'dotWatch Phase 0 safe cleanup' -ForegroundColor Yellow
Write-Host "Project root : $script:Root"
Write-Host "Mode         : $(if ($Apply) { 'APPLY - files will be moved to archive' } else { 'DRY RUN - no files will be moved' })"
Write-Host "Archive      : $archivePath"
Write-Host ''

if (-not $unique -or $unique.Count -eq 0) {
  Write-Host 'No cleanup candidates found.' -ForegroundColor Green
  exit 0
}

$unique | Select-Object Relative, Reason | Format-Table -AutoSize

if (-not $Apply) {
  Write-Host ''
  Write-Host 'Dry run complete. Re-run with -Apply to move these files into _archive.' -ForegroundColor Cyan
  exit 0
}

New-Item -ItemType Directory -Path $archivePath -Force | Out-Null
$manifest = New-Object System.Collections.Generic.List[object]

foreach ($item in $unique) {
  if (-not (Test-Path -LiteralPath $item.FullName)) { continue }

  $destination = Join-Path $archivePath $item.Relative
  $destinationDir = Split-Path $destination -Parent

  if (-not (Test-Path $destinationDir)) {
    New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
  }

  Move-Item -LiteralPath $item.FullName -Destination $destination -Force

  $manifest.Add([pscustomobject]@{
    Relative = $item.Relative
    Reason = $item.Reason
    ArchivedTo = (Get-RelativePathCompat -BasePath $script:Root -TargetPath $destination)
  }) | Out-Null
}

$manifestPath = Join-Path $archivePath 'manifest.json'
$manifest | ConvertTo-Json -Depth 4 | Set-Content -Path $manifestPath -Encoding UTF8

Write-Host ''
Write-Host 'Phase 0 cleanup completed.' -ForegroundColor Green
Write-Host "Manifest: $manifestPath" -ForegroundColor Cyan
Write-Host 'Nothing was deleted. Files were moved to _archive so they can be restored if needed.' -ForegroundColor Yellow
