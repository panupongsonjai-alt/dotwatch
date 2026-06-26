param(
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [string]$OutputDir = ".\backups"
)

if (-not $DatabaseUrl) {
  Write-Error "DATABASE_URL is required. Set env:DATABASE_URL or pass -DatabaseUrl."
  exit 1
}

if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
  Write-Error "pg_dump not found. Install PostgreSQL client tools and add them to PATH."
  exit 1
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

if (-not (Test-Path $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$outputFile = Join-Path $OutputDir "dotwatch-backup-$timestamp.dump"

Write-Host "Creating backup..."
Write-Host "Output: $outputFile"

pg_dump $DatabaseUrl `
  --format=custom `
  --compress=9 `
  --no-owner `
  --no-privileges `
  --file=$outputFile

if ($LASTEXITCODE -ne 0) {
  Write-Error "Backup failed."
  exit $LASTEXITCODE
}

Write-Host "Backup completed: $outputFile"
