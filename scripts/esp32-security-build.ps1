param(
  [string]$RepoRoot = "D:\IoT Project\dotwatch",
  [ValidateSet("pilot", "release")][string]$Profile = "pilot",
  [Parameter(Mandatory = $true)][string]$SecureBootKeyPath,
  [string]$Python = "",
  [switch]$Clean
)

$ErrorActionPreference = "Stop"

function Invoke-PythonTool {
  param(
    [Parameter(Mandatory = $true)][string]$Executable,
    [string[]]$PrefixArguments = @(),
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )

  # Keep native stdout visible without returning it through the PowerShell
  # success pipeline. The caller receives only the integer exit code.
  & $Executable @PrefixArguments @Arguments | Out-Host
  $nativeExitCode = $LASTEXITCODE
  return [int]$nativeExitCode
}

function Resolve-CompatiblePython {
  param([string]$RequestedPython)

  if (-not [string]::IsNullOrWhiteSpace($RequestedPython)) {
    $version = & $RequestedPython -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
    if ($LASTEXITCODE -ne 0) { throw "Unable to run Python: $RequestedPython" }
    $parts = $version.Trim().Split('.')
    if ([int]$parts[0] -ne 3 -or [int]$parts[1] -gt 11) {
      throw "ESP-IDF 4.4.7 secure build requires Python 3.11 or older. Requested Python is $version"
    }
    & $RequestedPython -m platformio --version *> $null
    if ($LASTEXITCODE -ne 0) {
      throw "PlatformIO is not installed for $RequestedPython. Run: $RequestedPython -m pip install --upgrade platformio esptool"
    }
    return [ordered]@{ Executable = $RequestedPython; Prefix = @(); Version = $version.Trim() }
  }

  $pyLauncher = Get-Command py -ErrorAction SilentlyContinue
  if ($pyLauncher) {
    $version = & py -3.11 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
    if ($LASTEXITCODE -eq 0) {
      & py -3.11 -m platformio --version *> $null
      if ($LASTEXITCODE -eq 0) {
        return [ordered]@{ Executable = "py"; Prefix = @("-3.11"); Version = $version.Trim() }
      }
    }
  }

  $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
  if ($pythonCommand) {
    $version = & python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
    if ($LASTEXITCODE -eq 0) {
      $parts = $version.Trim().Split('.')
      if ([int]$parts[0] -eq 3 -and [int]$parts[1] -le 11) {
        & python -m platformio --version *> $null
        if ($LASTEXITCODE -eq 0) {
          return [ordered]@{ Executable = "python"; Prefix = @(); Version = $version.Trim() }
        }
      }
    }
  }

  throw @"
No compatible PlatformIO Python was found.
ESP-IDF 4.4.7 in this project must use Python 3.11 or older, not Python 3.14.
Install Python 3.11, then run:
  py -3.11 -m pip install --upgrade platformio esptool ecdsa
"@
}

