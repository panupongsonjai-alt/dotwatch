param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$LocalDatabaseUrl = $env:LOCAL_DATABASE_URL,
  [string]$RenderDatabaseUrl = $env:DATABASE_URL,
  [string]$LocalDockerContainerName,
  [string]$DockerImage = 'postgres:18-alpine',
  [string]$OutputDir = '_reports\phase9-parity',
  [switch]$SkipLocal,
  [switch]$SkipRender,
  [switch]$IncludeCounts
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

  if (($Name -eq 'docker') -and ($IsWindows -or $env:OS -eq 'Windows_NT')) {
    $candidate = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }

  return $null
}

function Test-PlaceholderText([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return $true }
  $patterns = @(
    'à¸§à¸²à¸‡',
    'à¸•à¸£à¸‡à¸™à¸µà¹‰',
    'Render External Database URL',
    'YOUR_',
    'your_',
    'REPLACE',
    'CHANGE_ME',
    'example\.com',
    '<[^>]+>',
    '\{[^}]+\}',
    'postgres(?:ql)?://user:password@host'
  )
  foreach ($pattern in $patterns) {
    if ($Value -match $pattern) { return $true }
  }
  return $false
}

function Get-MaskedDatabaseUrl([string]$Value) {
  try {
    $uri = [System.Uri]$Value
    $auth = if ($uri.UserInfo) { '***:***@' } else { '' }
    $port = if ($uri.IsDefaultPort) { '' } else { ":$($uri.Port)" }
    $query = if ($uri.Query) { '?***' } else { '' }
    return "$($uri.Scheme)://$auth$($uri.Host)$port$($uri.AbsolutePath)$query"
  } catch {
    return '***invalid DATABASE_URL***'
  }
}

function Get-DatabaseUrlInfo([string]$Value, [string]$Label) {
  if (Test-PlaceholderText $Value) { throw "$Label DATABASE_URL is empty or looks like a placeholder." }

  try { $uri = [System.Uri]$Value } catch { throw "$Label DATABASE_URL is not a valid PostgreSQL URL." }
  if ($uri.Scheme -notin @('postgres', 'postgresql')) { throw "$Label DATABASE_URL scheme must be postgres/postgresql." }

  $dbName = $uri.AbsolutePath.Trim('/')
  if ([string]::IsNullOrWhiteSpace($dbName)) { throw "$Label DATABASE_URL database name is empty." }

  $user = $null
  $password = $null
  if ($uri.UserInfo) {
    $parts = $uri.UserInfo -split ':', 2
    if ($parts.Length -ge 1) { $user = [System.Uri]::UnescapeDataString($parts[0]) }
    if ($parts.Length -eq 2) { $password = [System.Uri]::UnescapeDataString($parts[1]) }
  }

  return [pscustomobject]@{
    Url = $Value
    Uri = $uri
    Host = $uri.Host
    Port = if ($uri.IsDefaultPort) { 5432 } else { $uri.Port }
    DatabaseName = $dbName
    User = $user
    Password = $password
    IsLocalHost = $uri.Host.ToLowerInvariant() -in @('localhost', '127.0.0.1', '::1')
    IsRender = $uri.Host.ToLowerInvariant().Contains('render.com')
    Masked = Get-MaskedDatabaseUrl $Value
  }
}

function Get-DockerSafeDatabaseUrl([object]$DbInfo) {
  $url = $DbInfo.Url
  if ($DbInfo.IsLocalHost) {
    $builder = [System.UriBuilder]$DbInfo.Url
    $builder.Host = 'host.docker.internal'
    $builder.Port = [int]$DbInfo.Port
    $url = $builder.Uri.AbsoluteUri
  }
  return $url
}

