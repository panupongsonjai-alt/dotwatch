param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$LocalDatabaseUrl = $env:LOCAL_DATABASE_URL,
  [string]$RenderDatabaseUrl = $env:DATABASE_URL,
  [string]$LocalDockerContainerName,
  [string]$DockerImage = 'postgres:18-alpine',
  [string]$OutputDir = '_reports\phase9-parity',
  [switch]$SkipLocal,
  [switch]$SkipRender,
  [switch]$StrictAllPublicObjects
)

$ErrorActionPreference = 'Stop'

$coreTables = @(
  'users',
  'devices',
  'sensor_readings',
  'device_metrics',
  'device_metric_readings',
  'device_metric_latest',
  'device_models',
  'device_model_metrics',
  'alarm_rules',
  'alarm_events',
  'alarm_states',
  'activity_logs',
  'admin_audit_logs',
  'organizations',
  'organization_members',
  'sites',
  'device_groups',
  'demo_generators',
  'demo_statistics',
  'plan_definitions',
  'user_subscriptions',
  'organization_invitations',
  'organization_audit_logs',
  'organization_quota_overrides'
)

$optionalRelationPatterns = @(
  '^device_metric_readings_1m$',
  '^device_metric_readings_1h$',
  '^device_metric_readings_1d$',
  '^sensor_readings_1m$',
  '^sensor_readings_1h$',
  '^telemetry_1m$',
  '^telemetry_1h$',
  '^_timescaledb_'
)

function Write-Section([string]$Message) {
  Write-Host "`n============================================================" -ForegroundColor DarkCyan
  Write-Host $Message -ForegroundColor Cyan
  Write-Host "============================================================" -ForegroundColor DarkCyan
}

function Get-CommandPath([string]$Name) {
  if (($Name -eq 'docker') -and ($IsWindows -or $env:OS -eq 'Windows_NT')) {
    $candidate = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }

  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source -and ($cmd.Source -match '\.exe$')) { return $cmd.Source }

  $cmdExe = Get-Command "$Name.exe" -ErrorAction SilentlyContinue
  if ($cmdExe) { return $cmdExe.Source }

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

function ConvertTo-QuotedSqlList([string[]]$Items) {
  return (($Items | ForEach-Object { "'" + ($_.Replace("'", "''")) + "'" }) -join ', ')
}

