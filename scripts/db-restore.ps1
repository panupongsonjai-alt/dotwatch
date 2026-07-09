param(
  [Parameter(Mandatory = $true)][string]$BackupFile,
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [switch]$Clean,
  [switch]$Apply,
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
  return [pscustomobject]@{ User = $user; Password = $password }
}

function Get-DatabaseUrlInfo([string]$Value) {
  if (Test-PlaceholderText $Value) { throw 'DATABASE_URL still looks like a placeholder. Copy the real Render External Database URL before running restore.' }
  $uri = $null
  if (-not [System.Uri]::TryCreate($Value, [System.UriKind]::Absolute, [ref]$uri)) { throw 'DATABASE_URL is not a valid absolute PostgreSQL URL.' }
  if ($uri.Scheme -notin @('postgres', 'postgresql')) { throw "DATABASE_URL scheme must be postgres:// or postgresql://, got '$($uri.Scheme)'." }
  if ([string]::IsNullOrWhiteSpace($uri.Host)) { throw 'DATABASE_URL host is empty.' }

  $placeholderHosts = @('base', 'host', 'hostname', 'db-host', 'your-host', 'render-host')
  if ($placeholderHosts -contains $uri.Host.ToLowerInvariant()) { throw "DATABASE_URL host '$($uri.Host)' looks like a placeholder. Use the real Render PostgreSQL host." }

  $dbName = $uri.AbsolutePath.Trim('/')
  if ([string]::IsNullOrWhiteSpace($dbName)) { throw 'DATABASE_URL database name is empty.' }

  $cred = Get-DatabaseCredentials $uri
  if ([string]::IsNullOrWhiteSpace($cred.User)) { throw 'DATABASE_URL username is empty. Include user/password in the database URL.' }

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
    if (-not ($IsWindows -or $env:OS -eq 'Windows_NT') -and -not $IsMacOS) { $extraDockerArgs += @('--add-host', 'host.docker.internal:host-gateway') }
  }
  return [pscustomobject]@{ DatabaseUrl = $dockerUrl; ExtraDockerArgs = $extraDockerArgs; UsedHostGateway = $usedHostGateway; Masked = Get-MaskedDatabaseUrl $dockerUrl }
}

function Find-PostgresContainer([string]$DockerPath, [string]$PreferredName) {
  if (-not [string]::IsNullOrWhiteSpace($PreferredName)) {
    $inspect = & $DockerPath inspect -f '{{.Name}} {{.State.Running}} {{.Config.Image}}' $PreferredName 2>$null
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
    if ($score -gt 0) { $candidates += [pscustomobject]@{ Name = $name; Score = $score } }
  }
  $best = $candidates | Sort-Object Score -Descending | Select-Object -First 1
  if ($best) { return $best.Name }
  return $null
}

function Invoke-DockerExecRestore([string]$DockerPath, [string]$ContainerName, [object]$DbInfo, [string]$BackupPath, [string]$BackupName, [bool]$IsPlainSql, [bool]$CleanRestore) {
  $containerBackup = "/tmp/$BackupName"
  Write-Host "Using Docker exec fallback container: $ContainerName" -ForegroundColor Yellow
  Write-Host 'This restores from inside the PostgreSQL container and bypasses host.docker.internal.' -ForegroundColor Yellow

  & $DockerPath @('cp', $BackupPath, "$($ContainerName):$containerBackup")
  $cpExit = if ($null -ne $LASTEXITCODE) { [int]$LASTEXITCODE } else { 1 }
  if ($cpExit -ne 0) { throw "docker cp restore file failed with exit code $cpExit" }

  $execPrefix = @('exec')
  if (-not [string]::IsNullOrWhiteSpace($DbInfo.Password)) { $execPrefix += @('-e', "PGPASSWORD=$($DbInfo.Password)") }

  if ($IsPlainSql) {
    $allArgs = $execPrefix + @($ContainerName, 'psql', '-U', $DbInfo.User, '-d', $DbInfo.DatabaseName, '-v', 'ON_ERROR_STOP=1', '-f', $containerBackup)
  } else {
    $restoreArgs = @('--no-owner', '--no-privileges', '-U', $DbInfo.User, '-d', $DbInfo.DatabaseName)
    if ($CleanRestore) { $restoreArgs = @('--clean', '--if-exists') + $restoreArgs }
    $restoreArgs += $containerBackup
    $allArgs = $execPrefix + @($ContainerName, 'pg_restore') + $restoreArgs
  }

  & $DockerPath @allArgs
  $restoreExit = if ($null -ne $LASTEXITCODE) { [int]$LASTEXITCODE } else { 1 }
  & $DockerPath @('exec', $ContainerName, 'rm', '-f', $containerBackup) | Out-Null
  if ($restoreExit -ne 0) { throw "docker exec restore failed with exit code $restoreExit" }
}

if (-not $DatabaseUrl) { throw 'DATABASE_URL is required. Set $env:DATABASE_URL or pass -DatabaseUrl.' }
$dbInfo = Get-DatabaseUrlInfo $DatabaseUrl
$dockerDb = Get-DockerSafeDatabaseUrl -Value $DatabaseUrl -DbInfo $dbInfo
if (-not (Test-Path -LiteralPath $BackupFile)) { throw "Backup file not found: $BackupFile" }

