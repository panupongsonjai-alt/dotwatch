param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [string]$OutputDir = '_backups\database',
  [switch]$SchemaOnly,
  [switch]$PlainSql,
  [switch]$NoDockerFallback,
  [string]$DockerImage = 'postgres:18-alpine',
  [string]$DockerContainerName,
  [switch]$NoDockerExecFallback
)

$ErrorActionPreference = 'Stop'

function Write-Section([string]$Message) {
  Write-Host "`n============================================================" -ForegroundColor DarkCyan
  Write-Host $Message -ForegroundColor Cyan
  Write-Host "============================================================" -ForegroundColor DarkCyan
}

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
    'วาง',
    'ตรงนี้',
    'Render External Database URL',
    'YOUR_',
    'your_',
    'REPLACE',
    'CHANGE_ME',
    'example\.com',
    '<[^>]+>',
    '\{[^}]+\}',
    'postgresql://user:password@host',
    'postgres://user:password@host'
  )

  foreach ($pattern in $patterns) {
    if ($Value -match $pattern) { return $true }
  }

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
  } catch {
    return '***invalid DATABASE_URL***'
  }
}

function Get-DatabaseCredentials([System.Uri]$Uri) {
  $user = $null
  $password = $null

  if (-not [string]::IsNullOrWhiteSpace($Uri.UserInfo)) {
    $parts = $Uri.UserInfo -split ':', 2
    if ($parts.Length -ge 1) { $user = [System.Uri]::UnescapeDataString($parts[0]) }
    if ($parts.Length -ge 2) { $password = [System.Uri]::UnescapeDataString($parts[1]) }
  }

  return [pscustomobject]@{
    User = $user
    Password = $password
  }
}

function Get-DatabaseUrlInfo([string]$Value) {
  if (Test-PlaceholderText $Value) {
    throw 'DATABASE_URL still looks like a placeholder. Copy the real Render External Database URL before running backup/migration.'
  }

  $uri = $null
  if (-not [System.Uri]::TryCreate($Value, [System.UriKind]::Absolute, [ref]$uri)) {
    throw 'DATABASE_URL is not a valid absolute PostgreSQL URL.'
  }

  if ($uri.Scheme -notin @('postgres', 'postgresql')) {
    throw "DATABASE_URL scheme must be postgres:// or postgresql://, got '$($uri.Scheme)'."
  }

  if ([string]::IsNullOrWhiteSpace($uri.Host)) {
    throw 'DATABASE_URL host is empty.'
  }

  $placeholderHosts = @('base', 'host', 'hostname', 'db-host', 'your-host', 'render-host')
  if ($placeholderHosts -contains $uri.Host.ToLowerInvariant()) {
    throw "DATABASE_URL host '$($uri.Host)' looks like a placeholder. Use the real Render PostgreSQL host."
  }

  $dbName = $uri.AbsolutePath.Trim('/')
  if ([string]::IsNullOrWhiteSpace($dbName)) {
    throw 'DATABASE_URL database name is empty.'
  }

  $cred = Get-DatabaseCredentials $uri
  if ([string]::IsNullOrWhiteSpace($cred.User)) {
    throw 'DATABASE_URL username is empty. Include user/password in the database URL.'
  }

  return [pscustomobject]@{
    Uri = $uri
    Host = $uri.Host
    Port = if ($uri.IsDefaultPort) { 5432 } else { $uri.Port }
    DatabaseName = $dbName
    User = $cred.User
    Password = $cred.Password
    IsLocalHost = Test-LocalDatabaseHost $uri.Host
    Masked = Get-MaskedDatabaseUrl $Value
  }
}

function Get-DockerSafeDatabaseUrl([string]$Value, [object]$DbInfo) {
  $dockerUrl = $Value
  $extraDockerArgs = @()
  $usedHostGateway = $false

  if ($DbInfo.IsLocalHost) {
    $builder = [System.UriBuilder]$Value
    $builder.Host = 'host.docker.internal'
    $builder.Port = [int]$DbInfo.Port
    $dockerUrl = $builder.Uri.AbsoluteUri
    $usedHostGateway = $true

    if (-not ($IsWindows -or $env:OS -eq 'Windows_NT') -and -not $IsMacOS) {
      $extraDockerArgs += @('--add-host', 'host.docker.internal:host-gateway')
    }
  }

  return [pscustomobject]@{
    DatabaseUrl = $dockerUrl
    ExtraDockerArgs = $extraDockerArgs
    UsedHostGateway = $usedHostGateway
    Masked = Get-MaskedDatabaseUrl $dockerUrl
  }
}