function New-CoreParitySql([string[]]$CoreTableNames) {
  $coreList = ConvertTo-QuotedSqlList $CoreTableNames
  return @"
WITH core_table_names(table_name) AS (
  VALUES $((($CoreTableNames | ForEach-Object { "('" + ($_.Replace("'", "''")) + "')" }) -join ', '))
), public_relations AS (
  SELECT
    c.relname::text AS relation_name,
    c.relkind::text AS relation_kind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
), base_tables AS (
  SELECT table_name::text
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
), core_columns AS (
  SELECT
    c.table_name::text || '.' || c.column_name::text || ':' ||
    c.ordinal_position::text || ':' ||
    c.data_type::text || ':' ||
    c.udt_name::text || ':' ||
    c.is_nullable::text || ':' ||
    COALESCE(c.column_default::text, '') AS column_signature
  FROM information_schema.columns c
  JOIN core_table_names ct ON ct.table_name = c.table_name
  WHERE c.table_schema = 'public'
), core_constraints AS (
  SELECT
    tc.table_name::text || '.' || tc.constraint_name::text || ':' || tc.constraint_type::text || ':' ||
    COALESCE(string_agg(kcu.column_name::text, ',' ORDER BY kcu.ordinal_position), '') AS constraint_signature
  FROM information_schema.table_constraints tc
  LEFT JOIN information_schema.key_column_usage kcu
    ON kcu.constraint_schema = tc.constraint_schema
   AND kcu.constraint_name = tc.constraint_name
   AND kcu.table_schema = tc.table_schema
   AND kcu.table_name = tc.table_name
  JOIN core_table_names ct ON ct.table_name = tc.table_name
  WHERE tc.table_schema = 'public'
  GROUP BY tc.table_name, tc.constraint_name, tc.constraint_type
), core_indexes AS (
  SELECT
    schemaname::text || '.' || tablename::text || '.' || indexname::text || ':' || regexp_replace(indexdef::text, '\\s+', ' ', 'g') AS index_signature
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename IN (SELECT table_name FROM core_table_names)
), all_public_columns AS (
  SELECT
    c.table_name::text || '.' || c.column_name::text || ':' ||
    c.ordinal_position::text || ':' ||
    c.data_type::text || ':' ||
    c.udt_name::text || ':' ||
    c.is_nullable::text || ':' ||
    COALESCE(c.column_default::text, '') AS column_signature
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
), core_payload AS (
  SELECT
    COALESCE((SELECT string_agg(table_name, E'\n' ORDER BY table_name) FROM base_tables WHERE table_name IN (SELECT table_name FROM core_table_names)), '') ||
    E'\n--CORE-COLUMNS--\n' ||
    COALESCE((SELECT string_agg(column_signature, E'\n' ORDER BY column_signature) FROM core_columns), '') ||
    E'\n--CORE-CONSTRAINTS--\n' ||
    COALESCE((SELECT string_agg(constraint_signature, E'\n' ORDER BY constraint_signature) FROM core_constraints), '') ||
    E'\n--CORE-INDEXES--\n' ||
    COALESCE((SELECT string_agg(index_signature, E'\n' ORDER BY index_signature) FROM core_indexes), '') AS payload
), all_payload AS (
  SELECT
    COALESCE((SELECT string_agg(relation_name || ':' || relation_kind, E'\n' ORDER BY relation_name, relation_kind) FROM public_relations), '') ||
    E'\n--ALL-COLUMNS--\n' ||
    COALESCE((SELECT string_agg(column_signature, E'\n' ORDER BY column_signature) FROM all_public_columns), '') AS payload
)
SELECT jsonb_build_object(
  'database', current_database(),
  'user', current_user,
  'server_version', current_setting('server_version'),
  'server_addr', COALESCE(inet_server_addr()::text, 'hidden/local'),
  'core_schema_hash', (SELECT md5(payload) FROM core_payload),
  'all_public_hash', (SELECT md5(payload) FROM all_payload),
  'required_core_tables', (SELECT jsonb_agg(table_name ORDER BY table_name) FROM core_table_names),
  'present_core_tables', (SELECT COALESCE(jsonb_agg(table_name ORDER BY table_name), '[]'::jsonb) FROM base_tables WHERE table_name IN (SELECT table_name FROM core_table_names)),
  'missing_core_tables', (
    SELECT COALESCE(jsonb_agg(ct.table_name ORDER BY ct.table_name), '[]'::jsonb)
    FROM core_table_names ct
    WHERE NOT EXISTS (SELECT 1 FROM base_tables bt WHERE bt.table_name = ct.table_name)
  ),
  'extra_base_tables', (
    SELECT COALESCE(jsonb_agg(bt.table_name ORDER BY bt.table_name), '[]'::jsonb)
    FROM base_tables bt
    WHERE bt.table_name NOT IN (SELECT table_name FROM core_table_names)
  ),
  'core_columns', (SELECT COALESCE(jsonb_agg(column_signature ORDER BY column_signature), '[]'::jsonb) FROM core_columns),
  'core_constraints', (SELECT COALESCE(jsonb_agg(constraint_signature ORDER BY constraint_signature), '[]'::jsonb) FROM core_constraints),
  'core_indexes', (SELECT COALESCE(jsonb_agg(index_signature ORDER BY index_signature), '[]'::jsonb) FROM core_indexes),
  'all_public_relations', (SELECT COALESCE(jsonb_agg(relation_name || ':' || relation_kind ORDER BY relation_name, relation_kind), '[]'::jsonb) FROM public_relations),
  'all_public_columns', (SELECT COALESCE(jsonb_agg(column_signature ORDER BY column_signature), '[]'::jsonb) FROM all_public_columns),
  'base_table_count', (SELECT COUNT(*) FROM base_tables),
  'public_relation_count', (SELECT COUNT(*) FROM public_relations),
  'public_column_count', (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public')
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
      coreSchemaHash = $data.core_schema_hash
      allPublicHash = $data.all_public_hash
      requiredCoreTables = @($data.required_core_tables)
      presentCoreTables = @($data.present_core_tables)
      missingCoreTables = @($data.missing_core_tables)
      extraBaseTables = @($data.extra_base_tables)
      coreColumns = @($data.core_columns)
      coreConstraints = @($data.core_constraints)
      coreIndexes = @($data.core_indexes)
      allPublicRelations = @($data.all_public_relations)
      allPublicColumns = @($data.all_public_columns)
      baseTableCount = [int]$data.base_table_count
      publicRelationCount = [int]$data.public_relation_count
      publicColumnCount = [int]$data.public_column_count
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
      coreSchemaHash = $null
      allPublicHash = $null
      requiredCoreTables = @()
      presentCoreTables = @()
      missingCoreTables = @()
      extraBaseTables = @()
      coreColumns = @()
      coreConstraints = @()
      coreIndexes = @()
      allPublicRelations = @()
      allPublicColumns = @()
      baseTableCount = $null
      publicRelationCount = $null
      publicColumnCount = $null
      error = $_.Exception.Message
    }
  }
}