$backupPath = (Resolve-Path -LiteralPath $BackupFile).Path
$backupDir = Split-Path -Parent $backupPath
$backupName = Split-Path -Leaf $backupPath
$extension = [System.IO.Path]::GetExtension($backupPath).ToLowerInvariant()
$isPlainSql = $extension -eq '.sql'
$tool = if ($isPlainSql) { 'psql' } else { 'pg_restore' }
$cmd = Get-CommandPath $tool
$docker = Get-CommandPath 'docker'
$detectedContainer = $null
if ($dbInfo.IsLocalHost -and -not $cmd -and -not $NoDockerFallback -and -not $NoDockerExecFallback -and $docker) {
  $detectedContainer = Find-PostgresContainer -DockerPath $docker -PreferredName $DockerContainerName
}
$toolLabel = if ($cmd) { $cmd } elseif ($detectedContainer) { "Docker exec fallback ($detectedContainer)" } elseif (-not $NoDockerFallback -and $docker) { "Docker run fallback ($DockerImage)" } else { 'not found' }

Write-Section 'dotWatch database restore safety check'
Write-Host "BackupFile : $backupPath"
Write-Host "DatabaseUrl: $($dbInfo.Masked)"
Write-Host "DB Host    : $($dbInfo.Host)"
Write-Host "DB Name    : $($dbInfo.DatabaseName)"
if ($dbInfo.IsLocalHost) { Write-Host 'DB Target  : LOCAL database, not Render production' -ForegroundColor Yellow }
Write-Host "Tool       : $toolLabel"
Write-Host "Apply      : $Apply"
Write-Host "Clean      : $Clean"
if (-not $cmd -and -not $NoDockerFallback -and $dockerDb.UsedHostGateway) {
  Write-Host "Docker DB URL: $($dockerDb.Masked)" -ForegroundColor Yellow
  Write-Host 'Note        : Docker run fallback rewrites localhost to host.docker.internal.' -ForegroundColor Yellow
}
if ($detectedContainer) { Write-Host "Docker exec : $detectedContainer" -ForegroundColor Yellow }

if (-not $Apply) {
  Write-Host "`nDry run only. Add -Apply to perform restore." -ForegroundColor Yellow
  if ($detectedContainer) { Write-Host "Command preview: docker exec $detectedContainer $tool ..." }
  elseif ($isPlainSql) { Write-Host "Command preview: $tool <DATABASE_URL> -f `"$backupPath`"" }
  else { Write-Host "Command preview: $tool --no-owner --no-privileges $(if ($Clean) { '--clean --if-exists ' })--dbname <DATABASE_URL> `"$backupPath`"" }
  exit 0
}

if ($cmd) {
  if ($isPlainSql) {
    & $cmd $DatabaseUrl -v ON_ERROR_STOP=1 -f $backupPath
  } else {
    $args = @('--no-owner', '--no-privileges', '--dbname', $DatabaseUrl)
    if ($Clean) { $args = @('--clean', '--if-exists') + $args }
    $args += $backupPath
    & $cmd @args
  }
  $exitCode = if ($null -ne $LASTEXITCODE) { [int]$LASTEXITCODE } else { 1 }
  if ($exitCode -ne 0) { throw "$tool failed with exit code $exitCode" }
} else {
  if ($NoDockerFallback) { throw "$tool was not found in PATH. Install PostgreSQL client tools or remove -NoDockerFallback to use Docker fallback." }
  if (-not $docker) { throw "$tool was not found in PATH and Docker was not found either. Install PostgreSQL client tools or Docker Desktop." }

  if ($detectedContainer) {
    Invoke-DockerExecRestore -DockerPath $docker -ContainerName $detectedContainer -DbInfo $dbInfo -BackupPath $backupPath -BackupName $backupName -IsPlainSql $isPlainSql -CleanRestore $Clean
  } else {
    $containerBackup = "/backup/$backupName"
    if ($isPlainSql) {
      $dockerArgs = @('run', '--rm') + $dockerDb.ExtraDockerArgs + @('-v', "${backupDir}:/backup", $DockerImage, 'psql', $dockerDb.DatabaseUrl, '-v', 'ON_ERROR_STOP=1', '-f', $containerBackup)
    } else {
      $restoreArgs = @('--no-owner', '--no-privileges', '--dbname', $dockerDb.DatabaseUrl)
      if ($Clean) { $restoreArgs = @('--clean', '--if-exists') + $restoreArgs }
      $restoreArgs += $containerBackup
      $dockerArgs = @('run', '--rm') + $dockerDb.ExtraDockerArgs + @('-v', "${backupDir}:/backup", $DockerImage, 'pg_restore') + $restoreArgs
    }
    Write-Host "Using Docker run fallback image: $DockerImage" -ForegroundColor Yellow
    & $docker @dockerArgs
    $exitCode = if ($null -ne $LASTEXITCODE) { [int]$LASTEXITCODE } else { 1 }
    if ($exitCode -ne 0) {
      Write-Host "Docker restore fallback troubleshooting:" -ForegroundColor Yellow
      Write-Host '- If the backup was created from a newer PostgreSQL server, rerun with -DockerImage postgres:<server-major>-alpine.' -ForegroundColor Yellow
      throw "Docker $tool failed with exit code $exitCode"
    }
  }
}

Write-Host "`nRestore completed." -ForegroundColor Green