function Find-PostgresContainer([string]$DockerPath, [string]$PreferredName) {
  if (-not [string]::IsNullOrWhiteSpace($PreferredName)) {
    $inspectArgs = @('inspect', '-f', '{{.Name}} {{.State.Running}} {{.Config.Image}}', $PreferredName)
    $inspect = & $DockerPath @inspectArgs 2>$null
    if ($LASTEXITCODE -eq 0 -and $inspect -match ' True ') { return $PreferredName }
    throw "Docker container '$PreferredName' was not found or is not running."
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

    if ($score -gt 0) {
      $candidates += [pscustomobject]@{ Name = $name; Score = $score; Image = $image; Ports = $ports }
    }
  }

  $best = $candidates | Sort-Object Score -Descending | Select-Object -First 1
  if ($best) { return $best.Name }
  return $null
}

function Invoke-LocalPgDump([string]$PgDumpPath, [array]$DumpArgs) {
  & $PgDumpPath @DumpArgs
  $exitCode = if ($null -ne $LASTEXITCODE) { [int]$LASTEXITCODE } else { 1 }
  if ($exitCode -ne 0) { throw "pg_dump failed with exit code $exitCode" }
}

function Invoke-DockerExecPgDump([string]$DockerPath, [string]$ContainerName, [object]$DbInfo, [array]$DumpArgs, [string]$OutputFile, [string]$OutputName) {
  $containerOutputFile = "/tmp/$OutputName"

  Write-Host "Using Docker exec fallback container: $ContainerName" -ForegroundColor Yellow
  Write-Host 'This bypasses host.docker.internal and runs pg_dump inside the PostgreSQL container.' -ForegroundColor Yellow

  $execPrefix = @('exec')
  if (-not [string]::IsNullOrWhiteSpace($DbInfo.Password)) {
    $execPrefix += @('-e', "PGPASSWORD=$($DbInfo.Password)")
  }
  $execPrefix += @($ContainerName, 'pg_dump')

  $execDumpArgs = $DumpArgs + @('-U', $DbInfo.User, '-d', $DbInfo.DatabaseName, '-f', $containerOutputFile)
  $allArgs = $execPrefix + $execDumpArgs
  & $DockerPath @allArgs
  $dumpExit = if ($null -ne $LASTEXITCODE) { [int]$LASTEXITCODE } else { 1 }
  if ($dumpExit -ne 0) { throw "docker exec pg_dump failed with exit code $dumpExit" }

  $cpArgs = @('cp', "$($ContainerName):$containerOutputFile", $OutputFile)
  & $DockerPath @cpArgs
  $cpExit = if ($null -ne $LASTEXITCODE) { [int]$LASTEXITCODE } else { 1 }
  if ($cpExit -ne 0) { throw "docker cp backup failed with exit code $cpExit" }

  & $DockerPath @('exec', $ContainerName, 'rm', '-f', $containerOutputFile) | Out-Null
}

function Invoke-DockerPgDump([string]$DockerImageName, [string]$MountPath, [array]$DumpArgs, [array]$ExtraDockerArgs) {
  $dockerPath = Get-CommandPath 'docker'
  if (-not $dockerPath) {
    throw 'pg_dump was not found in PATH and Docker was not found either. Install PostgreSQL client tools or Docker Desktop.'
  }

  Write-Host "pg_dump was not found locally. Using Docker fallback image: $DockerImageName" -ForegroundColor Yellow
  Write-Host 'Docker may pull the PostgreSQL client image on the first run.' -ForegroundColor Yellow

  $dockerArgs = @('run', '--rm') + $ExtraDockerArgs + @('-v', "${MountPath}:/backup", $DockerImageName, 'pg_dump') + $DumpArgs
  & $dockerPath @dockerArgs
  $exitCode = if ($null -ne $LASTEXITCODE) { [int]$LASTEXITCODE } else { 1 }
  if ($exitCode -ne 0) {
    Write-Host "`nDocker run fallback troubleshooting:" -ForegroundColor Yellow
    Write-Host '- If DATABASE_URL uses localhost, Docker connects via host.docker.internal.' -ForegroundColor Yellow
    Write-Host '- If the local DB is not published on the host port, use Docker exec fallback instead.' -ForegroundColor Yellow
    Write-Host '- You can pass -DockerContainerName <container> if auto-detection picks the wrong container.' -ForegroundColor Yellow
    Write-Host '- If Render reports a newer PostgreSQL server version, rerun with -DockerImage postgres:<server-major>-alpine.' -ForegroundColor Yellow
    throw "Docker pg_dump failed with exit code $exitCode"
  }
}

if (-not $DatabaseUrl) { throw 'DATABASE_URL is required. Set $env:DATABASE_URL or pass -DatabaseUrl.' }

