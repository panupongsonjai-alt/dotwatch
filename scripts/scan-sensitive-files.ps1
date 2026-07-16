param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [switch]$IncludeIgnored,
  [switch]$StagedOnly
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

  $Issues.Add([pscustomobject]@{
    File = $File
    Issue = $Issue
  }) | Out-Null
}

function Test-IsLocalDatabaseHost {
  param([string]$HostName)

  if ([string]::IsNullOrWhiteSpace($HostName)) { return $false }

  return $HostName.ToLowerInvariant() -in @(
    'localhost',
    '127.0.0.1',
    '::1'
  )
}

function Test-IsPlaceholderDatabaseUrl {
  param([Parameter(Mandatory = $true)][string]$Url)

  $lower = $Url.ToLowerInvariant()

  $placeholderPatterns = @(
    'user:password@host',
    'username:password@host',
    'user:pass@host',
    'your_',
    'change_me',
    'replace',
    '<[^>]+>',
    '\{[^}]+\}',
    '\$\{[^}]+\}',
    'example\.',
    '\.example(?:[/:?]|$)'
  )

  foreach ($pattern in $placeholderPatterns) {
    if ($lower -match $pattern) { return $true }
  }

  try {
    $uri = [System.Uri]$Url
    if (Test-IsLocalDatabaseHost -HostName $uri.Host) {
      return $true
    }
  } catch {
    # An invalid URL that still matches the credential pattern remains blocked.
  }

  return $false
}

function Test-IsAllowedTestPrivateKeyFixture {
  param(
    [Parameter(Mandatory = $true)][string]$RelativePath,
    [Parameter(Mandatory = $true)][string]$Content
  )

  return (
    $RelativePath -match '(^|/)scripts/test-[^/]+\.(mjs|js|ts)$' -and
    $Content -match 'TEST-ONLY'
  )
}

function Test-IsAllowedDeviceSecretFixture {
  param(
    [Parameter(Mandatory = $true)][string]$RelativePath,
    [Parameter(Mandatory = $true)][string]$SecretValue,
    [Parameter(Mandatory = $true)][string]$Content
  )

  $lower = $SecretValue.ToLowerInvariant()

  if (
    $lower.Contains('not-for-production') -or
    $lower.StartsWith('test-') -or
    $lower.Contains('-test-') -or
    $Content -match 'DEVICE_SECRET_FROM_ENV|CHANGE_ME'
  ) {
    return $true
  }

  return $false
}

function Get-GitCandidatePaths {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [switch]$OnlyStaged
  )

  $git = Get-Command git -ErrorAction SilentlyContinue
  $gitDir = Join-Path $Root '.git'

  if (-not $git -or -not (Test-Path -LiteralPath $gitDir)) {
    return $null
  }

  if ($OnlyStaged) {
    $paths = @(
      & git -C $Root -c core.quotepath=false diff --cached --name-only --diff-filter=ACMR
    )
  } else {
    $paths = @(
      & git -C $Root -c core.quotepath=false ls-files --cached --others --exclude-standard
    )
  }

  if ($LASTEXITCODE -ne 0) {
    throw 'Unable to enumerate Git candidate files.'
  }

  return @(
    $paths |
      ForEach-Object { [string]$_ } |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
      Sort-Object -Unique
  )
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
  '_reports',
  '_backups',
  '.pio',
  'logs',
  'tmp',
  'temp'
)

$excludedExactFiles = @(
  'scripts/scan-sensitive-files.ps1',
  'scripts/export-clean.ps1',
  'scripts/phase2-verify.ps1'
)

$compressedExtensions = @(
  '.zip', '.7z', '.rar', '.tar', '.gz', '.tgz', '.xz', '.bz2'
)

$binaryExtensions = @(
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico',
  '.pdf', '.woff', '.woff2', '.ttf', '.eot',
  '.mp4', '.mov', '.avi', '.exe', '.dll',
  '.bin', '.elf', '.o', '.obj', '.a', '.lib', '.map'
)

$privateKeyBlockPattern = '-----BEGIN ' + '(RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----'
$firebasePrivateKeyAssignPattern = 'FIREBASE_' + 'PRIVATE_KEY[ \t]*=[ \t]*["'']?-----BEGIN'
$databaseUrlWithPasswordPattern = 'postgres(?:ql)?://[^\s:/@]+:[^\s@]+@[^\s"''<>]+'

# Use horizontal whitespace only. \s* crosses line boundaries in PowerShell regex
# and previously caused an empty DEVICE_SECRET= line to consume the next setting.
$deviceSecretPatterns = @(
  '(?im)^(?:export[ \t]+)?(?:DOTWATCH_)?DEVICE_SECRET[ \t]*=[ \t]*["'']?([A-Za-z0-9_\-]{16,})',
  '(?im)deviceSecret["'']?[ \t]*[:=][ \t]*["'']([A-Za-z0-9_\-]{16,})["'']'
)

