param(
  [string]$RepoRoot = "D:\IoT Project\dotwatch",
  [Parameter(Mandatory = $true)][string]$Port,
  [string]$Python = "python",
  [switch]$SourceOnly
)

$ErrorActionPreference = "Stop"

function Invoke-Capture {
  param([string[]]$Arguments)
  $output = & $Python @Arguments 2>&1
  $code = $LASTEXITCODE
  return [pscustomobject]@{ Output = @($output); ExitCode = $code }
}

function Assert-File([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Required file not found: $Path"
  }
}

function ConvertFrom-EspefuseJson([string]$Text) {
  $start = $Text.IndexOf('{')
  if ($start -lt 0) { throw "espefuse JSON output was not found" }
  return ($Text.Substring($start) | ConvertFrom-Json)
}

function Test-OddParity([Int64]$Value) {
  $bits = 0
  $current = $Value
  while ($current -gt 0) {
    $bits += ($current -band 1)
    $current = $current -shr 1
  }
  return (($bits % 2) -eq 1)
}

$RepoRoot = [IO.Path]::GetFullPath($RepoRoot)
$ProductRoot = Join-Path $RepoRoot "esp32\dotwatch_esp32_product"
Assert-File (Join-Path $ProductRoot "platformio.ini")
Assert-File (Join-Path $ProductRoot "sdkconfig.secure.common")
Assert-File (Join-Path $ProductRoot "partitions_secure_ota.csv")

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$ReportDir = Join-Path $RepoRoot "_reports\esp32-security\readiness-$stamp"
New-Item -ItemType Directory -Path $ReportDir -Force | Out-Null

$toolChecks = @(
  @{ Name = "PlatformIO"; Args = @("-m", "platformio", "--version") },
  @{ Name = "esptool"; Args = @("-m", "esptool", "version") },
  @{ Name = "espefuse"; Args = @("-m", "espefuse", "--help") },
  @{ Name = "espsecure"; Args = @("-m", "espsecure", "--help") }
)

$toolResults = @()
foreach ($tool in $toolChecks) {
  $result = Invoke-Capture $tool.Args
  $toolResults += [pscustomobject]@{
    Name = $tool.Name
    Passed = ($result.ExitCode -eq 0)
    Output = ($result.Output -join "`n")
  }
}

$failedTools = @($toolResults | Where-Object { -not $_.Passed })
if ($failedTools.Count -gt 0) {
  $toolResults | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $ReportDir "tools.json") -Encoding UTF8
  throw "Missing required Python tools. Install with: python -m pip install --upgrade platformio esptool"
}

if ($SourceOnly) {
  $summary = [ordered]@{
    checkedAt = (Get-Date).ToString("o")
    sourceOnly = $true
    repoRoot = $RepoRoot
    sourceFilesPresent = $true
    toolsPassed = $true
  }
  $summary | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $ReportDir "readiness.json") -Encoding UTF8
  Write-Host "PASS: source and security tools are ready"
  Write-Host "Report: $ReportDir"
  exit 0
}

$chip = Invoke-Capture @("-m", "esptool", "--chip", "esp32", "--port", $Port, "chip_id")
$flash = Invoke-Capture @("-m", "esptool", "--chip", "esp32", "--port", $Port, "flash_id")
$efuse = Invoke-Capture @("-m", "espefuse", "--chip", "esp32", "--port", $Port, "summary", "--format", "json")

$chipText = $chip.Output -join "`n"
$flashText = $flash.Output -join "`n"
$efuseText = $efuse.Output -join "`n"

$chipText | Set-Content -LiteralPath (Join-Path $ReportDir "chip-id.txt") -Encoding UTF8
$flashText | Set-Content -LiteralPath (Join-Path $ReportDir "flash-id.txt") -Encoding UTF8
$efuseText | Set-Content -LiteralPath (Join-Path $ReportDir "efuse-summary-before.json.txt") -Encoding UTF8

if ($chip.ExitCode -ne 0 -or $flash.ExitCode -ne 0 -or $efuse.ExitCode -ne 0) {
  throw "Unable to read the board. Check COM port, USB driver, cable, and close Serial Monitor."
}

$major = -1
$minor = 0
if ($chipText -match '(?i)revision\s+v?(\d+)(?:\.(\d+))?') {
  $major = [int]$Matches[1]
  if ($Matches[2]) { $minor = [int]$Matches[2] }
} elseif ($chipText -match '(?i)-V(\d+)') {
  $major = [int]$Matches[1]
}

$mac = "unknown"
if ($chipText -match '(?i)MAC:\s*([0-9a-f:]{17})') {
  $mac = $Matches[1].ToLowerInvariant()
}

$efuseData = ConvertFrom-EspefuseJson $efuseText
$secureBootAlreadyEnabled = [bool]$efuseData.ABS_DONE_1.value
$flashCryptCount = [Int64]$efuseData.FLASH_CRYPT_CNT.value
$flashEncryptionAppearsEnabled = Test-OddParity $flashCryptCount
$revisionPassed = $major -ge 3

$summary = [ordered]@{
  checkedAt = (Get-Date).ToString("o")
  sourceOnly = $false
  repoRoot = $RepoRoot
  port = $Port
  mac = $mac
  chipRevision = if ($major -ge 0) { "$major.$minor" } else { "unknown" }
  revisionSupportsSecureBootV2 = $revisionPassed
  secureBootAppearsEnabled = $secureBootAlreadyEnabled
  flashCryptCount = $flashCryptCount
  flashEncryptionAppearsEnabled = $flashEncryptionAppearsEnabled
  toolsPassed = $true
}
$summary | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $ReportDir "readiness.json") -Encoding UTF8

Write-Host "============================================================"
Write-Host "dotWatch ESP32 hardware security readiness"
Write-Host "============================================================"
Write-Host "Port              : $Port"
Write-Host "MAC               : $mac"
Write-Host "Chip revision     : $($summary.chipRevision)"
Write-Host "Secure Boot v2 OK : $revisionPassed"
Write-Host "Secure Boot state : $secureBootAlreadyEnabled"
Write-Host "Flash enc state   : $flashEncryptionAppearsEnabled"
Write-Host "FLASH_CRYPT_CNT   : $flashCryptCount"
Write-Host "Report            : $ReportDir"

if (-not $revisionPassed) {
  Write-Error "FAIL: ESP32 chip revision 3.0 or newer is required for Secure Boot v2."
  exit 2
}

Write-Host "PASS: board is eligible for the Phase S3B workflow"