function New-SchemaSql([switch]$WithCounts) {
  $countSql = if ($WithCounts) {
@'
    'row_counts', (
      SELECT COALESCE(jsonb_object_agg(table_name, row_estimate ORDER BY table_name), '{}'::jsonb)
      FROM (
        SELECT
          c.relname AS table_name,
          GREATEST(c.reltuples::bigint, 0) AS row_estimate
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind::text IN ('r', 'p')
          AND c.relname IN (
            'users', 'organizations', 'organization_members', 'organization_invitations',
            'organization_audit_logs', 'sites', 'devices', 'device_metrics',
            'device_metric_readings', 'device_metric_latest', 'sensor_readings'
          )
        ORDER BY c.relname
      ) row_data
    ),
'@
  } else { '' }

  return @"
WITH columns_payload AS (
  SELECT COALESCE(string_agg(
    table_schema || '.' || table_name || '.' || column_name || ':' ||
    ordinal_position || ':' || data_type || ':' || udt_name || ':' ||
    is_nullable || ':' || COALESCE(column_default, ''),
    E'\n' ORDER BY table_schema, table_name, ordinal_position, column_name
  ), '') AS payload
  FROM information_schema.columns
  WHERE table_schema = 'public'
), relations_payload AS (
  SELECT COALESCE(string_agg(
    n.nspname || '.' || c.relname || ':' || c.relkind::text,
    E'\n' ORDER BY n.nspname, c.relname, c.relkind::text
  ), '') AS payload
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind::text IN ('r', 'p', 'v', 'm', 'S')
), index_payload AS (
  SELECT COALESCE(string_agg(
    schemaname || '.' || tablename || '.' || indexname || ':' || indexdef,
    E'\n' ORDER BY schemaname, tablename, indexname
  ), '') AS payload
  FROM pg_indexes
  WHERE schemaname = 'public'
), base AS (
  SELECT
    (SELECT payload FROM columns_payload) || E'\n--RELATIONS--\n' ||
    (SELECT payload FROM relations_payload) || E'\n--INDEXES--\n' ||
    (SELECT payload FROM index_payload) AS payload
)
SELECT jsonb_build_object(
    'database', current_database(),
    'user', current_user,
    'server_version', current_setting('server_version'),
    'server_addr', COALESCE(inet_server_addr()::text, 'hidden/local'),
    'schema_hash', (SELECT md5(payload) FROM base),
    'column_count', (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public'),
    'relation_count', (
      SELECT COUNT(*)
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind::text IN ('r', 'p', 'v', 'm', 'S')
    ),
$countSql    'tables', (
      SELECT COALESCE(jsonb_agg(table_name ORDER BY table_name), '[]'::jsonb)
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
    )
  )::text;
"@
}

function Invoke-PsqlWithDockerRun([string]$DockerPath, [object]$DbInfo, [string]$Sql, [string]$Image) {
  $tmp = New-TemporaryFile
  try {
    Set-Content -LiteralPath $tmp.FullName -Value $Sql -Encoding UTF8
    $cid = & $DockerPath create -e "DATABASE_URL=$(Get-DockerSafeDatabaseUrl $DbInfo)" $Image sh -lc 'psql "$DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -f /tmp/dotwatch-query.sql' 2>&1
    if ($LASTEXITCODE -ne 0) { throw "docker create failed: $cid" }
    $cid = ($cid | Select-Object -First 1).Trim()

    & $DockerPath cp $tmp.FullName "$($cid):/tmp/dotwatch-query.sql" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'docker cp SQL into psql container failed.' }

    $output = & $DockerPath start -a $cid 2>&1
    $exitCode = if ($null -ne $LASTEXITCODE) { [int]$LASTEXITCODE } else { 1 }
    & $DockerPath rm $cid 2>&1 | Out-Null
    if ($exitCode -ne 0) { throw ($output -join "`n") }
    return ($output -join "`n").Trim()
  } finally {
    Remove-Item -LiteralPath $tmp.FullName -Force -ErrorAction SilentlyContinue
  }
}