function Ensure-PythonModule {
  param(
    [Parameter(Mandatory = $true)][string]$Executable,
    [string[]]$PrefixArguments = @(),
    [Parameter(Mandatory = $true)][string]$Module,
    [Parameter(Mandatory = $true)][string]$Package
  )

  & $Executable @PrefixArguments -c "import $Module" *> $null
  if ($LASTEXITCODE -eq 0) { return }

  Write-Host "Installing missing Python package: $Package"
  $exitCode = Invoke-PythonTool `
    -Executable $Executable `
    -PrefixArguments $PrefixArguments `
    -Arguments @("-m", "pip", "install", "--disable-pip-version-check", "--upgrade", $Package)
  if ($exitCode -ne 0) {
    throw "Unable to install Python package '$Package' (exit code $exitCode)"
  }

  & $Executable @PrefixArguments -c "import $Module" *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "Python package '$Package' was installed but module '$Module' is still unavailable"
  }
}

function New-NoSpaceSubstDrive {
  param([Parameter(Mandatory = $true)][string]$TargetPath)

  foreach ($letter in @('W','V','U','T','S','R','Q','P')) {
    $root = "${letter}:\"
    if (-not (Test-Path -LiteralPath $root)) {
      & subst "${letter}:" $TargetPath
      if ($LASTEXITCODE -eq 0) {
        return [ordered]@{ Drive = "${letter}:"; Root = $root }
      }
    }
  }
  throw "Unable to allocate a temporary drive letter for the no-space PlatformIO build path"
}

function New-ArtifactRecord {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Kind
  )

  return [ordered]@{
    name = Split-Path -Leaf $Path
    kind = $Kind
    path = $Path
    size = (Get-Item -LiteralPath $Path).Length
    sha256 = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  }
}

$RepoRoot = [IO.Path]::GetFullPath($RepoRoot)
$OriginalProductRoot = Join-Path $RepoRoot "esp32\dotwatch_esp32_product"
$SecureBootKeyPath = [IO.Path]::GetFullPath($SecureBootKeyPath)

if (-not (Test-Path -LiteralPath $OriginalProductRoot -PathType Container)) {
  throw "ESP32 product folder not found: $OriginalProductRoot"
}
if (-not (Test-Path -LiteralPath $SecureBootKeyPath -PathType Leaf)) {
  throw "Secure Boot private key not found: $SecureBootKeyPath"
}
if ($SecureBootKeyPath.StartsWith($RepoRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Secure Boot private key must be stored outside the repository"
}

$pythonCommand = Resolve-CompatiblePython -RequestedPython $Python
Write-Host "Python             : $($pythonCommand.Executable) $($pythonCommand.Prefix -join ' ')"
Write-Host "Python version     : $($pythonCommand.Version)"

# tool-esptoolpy v4.x imports both packages while signing Secure Boot images.
# PlatformIO may not install ecdsa into an externally selected Python runtime.
Ensure-PythonModule -Executable $pythonCommand.Executable -PrefixArguments $pythonCommand.Prefix -Module "ecdsa" -Package "ecdsa"
Ensure-PythonModule -Executable $pythonCommand.Executable -PrefixArguments $pythonCommand.Prefix -Module "cryptography" -Package "cryptography"

# Remove only a disposable ESP-IDF virtual environment created with an
# unsupported Python version. PlatformIO recreates it automatically.
$platformioCoreDir = if ([string]::IsNullOrWhiteSpace($env:PLATFORMIO_CORE_DIR)) {
  Join-Path $env:USERPROFILE ".platformio"
} else {
  [IO.Path]::GetFullPath($env:PLATFORMIO_CORE_DIR)
}
$idfVenv = Join-Path $platformioCoreDir "penv\.espidf-4.4.7"
$idfVenvConfig = Join-Path $idfVenv "pyvenv.cfg"
if (Test-Path -LiteralPath $idfVenvConfig -PathType Leaf) {
  $venvText = Get-Content -LiteralPath $idfVenvConfig -Raw
  if ($venvText -match '(?m)^version\s*=\s*3\.(1[2-9]|[2-9][0-9])') {
    Write-Host "Removing incompatible ESP-IDF Python environment: $idfVenv"
    Remove-Item -LiteralPath $idfVenv -Recurse -Force
  }
}

$localConfig = Join-Path $OriginalProductRoot "sdkconfig.secure.local"
$normalizedKey = $SecureBootKeyPath.Replace('\', '/')
@"
# Local hardware security key path. Generated file; do not commit.
CONFIG_SECURE_BOOT_SIGNING_KEY="$normalizedKey"
"@ | Set-Content -LiteralPath $localConfig -Encoding ASCII

$env:DOTWATCH_SECURE_BOOT_SIGNING_KEY = $SecureBootKeyPath
$environment = if ($Profile -eq "release") { "esp32_product_secure_release" } else { "esp32_product_secure_pilot" }

$effectiveProductRoot = $OriginalProductRoot
$substInfo = $null
if ($RepoRoot -match '\s') {
  # Map the repository root so .git remains visible while CMake receives a
  # project path without whitespace.
  $substInfo = New-NoSpaceSubstDrive -TargetPath $RepoRoot
  $effectiveProductRoot = Join-Path $substInfo.Root "esp32\dotwatch_esp32_product"
  Write-Host "Build path mapping : $($substInfo.Drive) -> $RepoRoot"
  Write-Host "Effective project  : $effectiveProductRoot"
}

try {
  Push-Location $effectiveProductRoot
  try {
    if ($Clean) {
      $exitCode = Invoke-PythonTool `
        -Executable $pythonCommand.Executable `
        -PrefixArguments $pythonCommand.Prefix `
        -Arguments @("-m", "platformio", "run", "-e", $environment, "-t", "clean")
      if ($exitCode -ne 0) { throw "PlatformIO clean failed (exit code $exitCode)" }
    }

    $exitCode = Invoke-PythonTool `
      -Executable $pythonCommand.Executable `
      -PrefixArguments $pythonCommand.Prefix `
      -Arguments @("-m", "platformio", "run", "-e", $environment)
    if ($exitCode -ne 0) { throw "PlatformIO secure build failed (exit code $exitCode)" }
  } finally {
    Pop-Location
  }

  $buildDir = Join-Path $OriginalProductRoot ".pio\build\$environment"
  $unsignedArtifacts = @(
    (Join-Path $buildDir "firmware.bin"),
    (Join-Path $buildDir "bootloader.bin"),
    (Join-Path $buildDir "partitions.bin")
  )
  $signedArtifacts = @(
    (Join-Path $buildDir "firmware-signed.bin"),
    (Join-Path $buildDir "bootloader-signed.bin"),
    (Join-Path $buildDir "partitions-signed.bin")
  )

  foreach ($file in @($unsignedArtifacts + $signedArtifacts)) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
      throw "Build artifact missing: $file"
    }
  }

  $signedFirmware = Join-Path $buildDir "firmware-signed.bin"
  $otaSlotBytes = 0x170000
  $signedFirmwareSize = (Get-Item -LiteralPath $signedFirmware).Length
  if ($signedFirmwareSize -gt $otaSlotBytes) {
    throw "Signed firmware exceeds secure OTA slot: $signedFirmwareSize bytes > $otaSlotBytes bytes"
  }

  $espSecureTool = Join-Path $platformioCoreDir "packages\tool-esptoolpy\espsecure.py"
  if (-not (Test-Path -LiteralPath $espSecureTool -PathType Leaf)) {
    throw "PlatformIO espsecure tool not found: $espSecureTool"
  }

  foreach ($file in $signedArtifacts) {
    Write-Host "Verifying signature: $file"
    $exitCode = Invoke-PythonTool `
      -Executable $pythonCommand.Executable `
      -PrefixArguments $pythonCommand.Prefix `
      -Arguments @($espSecureTool, "verify_signature", "--version", "2", "--keyfile", $SecureBootKeyPath, $file)
    if ($exitCode -ne 0) {
      throw "Secure Boot v2 signature verification failed: $file"
    }
  }

  $reportDir = Join-Path $RepoRoot "_reports\esp32-security\build-$Profile-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
  New-Item -ItemType Directory -Path $reportDir -Force | Out-Null

  $unsignedRecords = @($unsignedArtifacts | ForEach-Object { New-ArtifactRecord -Path $_ -Kind "unsigned-intermediate" })
  $signedRecords = @($signedArtifacts | ForEach-Object { New-ArtifactRecord -Path $_ -Kind "secure-boot-v2-signed" })
  $remainingBytes = $otaSlotBytes - $signedFirmwareSize

  [ordered]@{
    builtAt = (Get-Date).ToString("o")
    profile = $Profile
    environment = $environment
    pythonVersion = $pythonCommand.Version
    buildPath = $effectiveProductRoot
    keyFileName = Split-Path -Leaf $SecureBootKeyPath
    secureBootSignature = "RSA Secure Boot v2"
    otaSlotBytes = $otaSlotBytes
    signedFirmwareBytes = $signedFirmwareSize
    otaRemainingBytes = $remainingBytes
    hardwareProvisioned = $false
    unsignedArtifacts = $unsignedRecords
    signedArtifacts = $signedRecords
  } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $reportDir "build.json") -Encoding UTF8

  $signedRecords | ForEach-Object {
    "$($_.sha256)  $($_.name)"
  } | Set-Content -LiteralPath (Join-Path $reportDir "signed-images.sha256") -Encoding ASCII

  Write-Host "PASS: secure firmware build and signature verification completed"
  Write-Host "Environment      : $environment"
  Write-Host "Signed firmware  : $signedFirmware"
  Write-Host "Signed size      : $signedFirmwareSize bytes"
  Write-Host "OTA free space   : $remainingBytes bytes"
  Write-Host "Hardware changed : False"
  Write-Host "Report           : $reportDir"
} finally {
  if ($substInfo) {
    & subst $substInfo.Drive /D
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "Unable to remove temporary drive mapping $($substInfo.Drive). Run: subst $($substInfo.Drive) /D"
    }
  }
}
