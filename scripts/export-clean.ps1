param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$OutputDir = '_export',
  [string]$Name = 'dotwatch-clean',
  [switch]$KeepOutputFolder
)

$ErrorActionPreference = 'Stop'

function Get-RelativePathCompat {
  param(
    [Parameter(Mandatory = $true)][string]$BasePath,
    [Parameter(Mandatory = $true)][string]$TargetPath
  )

  $base = [System.IO.Path]::GetFullPath($BasePath).TrimEnd([char[]]@('\', '/'))
  $target = [System.IO.Path]::GetFullPath($TargetPath)

  if ($target.StartsWith($base, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $target.Substring($base.Length).TrimStart([char[]]@('\', '/')).Replace('\', '/')
  }

  return $target.Replace('\', '/')
}

function Test-IgnoredPath {
  param(
    [Parameter(Mandatory = $true)][string]$RelativePath
  )

  $path = $RelativePath.Replace('\', '/')
  $parts = $path -split '/'
  $leaf = Split-Path $path -Leaf
  $extension = [System.IO.Path]::GetExtension($leaf).ToLowerInvariant()

  $ignoredDirectoryNames = @(
    '.git',
    'node_modules',
    'dist',
    'build',
    'coverage',
    '.vite',
    '.pio',
    '__pycache__',
    '.pytest_cache',
    '.mypy_cache',
    '.venv',
    'venv',
    '.idea',
    '_archive',
    '_backups',
    '_export',
    '_reports',
    'diagnostics',
    'logs',
    'tmp',
    'temp'
  )

  foreach ($part in $parts) {
    if ($ignoredDirectoryNames -contains $part) {
      return $true
    }
  }

  if ($leaf -eq '.env.example' -or $leaf -like '.env.*.example') {
    return $false
  }

  $ignoredLeafNames = @(
    '.env',
    '.env.local',
    '.env.production',
    '.env.development',
    '.DS_Store',
    'Thumbs.db',
    'desktop.ini',
    'modbus_last_test_result.json',
    'offline_queue.jsonl'
  )

  if ($ignoredLeafNames -contains $leaf) {
    return $true
  }

  $ignoredExtensions = @(
    '.log',
    '.zip',
    '.7z',
    '.rar',
    '.gz',
    '.tgz',
    '.tar',
    '.bak',
    '.backup',
    '.dump',
    '.db',
    '.sqlite',
    '.sqlite3',
    '.pyc',
    '.pyo',
    '.pem',
    '.key',
    '.p8',
    '.p12',
    '.crt',
    '.cer'
  )

  if ($ignoredExtensions -contains $extension) {
    return $true
  }

  if ($leaf -like '*.bak-*' -or $leaf -like '*.pre-*.bak') {
    return $true
  }

  if ($leaf -like '*serviceAccount*.json' -or $leaf -like '*service-account*.json' -or $leaf -like 'firebase-adminsdk*.json') {
    return $true
  }

  if ($path -like 'pi/agent/data/*') {
    return $true
  }

  # Root-level one-off repair/snapshot files are intentionally left out of clean exports.
  if ($path -notlike '*/*') {
    if ($leaf -like 'fix-*.ps1' -or $leaf -like '*.fixed.*' -or $leaf -like '*.pi.current*' -or $leaf -like 'main.pi-*' -or $leaf -like 'main.rpi-*') {
      return $true
    }
  }

  return $false
}

$projectRootPath = (Resolve-Path $ProjectRoot).Path
$outputRoot = Join-Path $projectRootPath $OutputDir
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$stagingRoot = Join-Path $outputRoot "$Name-$timestamp"
$stagingProject = Join-Path $stagingRoot 'dotwatch'
$zipPath = Join-Path $outputRoot "$Name-$timestamp.zip"

if (-not (Test-Path $outputRoot)) {
  New-Item -ItemType Directory -Path $outputRoot | Out-Null
}

if (Test-Path $stagingRoot) {
  Remove-Item -Recurse -Force $stagingRoot
}

New-Item -ItemType Directory -Path $stagingProject | Out-Null

$files = Get-ChildItem -Path $projectRootPath -Recurse -Force -File | Where-Object {
  $relative = Get-RelativePathCompat -BasePath $projectRootPath -TargetPath $_.FullName
  -not (Test-IgnoredPath -RelativePath $relative)
}

foreach ($file in $files) {
  $relative = Get-RelativePathCompat -BasePath $projectRootPath -TargetPath $file.FullName
  $target = Join-Path $stagingProject $relative
  $targetDir = Split-Path $target -Parent

  if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir | Out-Null
  }

  Copy-Item -LiteralPath $file.FullName -Destination $target -Force
}

if (Test-Path $zipPath) {
  Remove-Item -Force $zipPath
}

Compress-Archive -Path (Join-Path $stagingRoot 'dotwatch') -DestinationPath $zipPath -Force

$sourceSizeMb = [math]::Round((Get-ChildItem -Path $projectRootPath -Recurse -Force -File | Measure-Object -Property Length -Sum).Sum / 1MB, 2)
$zipSizeMb = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
$fileCount = $files.Count

Write-Host ''
Write-Host 'dotWatch clean export completed' -ForegroundColor Green
Write-Host "Project root : $projectRootPath"
Write-Host "Files copied : $fileCount"
Write-Host "Source size  : $sourceSizeMb MB"
Write-Host "Zip size     : $zipSizeMb MB"
Write-Host "Output zip   : $zipPath" -ForegroundColor Cyan
Write-Host ''
Write-Host 'Excluded: .git, node_modules, .pio, dist/build, .env real files, reports, diagnostics, logs, caches, backups, compressed files, private keys.' -ForegroundColor Yellow

if (-not $KeepOutputFolder) {
  Remove-Item -Recurse -Force $stagingRoot
}
