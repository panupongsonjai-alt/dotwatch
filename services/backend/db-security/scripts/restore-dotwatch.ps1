param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile,

  [string]$DatabaseUrl = $env:DATABASE_URL
)

if (-not $DatabaseUrl) {
  Write-Error "DATABASE_URL is required. Set env:DATABASE_URL or pass -DatabaseUrl."
  exit 1
}

if (-not (Test-Path $BackupFile)) {
  Write-Error "Backup file not found: $BackupFile"
  exit 1
}

if (-not (Get-Command pg_restore -ErrorAction SilentlyContinue)) {
  Write-Error "pg_restore not found. Install PostgreSQL client tools and add them to PATH."
  exit 1
}

Write-Host "Restoring backup..."
Write-Host "File: $BackupFile"

pg_restore `
  --dbname=$DatabaseUrl `
  --clean `
  --if-exists `
  --no-owner `
  --no-privileges `
  $BackupFile

if ($LASTEXITCODE -ne 0) {
  Write-Error "Restore failed."
  exit $LASTEXITCODE
}

Write-Host "Restore completed."
