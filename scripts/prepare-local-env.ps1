param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [switch]$Overwrite
)

$ErrorActionPreference = 'Stop'

$items = @(
  @{ Source = 'services/backend/.env.example'; Target = 'services/backend/.env' },
  @{ Source = 'apps/dashboard/.env.example'; Target = 'apps/dashboard/.env.local' },
  @{ Source = 'apps/admin/.env.example'; Target = 'apps/admin/.env.local' }
)

foreach ($item in $items) {
  $source = Join-Path $ProjectRoot $item.Source
  $target = Join-Path $ProjectRoot $item.Target

  if (-not (Test-Path $source)) {
    Write-Warning "Missing example file: $($item.Source)"
    continue
  }

  if ((Test-Path $target) -and -not $Overwrite) {
    Write-Host "Skip existing: $($item.Target)" -ForegroundColor Yellow
    continue
  }

  Copy-Item -LiteralPath $source -Destination $target -Force
  Write-Host "Created: $($item.Target)" -ForegroundColor Green
}

Write-Host ''
Write-Host 'Next steps:' -ForegroundColor Cyan
Write-Host '1) Fill Firebase web config in apps/dashboard/.env.local and apps/admin/.env.local if login is needed.'
Write-Host '2) Keep DEV_AUTH_BYPASS=true only for local backend testing.'
Write-Host '3) Never commit real .env files.'