$files = @()
$scanMode = ''

if (-not $IncludeIgnored) {
  $candidatePaths = Get-GitCandidatePaths -Root $root -OnlyStaged:$StagedOnly

  if ($null -ne $candidatePaths) {
    $scanMode = if ($StagedOnly) {
      'staged Git files'
    } else {
      'tracked and non-ignored Git candidate files'
    }

    $files = @(
      foreach ($relative in $candidatePaths) {
        $fullPath = Join-Path $root $relative
        if (Test-Path -LiteralPath $fullPath -PathType Leaf) {
          Get-Item -LiteralPath $fullPath
        }
      }
    )
  }
}

if ($files.Count -eq 0 -and ($IncludeIgnored -or -not $scanMode)) {
  $scanMode = if ($IncludeIgnored) {
    'full working tree including ignored files'
  } else {
    'filesystem fallback'
  }

  $files = @(
    Get-ChildItem -Path $root -Recurse -Force -File | Where-Object {
      $file = $_
      $relative = Get-RelativePathCompat -BasePath $root -TargetPath $file.FullName

      foreach ($dir in $excludedDirNames) {
        if (
          $relative -eq $dir -or
          $relative.StartsWith($dir + '/', [System.StringComparison]::OrdinalIgnoreCase) -or
          $relative.Contains('/' + $dir + '/')
        ) {
          return $false
        }
      }

      return $true
    }
  )
}

foreach ($file in $files) {
  $relative = Get-RelativePathCompat -BasePath $root -TargetPath $file.FullName
  $name = $file.Name.ToLowerInvariant()
  $extension = $file.Extension.ToLowerInvariant()

  if ($excludedExactFiles -contains $relative) { continue }
  if ($relative -like '*.bak' -or $relative -like '*.bak-*' -or $relative -like '*.pre-*.bak') { continue }
  if ($relative -like 'fix-*.ps1') { continue }
  if ($compressedExtensions -contains $extension) { continue }
  if ($binaryExtensions -contains $extension) { continue }

  if ($name -eq '.env' -or $name -eq '.env.local' -or $name -eq '.env.production') {
    Add-Issue -Issues $issues -File $relative -Issue 'Real env file is tracked or eligible to be committed'
    continue
  }

  if (
    $relative -match '\.env\.example$' -or
    $relative -match '\.env\..*\.example$' -or
    $relative -match '\.env\.template$'
  ) {
    continue
  }

  try {
    # File.ReadAllText returns an empty string for a zero-byte file.
    # Get-Content -Raw can return $null, which cannot be passed to
    # [regex]::Matches().
    $content = [System.IO.File]::ReadAllText($file.FullName)
  } catch {
    continue
  }

  if ([string]::IsNullOrWhiteSpace($content)) {
    continue
  }

  $hasPrivateKey = (
    $content -match $privateKeyBlockPattern -or
    $content -match $firebasePrivateKeyAssignPattern
  )

  if (
    $hasPrivateKey -and
    -not (Test-IsAllowedTestPrivateKeyFixture -RelativePath $relative -Content $content)
  ) {
    Add-Issue -Issues $issues -File $relative -Issue 'Private key material'
  }

  foreach ($match in [regex]::Matches(
    $content,
    $databaseUrlWithPasswordPattern,
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
  )) {
    $url = $match.Value

    if (-not (Test-IsPlaceholderDatabaseUrl -Url $url)) {
      Add-Issue -Issues $issues -File $relative -Issue 'Database URL with credentials'
      break
    }
  }

  $deviceSecretFound = $false

  foreach ($pattern in $deviceSecretPatterns) {
    foreach ($match in [regex]::Matches($content, $pattern)) {
      $secretValue = $match.Groups[1].Value

      if (
        -not (Test-IsAllowedDeviceSecretFixture `
          -RelativePath $relative `
          -SecretValue $secretValue `
          -Content $content)
      ) {
        Add-Issue -Issues $issues -File $relative -Issue 'Hardcoded device secret'
        $deviceSecretFound = $true
        break
      }
    }

    if ($deviceSecretFound) { break }
  }
}

Write-Host "Sensitive file scan mode: $scanMode" -ForegroundColor DarkCyan

if ($issues.Count -gt 0) {
  Write-Host 'Sensitive file scan found blocking issues:' -ForegroundColor Red
  $issues |
    Sort-Object File, Issue -Unique |
    Format-Table -AutoSize
  exit 1
}

Write-Host 'Sensitive file scan: OK' -ForegroundColor Green
