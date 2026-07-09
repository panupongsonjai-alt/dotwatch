param(
  [string]$RepoRoot = "D:\IoT Project\dotwatch",
  [string]$BackendHost = "dotwatch-backend.onrender.com",
  [int]$Port = 443,
  [string]$OutputDir = "",
  [switch]$OpenFolder,
  [switch]$PrintCandidate
)

$ErrorActionPreference = "Stop"

function Section {
  param([string]$Title)

  Write-Host ""
  Write-Host "============================================================" -ForegroundColor DarkGray
  Write-Host $Title -ForegroundColor Cyan
  Write-Host "============================================================" -ForegroundColor DarkGray
}

function Ok {
  param([string]$Text)
  Write-Host ("OK   " + $Text) -ForegroundColor Green
}

function Warn {
  param([string]$Text)
  Write-Host ("WARN " + $Text) -ForegroundColor Yellow
}

function Ensure-Dir {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
  }
}

function Find-OpenSSL {
  $cmd = Get-Command openssl -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }

  $candidates = @(
    "C:\Program Files\Git\usr\bin\openssl.exe",
    "C:\Program Files\Git\mingw64\bin\openssl.exe",
    "C:\OpenSSL-Win64\bin\openssl.exe",
    "C:\OpenSSL-Win32\bin\openssl.exe"
  )

  foreach ($path in $candidates) {
    if (Test-Path -LiteralPath $path) {
      return $path
    }
  }

  throw "OpenSSL not found. Install Git for Windows or OpenSSL, then reopen PowerShell."
}

function Quote-Arg {
  param([string]$Value)

  if ($null -eq $Value) {
    return '""'
  }

  if ($Value -notmatch '[\s"]') {
    return $Value
  }

  return '"' + ($Value -replace '"', '\"') + '"'
}

