param(
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [switch]$RequirePgDump,
  [switch]$RequireDockerOrPgDump,
  [switch]$RequireRender,
  [string]$DockerContainerName
)

$ErrorActionPreference = 'Stop'

function Get-CommandPath([string]$Name) {
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  if ($IsWindows -or $env:OS -eq 'Windows_NT') {
    $roots = @('C:\Program Files\PostgreSQL', 'C:\Program Files (x86)\PostgreSQL')
    foreach ($root in $roots) {
      if (Test-Path -LiteralPath $root) {
        $candidate = Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue |
          Sort-Object Name -Descending |
          ForEach-Object { Join-Path $_.FullName "bin\$Name.exe" } |
          Where-Object { Test-Path -LiteralPath $_ } |
          Select-Object -First 1
        if ($candidate) { return $candidate }
      }
    }
  }
  return $null
}

function Test-PlaceholderText([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return $true }
  $patterns = @(
    'วาง', 'ตรงนี้', 'Render External Database URL', 'YOUR_', 'your_',
    'REPLACE', 'CHANGE_ME', 'example\.com', '<[^>]+>', '\{[^}]+\}',
    'postgresql://user:password@host', 'postgres://user:password@host'
  )
  foreach ($pattern in $patterns) { if ($Value -match $pattern) { return $true } }
  return $false
}

function Test-LocalDatabaseHost([string]$HostName) {
  if ([string]::IsNullOrWhiteSpace($HostName)) { return $false }
  return $HostName.ToLowerInvariant() -in @('localhost', '127.0.0.1', '::1')
}

function Get-MaskedDatabaseUrl([string]$Value) {
  try {
    $uri = [System.Uri]$Value
    $auth = if ($uri.UserInfo) { '***:***@' } else { '' }
    $port = if ($uri.IsDefaultPort) { '' } else { ":$($uri.Port)" }
    $query = if ($uri.Query) { '?***' } else { '' }
    return "$($uri.Scheme)://${auth}$($uri.Host)$port$($uri.AbsolutePath)$query"
  } catch { return '***invalid DATABASE_URL***' }
}

function Get-DockerSafeDatabaseUrl([string]$Value, [object]$DbInfo) {
  if (-not $DbInfo.IsLocalHost) { return [pscustomobject]@{ Masked = Get-MaskedDatabaseUrl $Value; UsedHostGateway = $false } }
  $builder = [System.UriBuilder]$Value
  $builder.Host = 'host.docker.internal'
  $builder.Port = [int]$DbInfo.Port
  return [pscustomobject]@{ Masked = Get-MaskedDatabaseUrl $builder.Uri.AbsoluteUri; UsedHostGateway = $true }
}

function Get-DatabaseUrlInfo([string]$Value) {
  if (Test-PlaceholderText $Value) { throw 'DATABASE_URL still looks like a placeholder. Copy the real Render External Database URL before running backup/migration.' }
  $uri = $null
  if (-not [System.Uri]::TryCreate($Value, [System.UriKind]::Absolute, [ref]$uri)) { throw 'DATABASE_URL is not a valid absolute PostgreSQL URL.' }
  if ($uri.Scheme -notin @('postgres', 'postgresql')) { throw "DATABASE_URL scheme must be postgres:// or postgresql://, got '$($uri.Scheme)'." }
  if ([string]::IsNullOrWhiteSpace($uri.Host)) { throw 'DATABASE_URL host is empty.' }
  $placeholderHosts = @('base', 'host', 'hostname', 'db-host', 'your-host', 'render-host')
  if ($placeholderHosts -contains $uri.Host.ToLowerInvariant()) { throw "DATABASE_URL host '$($uri.Host)' looks like a placeholder. Use the real Render PostgreSQL host." }
  $dbName = $uri.AbsolutePath.Trim('/')
  if ([string]::IsNullOrWhiteSpace($dbName)) { throw 'DATABASE_URL database name is empty.' }
  return [pscustomobject]@{
    Host = $uri.Host
    Port = if ($uri.IsDefaultPort) { 5432 } else { $uri.Port }
    DatabaseName = $dbName
    IsLocalHost = Test-LocalDatabaseHost $uri.Host
    Masked = Get-MaskedDatabaseUrl $Value
  }
}