$dbInfo = Get-DatabaseUrlInfo $DatabaseUrl
$projectRootPath = [System.IO.Path]::GetFullPath($ProjectRoot).TrimEnd([char[]]@('\', '/'))
$outputRoot = Join-Path $projectRootPath $OutputDir
if (-not (Test-Path -LiteralPath $outputRoot)) { New-Item -ItemType Directory -Path $outputRoot | Out-Null }
$outputRoot = (Resolve-Path -LiteralPath $outputRoot).Path

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$pgDump = Get-CommandPath 'pg_dump'
$docker = Get-CommandPath 'docker'
$format = if ($PlainSql) { 'p' } else { 'c' }
$extension = if ($PlainSql) { 'sql' } else { 'dump' }
$scope = if ($SchemaOnly) { 'schema' } else { 'full' }
$outputFile = Join-Path $outputRoot "dotwatch-$scope-$timestamp.$extension"
$outputName = [System.IO.Path]::GetFileName($outputFile)
$containerOutputFile = "/backup/$outputName"
$dockerDb = Get-DockerSafeDatabaseUrl -Value $DatabaseUrl -DbInfo $dbInfo
$detectedContainer = $null
if ($dbInfo.IsLocalHost -and -not $pgDump -and -not $NoDockerFallback -and -not $NoDockerExecFallback -and $docker) {
  $detectedContainer = Find-PostgresContainer -DockerPath $docker -PreferredName $DockerContainerName
}

Write-Section 'dotWatch database backup'
Write-Host "ProjectRoot : $projectRootPath"
Write-Host "DatabaseUrl : $($dbInfo.Masked)"
Write-Host "DB Host     : $($dbInfo.Host)"
Write-Host "DB Name     : $($dbInfo.DatabaseName)"
if ($dbInfo.IsLocalHost) { Write-Host 'DB Target   : LOCAL database, not Render production' -ForegroundColor Yellow }
Write-Host "OutputFile  : $outputFile"
Write-Host "Format      : $(if ($PlainSql) { 'plain SQL' } else { 'custom pg_dump' })"
Write-Host "Scope       : $(if ($SchemaOnly) { 'schema only' } else { 'schema + data' })"
Write-Host "Tool        : $(if ($pgDump) { $pgDump } elseif ($detectedContainer) { "Docker exec fallback ($detectedContainer)" } elseif (-not $NoDockerFallback) { 'Docker run fallback' } else { 'not found' })"
if (-not $pgDump -and -not $NoDockerFallback -and $dockerDb.UsedHostGateway) {
  Write-Host "Docker DB URL: $($dockerDb.Masked)" -ForegroundColor Yellow
  Write-Host 'Note        : Docker run fallback rewrites localhost to host.docker.internal.' -ForegroundColor Yellow
}
if ($detectedContainer) {
  Write-Host "Docker exec : $detectedContainer" -ForegroundColor Yellow
  Write-Host 'Note        : For local Docker DB, this is usually more reliable than host.docker.internal.' -ForegroundColor Yellow
}

$dumpArgs = @('--no-owner', '--no-privileges', '--format', $format)
if ($SchemaOnly) { $dumpArgs += '--schema-only' }

if ($pgDump) {
  $localArgs = $dumpArgs + @('--file', $outputFile, $DatabaseUrl)
  Invoke-LocalPgDump -PgDumpPath $pgDump -DumpArgs $localArgs
} else {
  if ($NoDockerFallback) { throw 'pg_dump was not found in PATH. Install PostgreSQL client tools or remove -NoDockerFallback to use Docker fallback.' }
  if (-not $docker) { throw 'pg_dump was not found in PATH and Docker was not found either. Install PostgreSQL client tools or Docker Desktop.' }

  if ($detectedContainer) {
    Invoke-DockerExecPgDump -DockerPath $docker -ContainerName $detectedContainer -DbInfo $dbInfo -DumpArgs $dumpArgs -OutputFile $outputFile -OutputName $outputName
  } else {
    $dockerArgs = $dumpArgs + @('--file', $containerOutputFile, $dockerDb.DatabaseUrl)
    Invoke-DockerPgDump -DockerImageName $DockerImage -MountPath $outputRoot -DumpArgs $dockerArgs -ExtraDockerArgs $dockerDb.ExtraDockerArgs
  }
}

if (-not (Test-Path -LiteralPath $outputFile)) { throw "Backup output file was not created: $outputFile" }
$sizeMb = [math]::Round((Get-Item -LiteralPath $outputFile).Length / 1MB, 2)
Write-Host "`nBackup completed: $outputFile ($sizeMb MB)" -ForegroundColor Green
Write-Host 'Keep this file private. It may contain production customer/device data.' -ForegroundColor Yellow
