param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$BackendUrl = 'https://dotwatch-backend.onrender.com',
  [string]$DashboardUrl = 'https://dotwatch.onrender.com',
  [int]$TimeoutSec = 20
)

$ErrorActionPreference = 'Stop'

function Write-Section($Message) {
  Write-Host "`n$Message" -ForegroundColor Cyan
}

function Add-Issue(
  [string]$Level,
  [string]$Area,
  [string]$Message
) {
  $script:Issues += [pscustomobject]@{
    Level = $Level
    Area = $Area
    Message = $Message
  }
}

function Test-FileExists(
  [string]$RelativePath,
  [string]$Area
) {
  $Path = Join-Path $ProjectRoot $RelativePath

  if (-not (Test-Path -LiteralPath $Path)) {
    Add-Issue 'BLOCK' $Area "Missing file: $RelativePath"
  }
}

function Test-DirExists(
  [string]$RelativePath,
  [string]$Area
) {
  $Path = Join-Path $ProjectRoot $RelativePath

  if (-not (Test-Path -LiteralPath $Path)) {
    Add-Issue 'BLOCK' $Area "Missing directory: $RelativePath"
  }
}

function Read-JsonFile([string]$RelativePath) {
  $Path = Join-Path $ProjectRoot $RelativePath

  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }

  return Get-Content -LiteralPath $Path -Raw |
    ConvertFrom-Json
}

