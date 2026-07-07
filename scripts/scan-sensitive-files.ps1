param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
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

function Add-Issue {
  param(
    [Parameter(Mandatory = $true)]$Issues,
    [Parameter(Mandatory = $true)][string]$File,
    [Parameter(Mandatory = $true)][string]$Issue
  )

  $Issues.Add([pscustomobject]@{ File = $File; Issue = $Issue }) | Out-Null
}

$root = [System.IO.Path]::GetFullPath($ProjectRoot)
$issues = New-Object System.Collections.Generic.List[object]

$excludedDirNames = @(
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.vite',
  'coverage',
  '.cache',
  '__pycache__',
  '.pytest_cache',
  '_export',
  'logs',
  'tmp',
  'temp'
)

$excludedExactFiles = @(
  'scripts/scan-sensitive-files.ps1',
  'scripts/export-clean.ps1',
  'scripts/phase2-verify.ps1'
)

$compressedExtensions = @('.zip', '.7z', '.rar', '.tar', '.gz', '.tgz', '.xz', '.bz2')
$binaryExtensions = @('.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.mov', '.avi', '.exe', '.dll')

$privateKeyBlockPattern = '-----BEGIN ' + '(RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----'
$firebasePrivateKeyAssignPattern = 'FIREBASE_' + 'PRIVATE_KEY\s*=\s*["'']?-----BEGIN'
$databaseUrlWithPasswordPattern = 'postgres(?:ql)?://[^\s:/@]+:[^\s@]+@'
$hardcodedDeviceSecretPattern = '(?i)(?:DOTWATCH_)?DEVICE_SECRET\s*=\s*["'']?[A-Za-z0-9_\-]{16,}|deviceSecret["'']?\s*[:=]\s*["''][A-Za-z0-9_\-]{16,}["'']'

$files = Get-ChildItem -Path $root -Recurse -Force -File | Where-Object {
  $file = $_
  $relative = Get-RelativePathCompat -BasePath $root -TargetPath $file.FullName

  foreach ($dir in $excludedDirNames) {
    if ($relative -eq $dir -or $relative.StartsWith($dir + '/', [System.StringComparison]::OrdinalIgnoreCase) -or $relative.Contains('/' + $dir + '/')) {
      return $false
    }
  }

  if ($excludedExactFiles -contains $relative) { return $false }
  if ($relative -like '*.bak' -or $relative -like '*.bak-*' -or $relative -like '*.pre-*.bak') { return $false }
  if ($relative -like 'fix-*.ps1') { return $false }
  if ($compressedExtensions -contains $file.Extension.ToLowerInvariant()) { return $false }
  if ($binaryExtensions -contains $file.Extension.ToLowerInvariant()) { return $false }

  return $true
}

foreach ($file in $files) {
  $relative = Get-RelativePathCompat -BasePath $root -TargetPath $file.FullName
  $name = $file.Name.ToLowerInvariant()

  if ($name -eq '.env' -or $name -eq '.env.local' -or $name -eq '.env.production') {
    Add-Issue -Issues $issues -File $relative -Issue 'Real env file should not be committed or exported'
    continue
  }

  if ($relative -match '\.env\.example$' -or $relative -match '\.env\.template$') {
    continue
  }

  try {
    $content = Get-Content -Path $file.FullName -Raw -ErrorAction Stop
  } catch {
    continue
  }

  if ($content -match $privateKeyBlockPattern -or $content -match $firebasePrivateKeyAssignPattern) {
    Add-Issue -Issues $issues -File $relative -Issue 'Firebase Admin private key'
  }

  if ($content -match $databaseUrlWithPasswordPattern) {
    Add-Issue -Issues $issues -File $relative -Issue 'Database URL with credentials'
  }

  if ($content -match $hardcodedDeviceSecretPattern) {
    if ($content -notmatch 'CHANGE_ME|DOTWATCH_DEVICE_SECRET:-|DEVICE_SECRET_FROM_ENV') {
      Add-Issue -Issues $issues -File $relative -Issue 'Hardcoded device secret'
    }
  }
}

if ($issues.Count -gt 0) {
  Write-Host 'Sensitive file scan found blocking issues:' -ForegroundColor Red
  $issues | Sort-Object File, Issue | Format-Table -AutoSize
  exit 1
}

Write-Host 'Sensitive file scan: OK' -ForegroundColor Green
