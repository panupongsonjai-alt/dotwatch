param(
  [string]$RepoRoot = "D:\IoT Project\dotwatch"
)

$ErrorActionPreference = 'Stop'

$resolvedRepo = (Resolve-Path -LiteralPath $RepoRoot).Path
$payloadRoot = Join-Path $PSScriptRoot 'payload'

if (-not (Test-Path -LiteralPath $payloadRoot)) {
  throw "Patch payload not found: $payloadRoot"
}

$requiredPath = Join-Path $resolvedRepo 'apps\dashboard\src\styles\pages'
if (-not (Test-Path -LiteralPath $requiredPath)) {
  throw "Invalid dotWatch repository: $resolvedRepo"
}

Write-Host "Applying Alarm/Notification filter parity patch..." -ForegroundColor Cyan

Get-ChildItem -LiteralPath $payloadRoot -Recurse -File | ForEach-Object {
  $relativePath = $_.FullName.Substring($payloadRoot.Length).TrimStart('\', '/')
  $destination = Join-Path $resolvedRepo $relativePath
  $destinationDirectory = Split-Path -Parent $destination

  if (-not (Test-Path -LiteralPath $destinationDirectory)) {
    New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
  }

  Copy-Item -LiteralPath $_.FullName -Destination $destination -Force
  Write-Host "Updated: $relativePath" -ForegroundColor Green
}

$unusedPaths = @(
  'patch_history_clear_data_inside_card',
  'patch_metric_alarm_reference_layout'
)

foreach ($relativePath in $unusedPaths) {
  $target = Join-Path $resolvedRepo $relativePath
  if (Test-Path -LiteralPath $target) {
    Remove-Item -LiteralPath $target -Recurse -Force
    Write-Host "Removed unused path: $relativePath" -ForegroundColor Yellow
  }
}

Write-Host "Patch completed successfully." -ForegroundColor Green
