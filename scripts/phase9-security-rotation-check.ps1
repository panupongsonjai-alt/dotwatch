param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$BackendUrl = 'https://dotwatch-backend.onrender.com',
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [string]$OutputDir = '_reports\phase9-security',
  [switch]$DatabasePasswordRotated,
  [switch]$RenderEnvUpdated,
  [switch]$BackendRedeployed,
  [switch]$OldConnectionInvalidated,
  [switch]$OpsHealthPassed,
  [switch]$RequireAll
)

$ErrorActionPreference = 'Stop'

function Write-Section([string]$Message) {
  Write-Host "`n============================================================" -ForegroundColor DarkCyan
  Write-Host $Message -ForegroundColor Cyan
  Write-Host "============================================================" -ForegroundColor DarkCyan
}

function Get-MaskedDatabaseUrl([string]$Value) {
  try {
    $uri = [System.Uri]$Value
    $auth = if ($uri.UserInfo) { '***:***@' } else { '' }
    $port = if ($uri.IsDefaultPort) { '' } else { ":$($uri.Port)" }
    $query = if ($uri.Query) { '?***' } else { '' }
    return "$($uri.Scheme)://$auth$($uri.Host)$port$($uri.AbsolutePath)$query"
  } catch {
    return '***invalid or empty DATABASE_URL***'
  }
}

function Test-RepoRiskFiles([string]$RootPath) {
  $risky = @()
  $patterns = @(
    '.env', '.env.local', '.env.production', '*.dump', '*.sql', '*.pem', '*.key', '*serviceAccount*.json', '*service-account*.json', 'firebase-adminsdk*.json'
  )
  foreach ($pattern in $patterns) {
    $matches = Get-ChildItem -LiteralPath $RootPath -Recurse -Force -File -Filter $pattern -ErrorAction SilentlyContinue |
      Where-Object {
        $rel = $_.FullName.Substring($RootPath.Length).TrimStart('\', '/') -replace '\\', '/'
        $rel -notmatch '(^|/)(node_modules|dist|build|\.git|_archive|_backups|_export|_reports)(/|$)' -and
        $_.Name -notlike '*.example'
      }
    foreach ($match in $matches) {
      $risky += $match.FullName.Substring($RootPath.Length).TrimStart('\', '/') -replace '\\', '/'
    }
  }
  return @($risky | Sort-Object -Unique)
}

$projectRootPath = [System.IO.Path]::GetFullPath($ProjectRoot).TrimEnd([char[]]@('\', '/'))
$outputRoot = Join-Path $projectRootPath $OutputDir
if (-not (Test-Path -LiteralPath $outputRoot)) { New-Item -ItemType Directory -Path $outputRoot | Out-Null }
$outputRoot = (Resolve-Path -LiteralPath $outputRoot).Path
$reportFile = Join-Path $outputRoot ("phase9-security-rotation-{0}.json" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))

Write-Section 'dotWatch Phase 9 - Post-release secret rotation check'
Write-Host "ProjectRoot : $projectRootPath"
Write-Host "BackendUrl  : $BackendUrl"
Write-Host "DatabaseUrl : $(Get-MaskedDatabaseUrl $DatabaseUrl)"
Write-Host "OutputFile  : $reportFile"

$riskFiles = Test-RepoRiskFiles -RootPath $projectRootPath
$items = @(
  [pscustomobject]@{ key='database_password_rotated'; ok=[bool]$DatabasePasswordRotated; action='Rotate/reset Render PostgreSQL password because the old DATABASE_URL was exposed in chat/logs.' },
  [pscustomobject]@{ key='render_env_updated'; ok=[bool]$RenderEnvUpdated; action='Update Render backend DATABASE_URL to the new External Database URL.' },
  [pscustomobject]@{ key='backend_redeployed'; ok=[bool]$BackendRedeployed; action='Redeploy backend after changing DATABASE_URL.' },
  [pscustomobject]@{ key='old_connection_invalidated'; ok=[bool]$OldConnectionInvalidated; action='Verify the old exposed DATABASE_URL no longer connects.' },
  [pscustomobject]@{ key='ops_health_passed'; ok=[bool]$OpsHealthPassed; action='Run npm run ops:health against the Render backend and confirm OK.' },
  [pscustomobject]@{ key='repo_secret_files_absent'; ok=($riskFiles.Count -eq 0); action='Keep real .env/dump/key files out of repo/export. Backup files may exist under _backups and are intentionally ignored.' }
)

foreach ($item in $items) {
  $status = if ($item.ok) { 'OK' } else { 'TODO' }
  $color = if ($item.ok) { 'Green' } else { 'Yellow' }
  Write-Host ("[{0}] {1} - {2}" -f $status, $item.key, $item.action) -ForegroundColor $color
}

if ($riskFiles.Count -gt 0) {
  Write-Host "`nRisk files found outside ignored folders:" -ForegroundColor Yellow
  foreach ($file in $riskFiles) { Write-Host "- $file" -ForegroundColor Yellow }
}

$report = [pscustomobject]@{
  generated_at = (Get-Date).ToString('o')
  project_root = $projectRootPath
  backend_url = $BackendUrl
  database_url_masked = Get-MaskedDatabaseUrl $DatabaseUrl
  require_all = [bool]$RequireAll
  checks = $items
  risk_files = $riskFiles
  next_commands = @(
    'npm run db:env:check -- -RequireDockerOrPgDump -RequireRender',
    'npm run db:backup',
    'npm run ops:health -- -BackendUrl "https://dotwatch-backend.onrender.com" -AllowReady503',
    'npm run db:parity -- -LocalDatabaseUrl "postgres://dotwatch:LOCAL_PASSWORD@localhost:5432/dotwatch" -RenderDatabaseUrl $env:DATABASE_URL -LocalDockerContainerName "<your-db-container>"'
  )
}
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $reportFile -Encoding UTF8
Write-Host "Report: $reportFile"

if ($RequireAll -and (($items | Where-Object { -not $_.ok }).Count -gt 0)) {
  throw 'Phase 9 security rotation check is incomplete. Complete TODO items or run without -RequireAll for advisory mode.'
}