function New-StringHashSet([object[]]$Items) {
  # Windows PowerShell expands arrays passed to New-Object -ArgumentList.
  # Do not pass the string array to the HashSet constructor directly, because
  # large schemas are interpreted as hundreds of constructor arguments.
  $set = New-Object 'System.Collections.Generic.HashSet[string]'
  foreach ($item in @($Items)) {
    if ($null -ne $item) {
      [void]$set.Add([string]$item)
    }
  }
  return $set
}

function Compare-StringSet([string[]]$Left, [string[]]$Right) {
  $leftSet = New-StringHashSet -Items $Left
  $rightSet = New-StringHashSet -Items $Right
  $onlyLeft = @($leftSet | Where-Object { -not $rightSet.Contains($_) } | Sort-Object)
  $onlyRight = @($rightSet | Where-Object { -not $leftSet.Contains($_) } | Sort-Object)
  return [pscustomobject]@{
    match = (($onlyLeft.Count -eq 0) -and ($onlyRight.Count -eq 0))
    onlyLocal = $onlyLeft
    onlyRender = $onlyRight
    onlyLocalCount = $onlyLeft.Count
    onlyRenderCount = $onlyRight.Count
  }
}

function Where-OptionalRelations([string[]]$Relations, [string[]]$Patterns) {
  return @($Relations | Where-Object {
    $name = ($_ -split ':', 2)[0]
    foreach ($pattern in $Patterns) {
      if ($name -match $pattern) { return $true }
    }
    return $false
  } | Sort-Object)
}