function Test-HttpUrl(
  [string]$Name,
  [string]$Url
) {
  try {
    $Response = Invoke-WebRequest `
      -Uri $Url `
      -Method GET `
      -TimeoutSec $TimeoutSec `
      -UseBasicParsing

    if (
      $Response.StatusCode -ge 200 -and
      $Response.StatusCode -lt 400
    ) {
      Write-Host "[OK] $Name reachable: HTTP $($Response.StatusCode)"
    }
    else {
      Add-Issue `
        'WARN' `
        $Name `
        "Unexpected HTTP status $($Response.StatusCode): $Url"
    }
  }
  catch {
    Add-Issue `
      'WARN' `
      $Name `
      "Not reachable during check: $Url ($($_.Exception.Message))"
  }
}

function Get-RelativePathCompat(
  [string]$BasePath,
  [string]$TargetPath
) {
  $Base = ([System.IO.Path]::GetFullPath($BasePath)).
    TrimEnd([char[]]@('\', '/'))
  $Target = [System.IO.Path]::GetFullPath($TargetPath)

  if ($Target.Length -le $Base.Length) {
    return $Target
  }

  return ($Target.Substring($Base.Length + 1)).Replace('\', '/')
}

function Get-GitPathState([string]$RelativePath) {
  Push-Location $ProjectRoot

  try {
    $TrackedPaths = @(
      & git ls-files --cached -- $RelativePath 2>$null
    )

    $TrackExitCode = $LASTEXITCODE

    if ($TrackExitCode -ne 0) {
      throw (
        "Unable to inspect Git tracking state for " +
        "${RelativePath}: exit code $TrackExitCode"
      )
    }

    if ($TrackedPaths.Count -gt 0) {
      return 'tracked'
    }

    & git check-ignore -q -- $RelativePath 2>$null
    $IgnoreExitCode = $LASTEXITCODE

    if ($IgnoreExitCode -eq 0) {
      return 'ignored'
    }

    if ($IgnoreExitCode -eq 1) {
      return 'unignored'
    }

    throw (
      "Unable to inspect Git ignore state for " +
      "${RelativePath}: exit code $IgnoreExitCode"
    )
  }
  finally {
    Pop-Location
  }
}
$ProjectRoot = ([System.IO.Path]::GetFullPath($ProjectRoot)).
  TrimEnd([char[]]@('\', '/'))
$script:Issues = @()

Write-Host 'dotWatch Phase 3 verify' -ForegroundColor Cyan
Write-Host "Root: $ProjectRoot"

Write-Section 'Required production files'
$RequiredFiles = @(
  'package.json',
  'scripts/export-clean.ps1',
  'scripts/scan-sensitive-files.ps1',
  'scripts/phase2-verify.ps1',
  'services/backend/package.json',
  'apps/dashboard/package.json',
  'pi/agent/main.py'
)

foreach ($File in $RequiredFiles) {
  Test-FileExists $File 'Required files'
}

Test-DirExists 'services/backend' 'Backend'
Test-DirExists 'apps/dashboard' 'Dashboard'
Test-DirExists 'pi' 'Raspberry Pi'

Write-Section 'Root npm scripts'
$RootPkg = Read-JsonFile 'package.json'

if ($null -ne $RootPkg) {
  $ScriptNames = @()

  if ($RootPkg.scripts) {
    $ScriptNames = $RootPkg.scripts.PSObject.Properties.Name
  }

  foreach (
    $Name in @(
      'verify:phase2',
      'export:clean',
      'verify:phase3',
      'check:render',
      'check:pi'
    )
  ) {
    if ($ScriptNames -notcontains $Name) {
      Add-Issue `
        'WARN' `
        'package.json' `
        "Missing recommended npm script: $Name"
    }
  }
}

Write-Section 'Backend readiness'
$BackendPkg = Read-JsonFile 'services/backend/package.json'

if ($null -ne $BackendPkg) {
  $Names = @()

  if ($BackendPkg.scripts) {
    $Names = $BackendPkg.scripts.PSObject.Properties.Name
  }

  foreach ($Name in @('start', 'migrate')) {
    if ($Names -notcontains $Name) {
      Add-Issue `
        'WARN' `
        'Backend package' `
        "Missing recommended backend script: $Name"
    }
  }
}

Write-Section 'Dashboard readiness'
$DashboardPkg = Read-JsonFile 'apps/dashboard/package.json'

if ($null -ne $DashboardPkg) {
  $Names = @()

  if ($DashboardPkg.scripts) {
    $Names = $DashboardPkg.scripts.PSObject.Properties.Name
  }

  foreach ($Name in @('build', 'dev')) {
    if ($Names -notcontains $Name) {
      Add-Issue `
        'WARN' `
        'Dashboard package' `
        "Missing recommended dashboard script: $Name"
    }
  }
}

Write-Section 'Local secret hygiene'
$ForbiddenEnvFiles = @(
  '.env',
  '.env.local',
  '.env.production',
  'apps/dashboard/.env',
  'apps/dashboard/.env.local',
  'apps/dashboard/.env.production',
  'services/backend/.env',
  'services/backend/.env.local',
  'services/backend/.env.production',
  'pi/agent/.env'
)

foreach ($Relative in $ForbiddenEnvFiles) {
  $Path = Join-Path $ProjectRoot $Relative

  if (-not (Test-Path -LiteralPath $Path)) {
    continue
  }

  $State = Get-GitPathState $Relative

  switch ($State) {
    'ignored' {
      Write-Host "[OK] Local env file is Git-ignored: $Relative"
    }
    'tracked' {
      Add-Issue `
        'BLOCK' `
        'Secrets' `
        "Real env file is tracked by Git: $Relative"
    }
    default {
      Add-Issue `
        'BLOCK' `
        'Secrets' `
        "Real env file exists but is not Git-ignored: $Relative"
    }
  }
}

Write-Section 'PowerShell compatibility'
$PsFiles = Get-ChildItem `
  -Path (Join-Path $ProjectRoot 'scripts') `
  -Filter '*.ps1' `
  -File `
  -Recurse `
  -Force `
  -ErrorAction SilentlyContinue

foreach ($File in $PsFiles) {
  $Content = Get-Content -LiteralPath $File.FullName -Raw

  if ($Content -match '::GetRelativePath\s*\(') {
    Add-Issue `
      'BLOCK' `
      'PowerShell 5.1' `
      "Uses unsupported GetRelativePath(): $(Get-RelativePathCompat $ProjectRoot $File.FullName)"
  }
}

Write-Section 'Network smoke checks'
Test-HttpUrl `
  'Backend health' `
  ($BackendUrl.TrimEnd('/') + '/health')
Test-HttpUrl 'Dashboard' $DashboardUrl

Write-Section 'Sensitive scan'
$ScanPath = Join-Path $ProjectRoot 'scripts/scan-sensitive-files.ps1'

if (Test-Path -LiteralPath $ScanPath) {
  try {
    & powershell `
      -NoProfile `
      -ExecutionPolicy Bypass `
      -File $ScanPath

    if ($LASTEXITCODE -ne 0) {
      Add-Issue `
        'BLOCK' `
        'Sensitive scan' `
        "scan-sensitive-files.ps1 returned exit code $LASTEXITCODE"
    }
  }
  catch {
    Add-Issue `
      'BLOCK' `
      'Sensitive scan' `
      $_.Exception.Message
  }
}
else {
  Add-Issue `
    'BLOCK' `
    'Sensitive scan' `
    'Missing scripts/scan-sensitive-files.ps1'
}

Write-Section 'Summary'

if ($Issues.Count -eq 0) {
  Write-Host 'Phase 3 readiness: OK' -ForegroundColor Green
  exit 0
}

$Issues | Format-Table -AutoSize
$Blocking = @(
  $Issues |
    Where-Object {
      $_.Level -eq 'BLOCK'
    }
)

if ($Blocking.Count -gt 0) {
  Write-Host `
    "Phase 3 readiness: FAILED ($($Blocking.Count) blocking issue(s))" `
    -ForegroundColor Red
  exit 1
}

Write-Host 'Phase 3 readiness: OK with warnings' -ForegroundColor Yellow
exit 0