function Invoke-PsqlWithDockerExec([string]$DockerPath, [string]$ContainerName, [object]$DbInfo, [string]$Sql) {
  $tmp = New-TemporaryFile
  try {
    Set-Content -LiteralPath $tmp.FullName -Value $Sql -Encoding UTF8
    & $DockerPath cp $tmp.FullName "$($ContainerName):/tmp/dotwatch-query.sql" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "docker cp SQL into '$ContainerName' failed." }

    $execArgs = @('exec')
    if (-not [string]::IsNullOrWhiteSpace($DbInfo.Password)) {
      $execArgs += @('-e', "PGPASSWORD=$($DbInfo.Password)")
    }
    $execArgs += @($ContainerName, 'psql', '-U', $DbInfo.User, '-d', $DbInfo.DatabaseName, '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-f', '/tmp/dotwatch-query.sql')
    $output = & $DockerPath @execArgs 2>&1
    $exitCode = if ($null -ne $LASTEXITCODE) { [int]$LASTEXITCODE } else { 1 }
    & $DockerPath exec $ContainerName rm -f /tmp/dotwatch-query.sql 2>&1 | Out-Null
    if ($exitCode -ne 0) { throw ($output -join "`n") }
    return ($output -join "`n").Trim()
  } finally {
    Remove-Item -LiteralPath $tmp.FullName -Force -ErrorAction SilentlyContinue
  }
}

function Invoke-TargetSnapshot([string]$Label, [string]$DatabaseUrl, [string]$DockerContainerName, [string]$DockerPath, [string]$Sql, [string]$Image) {
  $info = Get-DatabaseUrlInfo -Value $DatabaseUrl -Label $Label
  Write-Host "Target[$Label] : $($info.Masked)"

  try {
    if ($DockerContainerName) {
      Write-Host "Method[$Label] : docker exec $DockerContainerName" -ForegroundColor Yellow
      $jsonText = Invoke-PsqlWithDockerExec -DockerPath $DockerPath -ContainerName $DockerContainerName -DbInfo $info -Sql $Sql
    } else {
      Write-Host "Method[$Label] : docker run $Image" -ForegroundColor Yellow
      if ($info.IsLocalHost) {
        Write-Host "Note[$Label]   : localhost is rewritten to host.docker.internal for docker run mode." -ForegroundColor Yellow
      }
      $jsonText = Invoke-PsqlWithDockerRun -DockerPath $DockerPath -DbInfo $info -Sql $Sql -Image $Image
    }

    $data = $jsonText | ConvertFrom-Json
    return [pscustomobject]@{
      label = $Label
      ok = $true
      method = if ($DockerContainerName) { "docker-exec:$DockerContainerName" } else { "docker-run:$Image" }
      target = $info.Masked
      isRender = $info.IsRender
      isLocal = $info.IsLocalHost
      database = $data.database
      user = $data.user
      serverVersion = $data.server_version
      serverAddr = $data.server_addr
      schemaHash = $data.schema_hash
      columnCount = [int]$data.column_count
      relationCount = [int]$data.relation_count
      tables = $data.tables
      rowCounts = $data.row_counts
      error = $null
    }
  } catch {
    return [pscustomobject]@{
      label = $Label
      ok = $false
      method = if ($DockerContainerName) { "docker-exec:$DockerContainerName" } else { "docker-run:$Image" }
      target = $info.Masked
      isRender = $info.IsRender
      isLocal = $info.IsLocalHost
      database = $null
      user = $null
      serverVersion = $null
      serverAddr = $null
      schemaHash = $null
      columnCount = $null
      relationCount = $null
      tables = @()
      rowCounts = $null
      error = $_.Exception.Message
    }
  }
}

