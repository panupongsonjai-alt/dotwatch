param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$LocalDatabaseUrl = $env:LOCAL_DATABASE_URL,
  [string]$RenderDatabaseUrl = $env:DATABASE_URL,
  [string]$LocalDockerContainerName,
  [string]$DockerImage = 'postgres:18-alpine',
  [string]$OutputDir = '_reports\phase9-parity',
  [switch]$SkipLocal,
  [switch]$SkipRender,
  [switch]$StrictFullCoreColumns
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

  $cmdExe = Get-Command "$Name.exe" -ErrorAction SilentlyContinue
  if ($cmdExe -and $cmdExe.Source -and ($cmdExe.Source -match '\.exe$')) { return $cmdExe.Source }

  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source -and ($cmd.Source -match '\.exe$')) { return $cmd.Source }

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

function ConvertTo-QuotedSqlValues([string[]]$Items) {
  return (($Items | ForEach-Object { "('" + ($_.Replace("'", "''")) + "')" }) -join ', ')
}

function New-CoreCompatibilitySql([string[]]$CoreTableNames) {
  $coreValues = ConvertTo-QuotedSqlValues $CoreTableNames
  return @"
WITH core_table_names(table_name) AS (
  VALUES $coreValues
), base_tables AS (
  SELECT table_name::text
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
), public_relations AS (
  SELECT c.relname::text AS relation_name, c.relkind::text AS relation_kind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
), core_columns AS (
  SELECT
    c.table_name::text AS table_name,
    c.column_name::text AS column_name,
    c.ordinal_position::integer AS ordinal_position,
    c.data_type::text AS data_type,
    c.udt_name::text AS udt_name,
    c.is_nullable::text AS is_nullable,
    COALESCE(c.column_default::text, '') AS column_default
  FROM information_schema.columns c
  JOIN core_table_names ct ON ct.table_name = c.table_name
  WHERE c.table_schema = 'public'
), required_column_signatures AS (
  SELECT
    table_name || '.' || column_name || ':' || data_type || ':' || udt_name || ':' || is_nullable AS signature
  FROM core_columns
), full_column_signatures AS (
  SELECT
    table_name || '.' || column_name || ':' || ordinal_position::text || ':' || data_type || ':' || udt_name || ':' || is_nullable || ':' || column_default AS signature
  FROM core_columns
), default_signatures AS (
  SELECT
    table_name || '.' || column_name || ':' || column_default AS signature
  FROM core_columns
  WHERE column_default <> ''
), compatibility_payload AS (
  SELECT
    COALESCE((SELECT string_agg(table_name, E'\n' ORDER BY table_name) FROM base_tables WHERE table_name IN (SELECT table_name FROM core_table_names)), '') ||
    E'\n--REQUIRED-COLUMNS--\n' ||
    COALESCE((SELECT string_agg(signature, E'\n' ORDER BY signature) FROM required_column_signatures), '') AS payload
), full_column_payload AS (
  SELECT COALESCE((SELECT string_agg(signature, E'\n' ORDER BY signature) FROM full_column_signatures), '') AS payload
)
SELECT jsonb_build_object(
  'database', current_database(),
  'user', current_user,
  'server_version', current_setting('server_version'),
  'server_addr', COALESCE(inet_server_addr()::text, 'hidden/local'),
  'compatibility_hash', (SELECT md5(payload) FROM compatibility_payload),
  'full_column_hash', (SELECT md5(payload) FROM full_column_payload),
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
  'required_column_signatures', (SELECT COALESCE(jsonb_agg(signature ORDER BY signature), '[]'::jsonb) FROM required_column_signatures),
  'full_column_signatures', (SELECT COALESCE(jsonb_agg(signature ORDER BY signature), '[]'::jsonb) FROM full_column_signatures),
  'default_signatures', (SELECT COALESCE(jsonb_agg(signature ORDER BY signature), '[]'::jsonb) FROM default_signatures),
  'public_relations', (SELECT COALESCE(jsonb_agg(relation_name || ':' || relation_kind ORDER BY relation_name, relation_kind), '[]'::jsonb) FROM public_relations),
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
      compatibilityHash = $data.compatibility_hash
      fullColumnHash = $data.full_column_hash
      requiredCoreTables = @($data.required_core_tables)
      presentCoreTables = @($data.present_core_tables)
      missingCoreTables = @($data.missing_core_tables)
      extraBaseTables = @($data.extra_base_tables)
      requiredColumnSignatures = @($data.required_column_signatures)
      fullColumnSignatures = @($data.full_column_signatures)
      defaultSignatures = @($data.default_signatures)
      publicRelations = @($data.public_relations)
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
      compatibilityHash = $null
      fullColumnHash = $null
      requiredCoreTables = @()
      presentCoreTables = @()
      missingCoreTables = @()
      extraBaseTables = @()
      requiredColumnSignatures = @()
      fullColumnSignatures = @()
      defaultSignatures = @()
      publicRelations = @()
      baseTableCount = $null
      publicRelationCount = $null
      publicColumnCount = $null
      error = $_.Exception.Message
    }
  }
}