$projectRootPath = [System.IO.Path]::GetFullPath($ProjectRoot).TrimEnd([char[]]@('\', '/'))
$outputRoot = Join-Path $projectRootPath $OutputDir
if (-not (Test-Path -LiteralPath $outputRoot)) { New-Item -ItemType Directory -Path $outputRoot | Out-Null }
$outputRoot = (Resolve-Path -LiteralPath $outputRoot).Path
$reportFile = Join-Path $outputRoot ("phase9-core-parity-{0}.json" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
$docker = Get-CommandPath 'docker'
if (-not $docker) { throw 'Docker CLI was not found. Open Docker Desktop or add Docker CLI to PATH.' }

$sql = New-CoreParitySql -CoreTableNames $coreTables
$snapshots = @()

Write-Section 'dotWatch Phase 9C - Core database parity check'
Write-Host "ProjectRoot : $projectRootPath"
Write-Host "Docker      : $docker"
Write-Host "DockerImage : $DockerImage"
Write-Host "OutputFile  : $reportFile"
Write-Host "Mode        : core required tables/columns; optional Timescale/legacy objects are reported separately"

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
$coreColumnsDiff = $null
$coreConstraintsDiff = $null
$coreIndexesDiff = $null
$allRelationsDiff = $null
$allColumnsDiff = $null
$optionalLocalOnly = @()
$optionalRenderOnly = @()
$coreMatch = $null
$strictMatch = $null

if ($local -and $render -and $local.ok -and $render.ok) {
  $coreColumnsDiff = Compare-StringSet -Left $local.coreColumns -Right $render.coreColumns
  $coreConstraintsDiff = Compare-StringSet -Left $local.coreConstraints -Right $render.coreConstraints
  $coreIndexesDiff = Compare-StringSet -Left $local.coreIndexes -Right $render.coreIndexes
  $allRelationsDiff = Compare-StringSet -Left $local.allPublicRelations -Right $render.allPublicRelations
  $allColumnsDiff = Compare-StringSet -Left $local.allPublicColumns -Right $render.allPublicColumns
  $optionalLocalOnly = Where-OptionalRelations -Relations $allRelationsDiff.onlyLocal -Patterns $optionalRelationPatterns
  $optionalRenderOnly = Where-OptionalRelations -Relations $allRelationsDiff.onlyRender -Patterns $optionalRelationPatterns
  $coreMatch = ($local.coreSchemaHash -eq $render.coreSchemaHash)
  $strictMatch = ($local.allPublicHash -eq $render.allPublicHash)
}

$report = [pscustomobject]@{
  generated_at = (Get-Date).ToString('o')
  project_root = $projectRootPath
  docker_image = $DockerImage
  mode = 'core required schema parity'
  core_tables = $coreTables
  optional_relation_patterns = $optionalRelationPatterns
  core_match = $coreMatch
  strict_all_public_match = $strictMatch
  snapshots = $snapshots
  differences = [pscustomobject]@{
    core_columns = $coreColumnsDiff
    core_constraints = $coreConstraintsDiff
    core_indexes = $coreIndexesDiff
    all_public_relations = $allRelationsDiff
    all_public_columns = $allColumnsDiff
    optional_relations_only_local = $optionalLocalOnly
    optional_relations_only_render = $optionalRenderOnly
  }
  notes = @(
    'Core parity checks required dotWatch tables, columns, constraints, and indexes.',
    'Strict all-public parity may differ when local has legacy test objects or optional Timescale materialized views that Render cannot create under its current license.',
    'Render production should be the source of truth. Restore local from a Render backup when local data must match production.'
  )
}

$report | ConvertTo-Json -Depth 14 | Set-Content -LiteralPath $reportFile -Encoding UTF8

foreach ($snapshot in $snapshots) {
  if ($snapshot.ok) {
    Write-Host ("[{0}] OK coreHash={1} allHash={2} baseTables={3} relations={4} columns={5} server={6}" -f $snapshot.label.ToUpperInvariant(), $snapshot.coreSchemaHash, $snapshot.allPublicHash, $snapshot.baseTableCount, $snapshot.publicRelationCount, $snapshot.publicColumnCount, $snapshot.serverVersion) -ForegroundColor Green
    if ($snapshot.missingCoreTables.Count -gt 0) {
      Write-Host ("[{0}] Missing core tables: {1}" -f $snapshot.label.ToUpperInvariant(), ($snapshot.missingCoreTables -join ', ')) -ForegroundColor Red
    }
    if ($snapshot.extraBaseTables.Count -gt 0) {
      Write-Host ("[{0}] Extra non-core base tables: {1}" -f $snapshot.label.ToUpperInvariant(), ($snapshot.extraBaseTables -join ', ')) -ForegroundColor Yellow
    }
  } else {
    Write-Host ("[{0}] FAIL - {1}" -f $snapshot.label.ToUpperInvariant(), $snapshot.error) -ForegroundColor Red
  }
}

if ($null -ne $coreMatch) {
  if ($coreMatch) {
    Write-Host 'Core schema parity: OK - required dotWatch schema matches.' -ForegroundColor Green
  } else {
    Write-Host 'Core schema parity: DIFFERENT - required dotWatch schema differs.' -ForegroundColor Red
    Write-Host ("Core column differences: local-only={0}, render-only={1}" -f $coreColumnsDiff.onlyLocalCount, $coreColumnsDiff.onlyRenderCount) -ForegroundColor Yellow
    Write-Host ("Core constraint differences: local-only={0}, render-only={1}" -f $coreConstraintsDiff.onlyLocalCount, $coreConstraintsDiff.onlyRenderCount) -ForegroundColor Yellow
    Write-Host ("Core index differences: local-only={0}, render-only={1}" -f $coreIndexesDiff.onlyLocalCount, $coreIndexesDiff.onlyRenderCount) -ForegroundColor Yellow
  }

  if ($strictMatch) {
    Write-Host 'Strict all-public parity: OK.' -ForegroundColor Green
  } else {
    Write-Host 'Strict all-public parity: DIFFERENT - see report for optional/legacy differences.' -ForegroundColor Yellow
    if (($optionalLocalOnly.Count + $optionalRenderOnly.Count) -gt 0) {
      Write-Host ("Optional relation differences: local-only={0}, render-only={1}" -f $optionalLocalOnly.Count, $optionalRenderOnly.Count) -ForegroundColor Yellow
    }
  }
} else {
  Write-Host 'Core schema parity: not compared because one target was skipped or failed.' -ForegroundColor Yellow
}

Write-Host "Report: $reportFile"
if (($snapshots | Where-Object { -not $_.ok }).Count -gt 0) { throw 'Phase 9C core parity check failed for one or more targets.' }
if (($null -ne $coreMatch) -and (-not $coreMatch)) { throw 'Phase 9C core schema parity is different. Review report differences before release.' }
if ($StrictAllPublicObjects -and ($null -ne $strictMatch) -and (-not $strictMatch)) { throw 'Strict all-public schema parity is different.' }