$projectRootPath = [System.IO.Path]::GetFullPath($ProjectRoot).TrimEnd([char[]]@('\', '/'))
$outputRoot = Join-Path $projectRootPath $OutputDir
if (-not (Test-Path -LiteralPath $outputRoot)) { New-Item -ItemType Directory -Path $outputRoot | Out-Null }
$outputRoot = (Resolve-Path -LiteralPath $outputRoot).Path
$reportFile = Join-Path $outputRoot ("phase9-db-parity-{0}.json" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
$docker = Get-CommandPath 'docker'
if (-not $docker) { throw 'Docker CLI was not found. Open Docker Desktop or add Docker CLI to PATH.' }

$sql = New-SchemaSql -WithCounts:$IncludeCounts
$snapshots = @()

Write-Section 'dotWatch Phase 9 - Local / Render database parity check'
Write-Host "ProjectRoot : $projectRootPath"
Write-Host "Docker      : $docker"
Write-Host "DockerImage : $DockerImage"
Write-Host "OutputFile  : $reportFile"

if (-not $SkipLocal) {
  if ([string]::IsNullOrWhiteSpace($LocalDatabaseUrl)) {
    Write-Host 'Local       : skipped (LOCAL_DATABASE_URL not set; pass -LocalDatabaseUrl or -SkipLocal)' -ForegroundColor Yellow
  } else {
    $snapshots += Invoke-TargetSnapshot -Label 'local' -DatabaseUrl $LocalDatabaseUrl -DockerContainerName $LocalDockerContainerName -DockerPath $docker -Sql $sql -Image $DockerImage
  }
}

if (-not $SkipRender) {
  if ([string]::IsNullOrWhiteSpace($RenderDatabaseUrl)) {
    Write-Host 'Render      : skipped (DATABASE_URL not set; pass -RenderDatabaseUrl or -SkipRender)' -ForegroundColor Yellow
  } else {
    $snapshots += Invoke-TargetSnapshot -Label 'render' -DatabaseUrl $RenderDatabaseUrl -DockerContainerName $null -DockerPath $docker -Sql $sql -Image $DockerImage
  }
}

$local = $snapshots | Where-Object { $_.label -eq 'local' } | Select-Object -First 1
$render = $snapshots | Where-Object { $_.label -eq 'render' } | Select-Object -First 1
$schemaMatch = $null
if ($local -and $render -and $local.ok -and $render.ok) {
  $schemaMatch = ($local.schemaHash -eq $render.schemaHash)
}

$report = [pscustomobject]@{
  generated_at = (Get-Date).ToString('o')
  project_root = $projectRootPath
  docker_image = $DockerImage
  schema_match = $schemaMatch
  snapshots = $snapshots
  notes = @(
    'Local and Render should use the same migrations/schema, but they do not need continuous live data sync.',
    'Use Render backup -> restore local when you need local data to match production snapshot.',
    'Do not sync local test data back to Render production unless intentionally restoring from a trusted production backup.'
  )
}

$report | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $reportFile -Encoding UTF8

foreach ($snapshot in $snapshots) {
  if ($snapshot.ok) {
    Write-Host ("[{0}] OK schemaHash={1} tables={2} columns={3} server={4}" -f $snapshot.label.ToUpperInvariant(), $snapshot.schemaHash, $snapshot.relationCount, $snapshot.columnCount, $snapshot.serverVersion) -ForegroundColor Green
  } else {
    Write-Host ("[{0}] FAIL - {1}" -f $snapshot.label.ToUpperInvariant(), $snapshot.error) -ForegroundColor Red
  }
}

if ($null -ne $schemaMatch) {
  if ($schemaMatch) {
    Write-Host 'Schema parity: OK - local and Render schema hashes match.' -ForegroundColor Green
  } else {
    Write-Host 'Schema parity: DIFFERENT - run migrations on both targets or restore local from Render backup.' -ForegroundColor Yellow
  }
} else {
  Write-Host 'Schema parity: not compared because one target was skipped or failed.' -ForegroundColor Yellow
}

Write-Host "Report: $reportFile"
if (($snapshots | Where-Object { -not $_.ok }).Count -gt 0) { throw 'Phase 9 database parity check failed for one or more targets.' }