function New-StringHashSet([object[]]$Items) {
  $set = New-Object 'System.Collections.Generic.HashSet[string]'
  foreach ($item in @($Items)) {
    if ($null -ne $item) { [void]$set.Add([string]$item) }
  }
  return $set
}

function Compare-StringSet([object[]]$Left, [object[]]$Right) {
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

function Write-DiffSample([string]$Title, [object[]]$Items, [int]$Limit = 12) {
  if (@($Items).Count -eq 0) { return }
  Write-Host $Title -ForegroundColor Yellow
  @($Items | Select-Object -First $Limit) | ForEach-Object { Write-Host "  - $_" -ForegroundColor DarkYellow }
  if (@($Items).Count -gt $Limit) { Write-Host "  ... plus $(@($Items).Count - $Limit) more" -ForegroundColor DarkYellow }
}

$projectRootPath = [System.IO.Path]::GetFullPath($ProjectRoot).TrimEnd([char[]]@('\', '/'))
$outputRoot = Join-Path $projectRootPath $OutputDir
if (-not (Test-Path -LiteralPath $outputRoot)) { New-Item -ItemType Directory -Path $outputRoot | Out-Null }
$outputRoot = (Resolve-Path -LiteralPath $outputRoot).Path
$reportFile = Join-Path $outputRoot ("phase9-core-compatibility-{0}.json" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
$docker = Get-CommandPath 'docker'
if (-not $docker) { throw 'Docker CLI was not found. Open Docker Desktop or add Docker CLI to PATH.' }

$sql = New-CoreCompatibilitySql -CoreTableNames $coreTables
$snapshots = @()

Write-Section 'dotWatch Phase 9E - Core compatibility parity check'
Write-Host "ProjectRoot : $projectRootPath"
Write-Host "Docker      : $docker"
Write-Host "DockerImage : $DockerImage"
Write-Host "OutputFile  : $reportFile"
Write-Host "Mode        : release compatibility = required core tables + required column type/nullability"

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
$tableDiff = $null
$requiredColumnDiff = $null
$fullColumnDiff = $null
$defaultDiff = $null
$relationDiff = $null
$compatibilityMatch = $null
$fullColumnMatch = $null

if ($local -and $render -and $local.ok -and $render.ok) {
  $tableDiff = Compare-StringSet -Left $local.presentCoreTables -Right $render.presentCoreTables
  $requiredColumnDiff = Compare-StringSet -Left $local.requiredColumnSignatures -Right $render.requiredColumnSignatures
  $fullColumnDiff = Compare-StringSet -Left $local.fullColumnSignatures -Right $render.fullColumnSignatures
  $defaultDiff = Compare-StringSet -Left $local.defaultSignatures -Right $render.defaultSignatures
  $relationDiff = Compare-StringSet -Left $local.publicRelations -Right $render.publicRelations
  $compatibilityMatch = $tableDiff.match -and $requiredColumnDiff.match -and ($local.missingCoreTables.Count -eq 0) -and ($render.missingCoreTables.Count -eq 0)
  $fullColumnMatch = $fullColumnDiff.match
}

$report = [pscustomobject]@{
  generated_at = (Get-Date).ToString('o')
  project_root = $projectRootPath
  docker_image = $DockerImage
  mode = 'core compatibility parity'
  compatibility_definition = 'required core tables plus table.column:data_type:udt_name:is_nullable; column order, defaults, indexes, constraints, optional Timescale objects, and legacy non-core objects are reported but are not release-blocking in this mode.'
  core_tables = $coreTables
  compatibility_match = $compatibilityMatch
  full_core_column_match = $fullColumnMatch
  snapshots = $snapshots
  differences = [pscustomobject]@{
    present_core_tables = $tableDiff
    required_columns = $requiredColumnDiff
    full_columns = $fullColumnDiff
    defaults = $defaultDiff
    public_relations = $relationDiff
  }
  notes = @(
    'Use this command as the production release gate when Local and Render run different PostgreSQL/Timescale versions.',
    'The older db:parity:core command remains stricter and may fail on column order/default/index/constraint differences that do not block runtime compatibility.',
    'Render production remains the source of truth. Restore local from Render backup when local data must match production.'
  )
}

$report | ConvertTo-Json -Depth 14 | Set-Content -LiteralPath $reportFile -Encoding UTF8

foreach ($snapshot in $snapshots) {
  if ($snapshot.ok) {
    Write-Host ("[{0}] OK compatibilityHash={1} fullColumnHash={2} baseTables={3} relations={4} columns={5} server={6}" -f $snapshot.label.ToUpperInvariant(), $snapshot.compatibilityHash, $snapshot.fullColumnHash, $snapshot.baseTableCount, $snapshot.publicRelationCount, $snapshot.publicColumnCount, $snapshot.serverVersion) -ForegroundColor Green
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

if ($null -ne $compatibilityMatch) {
  if ($compatibilityMatch) {
    Write-Host 'Core compatibility parity: OK - required core tables and required column type/nullability match.' -ForegroundColor Green
  } else {
    Write-Host 'Core compatibility parity: DIFFERENT - required runtime schema differs.' -ForegroundColor Red
    Write-Host ("Required table differences: local-only={0}, render-only={1}" -f $tableDiff.onlyLocalCount, $tableDiff.onlyRenderCount) -ForegroundColor Yellow
    Write-Host ("Required column differences: local-only={0}, render-only={1}" -f $requiredColumnDiff.onlyLocalCount, $requiredColumnDiff.onlyRenderCount) -ForegroundColor Yellow
    Write-DiffSample -Title 'Required columns only in local:' -Items $requiredColumnDiff.onlyLocal
    Write-DiffSample -Title 'Required columns only in render:' -Items $requiredColumnDiff.onlyRender
  }

  if ($fullColumnMatch) {
    Write-Host 'Full core column signature parity: OK.' -ForegroundColor Green
  } else {
    Write-Host 'Full core column signature parity: DIFFERENT - order/default differences are in the report.' -ForegroundColor Yellow
    Write-Host ("Full column differences: local-only={0}, render-only={1}" -f $fullColumnDiff.onlyLocalCount, $fullColumnDiff.onlyRenderCount) -ForegroundColor Yellow
  }

  if (($defaultDiff.onlyLocalCount + $defaultDiff.onlyRenderCount) -gt 0) {
    Write-Host ("Default differences: local-only={0}, render-only={1}" -f $defaultDiff.onlyLocalCount, $defaultDiff.onlyRenderCount) -ForegroundColor Yellow
  }
  if (($relationDiff.onlyLocalCount + $relationDiff.onlyRenderCount) -gt 0) {
    Write-Host ("Public relation differences: local-only={0}, render-only={1}" -f $relationDiff.onlyLocalCount, $relationDiff.onlyRenderCount) -ForegroundColor Yellow
  }
} else {
  Write-Host 'Core compatibility parity: not compared because one target was skipped or failed.' -ForegroundColor Yellow
}

Write-Host "Report: $reportFile"
if (($snapshots | Where-Object { -not $_.ok }).Count -gt 0) { throw 'Phase 9E core compatibility check failed for one or more targets.' }
if (($null -ne $compatibilityMatch) -and (-not $compatibilityMatch)) { throw 'Phase 9E core compatibility parity is different. Review required table/column differences before release.' }
if ($StrictFullCoreColumns -and ($null -ne $fullColumnMatch) -and (-not $fullColumnMatch)) { throw 'Strict full core column signature parity is different.' }