function Find-PostgresContainer([string]$DockerPath, [string]$PreferredName) {
  if (-not $DockerPath) { return $null }
  if (-not [string]::IsNullOrWhiteSpace($PreferredName)) {
    $inspect = & $DockerPath inspect -f '{{.Name}} {{.State.Running}} {{.Config.Image}}' $PreferredName 2>$null
    if ($LASTEXITCODE -eq 0 -and $inspect -match ' True ') { return $PreferredName }
    return $null
  }
  $lines = & $DockerPath ps --format '{{.Names}}|{{.Image}}|{{.Ports}}' 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $lines) { return $null }
  $candidates = @()
  foreach ($line in $lines) {
    $parts = $line -split '\|', 3
    if ($parts.Length -lt 2) { continue }
    $name = $parts[0]
    $image = $parts[1]
    $ports = if ($parts.Length -ge 3) { $parts[2] } else { '' }
    $text = "$name $image $ports".ToLowerInvariant()
    $score = 0
    if ($text -match 'postgres|timescale|timescaledb') { $score += 50 }
    if ($name.ToLowerInvariant() -match 'dotwatch') { $score += 25 }
    if ($name.ToLowerInvariant() -match 'db|postgres|timescale') { $score += 15 }
    if ($ports -match '5432') { $score += 5 }
    if ($score -gt 0) { $candidates += [pscustomobject]@{ Name = $name; Score = $score } }
  }
  $best = $candidates | Sort-Object Score -Descending | Select-Object -First 1
  if ($best) { return $best.Name }
  return $null
}

Write-Host "`n============================================================" -ForegroundColor DarkCyan
Write-Host 'dotWatch DB environment check' -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor DarkCyan

if (-not $DatabaseUrl) { throw 'DATABASE_URL is required. Set $env:DATABASE_URL or pass -DatabaseUrl.' }

$dbInfo = Get-DatabaseUrlInfo $DatabaseUrl
$dockerDb = Get-DockerSafeDatabaseUrl -Value $DatabaseUrl -DbInfo $dbInfo
Write-Host "DATABASE_URL : $($dbInfo.Masked)" -ForegroundColor Green
Write-Host "DB Host      : $($dbInfo.Host)"
Write-Host "DB Port      : $($dbInfo.Port)"
Write-Host "DB Name      : $($dbInfo.DatabaseName)"

if ($dbInfo.IsLocalHost) {
  Write-Host "DB Target    : LOCAL database, not Render production" -ForegroundColor Yellow
  Write-Host "Docker URL   : $($dockerDb.Masked)" -ForegroundColor Yellow
  Write-Host 'Docker note  : Docker run fallback rewrites localhost to host.docker.internal.' -ForegroundColor Yellow
}

if ($RequireRender -and $dbInfo.IsLocalHost) { throw 'RequireRender was set, but DATABASE_URL points to localhost. Set the real Render External Database URL first.' }

$pgDump = Get-CommandPath 'pg_dump'
$pgRestore = Get-CommandPath 'pg_restore'
$psql = Get-CommandPath 'psql'
$docker = Get-CommandPath 'docker'
$pgContainer = if ($dbInfo.IsLocalHost -and $docker) { Find-PostgresContainer -DockerPath $docker -PreferredName $DockerContainerName } else { $null }

Write-Host "`nTools"
Write-Host "pg_dump    : $(if ($pgDump) { $pgDump } else { 'not found' })"
Write-Host "pg_restore : $(if ($pgRestore) { $pgRestore } else { 'not found' })"
Write-Host "psql       : $(if ($psql) { $psql } else { 'not found' })"
Write-Host "docker     : $(if ($docker) { $docker } else { 'not found' })"
if ($dbInfo.IsLocalHost) { Write-Host "postgres container fallback : $(if ($pgContainer) { $pgContainer } else { 'not detected' })" }

if ($RequirePgDump -and -not $pgDump) { throw 'pg_dump is required but was not found. Install PostgreSQL client tools or add PostgreSQL bin folder to PATH.' }
if ($RequireDockerOrPgDump -and -not $pgDump -and -not $docker) { throw 'Neither pg_dump nor Docker was found. Install PostgreSQL client tools or Docker Desktop before db:backup.' }

if ($pgDump) { Write-Host "`nOK: local pg_dump is available." -ForegroundColor Green }
elseif ($dbInfo.IsLocalHost -and $pgContainer) { Write-Host "`nOK: db:backup can use Docker exec fallback with container '$pgContainer'." -ForegroundColor Yellow }
elseif ($docker) { Write-Host "`nOK: pg_dump is not installed locally, but db:backup can use Docker run fallback." -ForegroundColor Yellow }

Write-Host 'DB environment check: OK' -ForegroundColor Green
