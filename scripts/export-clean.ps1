param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$OutputDir = '_export',
  [string]$Name = 'dotwatch-clean',
  [switch]$KeepOutputFolder
)

$ErrorActionPreference = 'Stop'

function Test-IgnoredPath {
  param(
    [string]$RelativePath,
    [bool]$IsDirectory
  )

  $path = $RelativePath -replace '\\', '/'
  $parts = $path -split '/'
  $leaf = Split-Path $path -Leaf

  $ignoredDirectoryNames = @(
    '.git',
    'node_modules',
    'dist',
    'build',
    'coverage',
    '.vite',
    '__pycache__',
    '.pytest_cache',
    '.mypy_cache',
    '.venv',
    'venv',
    '.idea',
    '_export'
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
    'desktop.ini'
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
    '.p12'
  )

  if ($ignoredExtensions -contains [System.IO.Path]::GetExtension($leaf)) {
    return $true
  }

  if ($leaf -like '*serviceAccount*.json' -or $leaf -like '*service-account*.json' -or $leaf -like 'firebase-adminsdk*.json') {
    return $true
  }

  if ($path -like 'pi/agent/data/*' -or $leaf -eq 'offline_queue.jsonl' -or $leaf -eq 'modbus_last_test_result.json') {
    return $true
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
  $relative = ($_.FullName.Substring($projectRootPath.TrimEnd([char[]]@('\', '/')).Length + 1))
  -not (Test-IgnoredPath -RelativePath $relative -IsDirectory:$false)
}

foreach ($file in $files) {
  $relative = $file.FullName.Substring($projectRootPath.TrimEnd([char[]]@('\', '/')).Length + 1)
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
Write-Host 'Excluded: .git, node_modules, dist/build, .env real files, logs, caches, backups, compressed files.' -ForegroundColor Yellow

if (-not $KeepOutputFolder) {
  Remove-Item -Recurse -Force $stagingRoot
}