function Invoke-OpenSSL {
  param(
    [string]$OpenSSL,
    [string[]]$ArgsList,
    [int]$TimeoutSeconds = 45
  )

  $tempBase = Join-Path $env:TEMP ("dotwatch-openssl-" + [Guid]::NewGuid().ToString("N"))
  $stdoutPath = $tempBase + ".out.txt"
  $stderrPath = $tempBase + ".err.txt"

  $argString = ($ArgsList | ForEach-Object { Quote-Arg $_ }) -join " "

  $process = Start-Process `
    -FilePath $OpenSSL `
    -ArgumentList $argString `
    -NoNewWindow `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath `
    -PassThru

  $finished = $process.WaitForExit($TimeoutSeconds * 1000)

  if (-not $finished) {
    try { $process.Kill() } catch {}
    throw ("OpenSSL timed out: " + $argString)
  }

  $stdout = ""
  $stderr = ""

  if (Test-Path -LiteralPath $stdoutPath) {
    $stdout = Get-Content -LiteralPath $stdoutPath -Raw
  }

  if (Test-Path -LiteralPath $stderrPath) {
    $stderr = Get-Content -LiteralPath $stderrPath -Raw
  }

  Remove-Item -LiteralPath $stdoutPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $stderrPath -Force -ErrorAction SilentlyContinue

  return @{
    ExitCode = $process.ExitCode
    Stdout = $stdout
    Stderr = $stderr
    Text = ($stdout + [Environment]::NewLine + $stderr)
  }
}

function Save-Text {
  param(
    [string]$Path,
    [string]$Content
  )

  Set-Content -LiteralPath $Path -Value $Content -Encoding ASCII
}

function Get-CertInfo {
  param(
    [string]$OpenSSL,
    [string]$CertPath
  )

  $info = Invoke-OpenSSL $OpenSSL @("x509", "-in", $CertPath, "-noout", "-subject", "-issuer", "-dates", "-fingerprint", "-sha256") 20
  return $info.Text.Trim()
}

function Validate-WithCaFile {
  param(
    [string]$OpenSSL,
    [string]$CaFile,
    [switch]$PartialChain
  )

  $args = @(
    "s_client",
    "-connect", ($BackendHost + ":" + $Port),
    "-servername", $BackendHost,
    "-CAfile", $CaFile,
    "-verify_return_error"
  )

  if ($PartialChain) {
    $args += "-partial_chain"
  }

  $result = Invoke-OpenSSL $OpenSSL $args 45
  $text = $result.Text
  $ok = $text -match "Verify return code:\s*0\s*\(ok\)"

  return @{
    Ok = $ok
    Text = $text
    ExitCode = $result.ExitCode
  }
}

$RepoRoot = [System.IO.Path]::GetFullPath($RepoRoot)

if (-not (Test-Path -LiteralPath $RepoRoot)) {
  throw ("RepoRoot not found: " + $RepoRoot)
}

if (-not $OutputDir) {
  $OutputDir = Join-Path $RepoRoot ("_reports\tls-ca\" + (Get-Date -Format "yyyyMMdd-HHmmss"))
}

$OutputDir = [System.IO.Path]::GetFullPath($OutputDir)

Section "dotWatch Phase 5B - TLS CA helper v2"
Write-Host ("RepoRoot       : " + $RepoRoot)
Write-Host ("BackendHost    : " + $BackendHost)
Write-Host ("Port           : " + $Port)
Write-Host ("OutputDir      : " + $OutputDir)
Write-Host ("OpenFolder     : " + $OpenFolder)
Write-Host ("PrintCandidate : " + $PrintCandidate)

Ensure-Dir $OutputDir

Section "1. Find OpenSSL"
$openssl = Find-OpenSSL
Ok ("OpenSSL: " + $openssl)

$version = Invoke-OpenSSL $openssl @("version") 10
Write-Host $version.Text.Trim()

Section "2. Fetch certificate chain"

$chain = Invoke-OpenSSL $openssl @(
  "s_client",
  "-showcerts",
  "-connect", ($BackendHost + ":" + $Port),
  "-servername", $BackendHost
) 45

$rawPath = Join-Path $OutputDir "openssl-s_client-showcerts.txt"
Set-Content -LiteralPath $rawPath -Value $chain.Text -Encoding UTF8
Ok ("saved raw OpenSSL output: " + $rawPath)

$matches = [regex]::Matches($chain.Text, "-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----")

if ($matches.Count -eq 0) {
  throw "No PEM certificates found in OpenSSL output."
}

Ok ("found certificates: " + $matches.Count)

$certPaths = New-Object "System.Collections.Generic.List[string]"

for ($i = 0; $i -lt $matches.Count; $i++) {
  $index = $i + 1
  $fileName = "cert-{0:D2}.pem" -f $index
  $certPath = Join-Path $OutputDir $fileName
  Save-Text $certPath $matches[$i].Value
  $certPaths.Add($certPath) | Out-Null
  Ok ("saved " + $fileName)
}

Section "3. Inspect certificates"

$summaryLines = New-Object "System.Collections.Generic.List[string]"

for ($i = 0; $i -lt $certPaths.Count; $i++) {
  $index = $i + 1
  $certPath = $certPaths[$i]
  $info = Get-CertInfo $openssl $certPath

  Write-Host ""
  Write-Host ("CERT " + $index + ": " + (Split-Path $certPath -Leaf)) -ForegroundColor Cyan
  Write-Host $info

  $summaryLines.Add(("CERT " + $index + ": " + (Split-Path $certPath -Leaf))) | Out-Null
  $summaryLines.Add($info) | Out-Null
  $summaryLines.Add("") | Out-Null
}

$summaryPath = Join-Path $OutputDir "certificate-summary.txt"
Set-Content -LiteralPath $summaryPath -Value ($summaryLines -join [Environment]::NewLine) -Encoding UTF8
Ok ("saved certificate summary: " + $summaryPath)

Section "4. Create ESP32 CA files"

$candidatePath = Join-Path $OutputDir "esp32-ca-candidate.pem"
Copy-Item -LiteralPath $certPaths[$certPaths.Count - 1] -Destination $candidatePath -Force
Ok ("created ESP32 CA candidate: " + $candidatePath)

$bundlePath = Join-Path $OutputDir "esp32-ca-bundle-excluding-server.pem"
$bundleParts = New-Object "System.Collections.Generic.List[string]"

if ($certPaths.Count -gt 1) {
  for ($i = 1; $i -lt $certPaths.Count; $i++) {
    $bundleParts.Add((Get-Content -LiteralPath $certPaths[$i] -Raw)) | Out-Null
    $bundleParts.Add("") | Out-Null
  }
} else {
  $bundleParts.Add((Get-Content -LiteralPath $certPaths[0] -Raw)) | Out-Null
}

Save-Text $bundlePath ($bundleParts -join [Environment]::NewLine)
Ok ("created ESP32 CA bundle: " + $bundlePath)

Section "5. Validate CA candidate"

$candidateNormal = Validate-WithCaFile $openssl $candidatePath
$candidateNormalPath = Join-Path $OutputDir "validate-candidate-normal.txt"
Set-Content -LiteralPath $candidateNormalPath -Value $candidateNormal.Text -Encoding UTF8

if ($candidateNormal.Ok) {
  Ok "candidate validation passed"
} else {
  Warn "candidate normal validation did not pass; trying -partial_chain"

  $candidatePartial = Validate-WithCaFile $openssl $candidatePath -PartialChain
  $candidatePartialPath = Join-Path $OutputDir "validate-candidate-partial-chain.txt"
  Set-Content -LiteralPath $candidatePartialPath -Value $candidatePartial.Text -Encoding UTF8

  if ($candidatePartial.Ok) {
    Ok "candidate validation passed with -partial_chain"
  } else {
    Warn "candidate validation still failed; trying CA bundle"

    $bundleNormal = Validate-WithCaFile $openssl $bundlePath
    $bundleNormalPath = Join-Path $OutputDir "validate-bundle-normal.txt"
    Set-Content -LiteralPath $bundleNormalPath -Value $bundleNormal.Text -Encoding UTF8

    if ($bundleNormal.Ok) {
      Ok "bundle validation passed"
    } else {
      $bundlePartial = Validate-WithCaFile $openssl $bundlePath -PartialChain
      $bundlePartialPath = Join-Path $OutputDir "validate-bundle-partial-chain.txt"
      Set-Content -LiteralPath $bundlePartialPath -Value $bundlePartial.Text -Encoding UTF8

      if ($bundlePartial.Ok) {
        Ok "bundle validation passed with -partial_chain"
      } else {
        Warn "OpenSSL validation did not pass. Inspect cert files manually before using."
      }
    }
  }
}

Section "6. How to use with ESP32"
Write-Host "Open ESP32 Local Admin URL, unlock with PIN, then paste one of these files into Root CA Certificate:"
Write-Host ("Recommended first: " + $candidatePath) -ForegroundColor Cyan
Write-Host ("Fallback bundle   : " + $bundlePath) -ForegroundColor Cyan
Write-Host ""
Write-Host "If ESP32 POST fails after saving Root CA, type CLEAR in Root CA Certificate and Save & Restart."

if ($PrintCandidate) {
  Section "7. Candidate PEM"
  Get-Content -LiteralPath $candidatePath
}

if ($OpenFolder) {
  Section "8. Open output folder"
  Start-Process explorer.exe $OutputDir
}

Section "Done"
Ok "TLS CA helper completed"
