param(
  [string]$RepoRoot = "D:\IoT Project\dotwatch",
  [Parameter(Mandatory = $true)][string]$Port,
  [ValidateSet("pilot", "release")][string]$Profile = "pilot",
  [string]$Python = "python"
)

$ErrorActionPreference = "Stop"

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

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$ReportDir = Join-Path ([IO.Path]::GetFullPath($RepoRoot)) "_reports\esp32-security\verify-$stamp"
New-Item -ItemType Directory -Path $ReportDir -Force | Out-Null

$summary = & $Python -m espefuse --chip esp32 --port $Port summary --format json 2>&1
if ($LASTEXITCODE -ne 0) { throw "Unable to read eFuse summary" }
$text = $summary -join "`n"
$text | Set-Content -LiteralPath (Join-Path $ReportDir "efuse-summary-after.json.txt") -Encoding UTF8
$data = ConvertFrom-EspefuseJson $text

$secureBoot = [bool]$data.ABS_DONE_1.value
$flashCryptCount = [Int64]$data.FLASH_CRYPT_CNT.value
$flashEncryption = Test-OddParity $flashCryptCount
$downloadEncryptDisabled = [bool]$data.DISABLE_DL_ENCRYPT.value
$downloadDecryptDisabled = [bool]$data.DISABLE_DL_DECRYPT.value
$jtagDisabled = [bool]$data.JTAG_DISABLE.value

$result = [ordered]@{
  checkedAt = (Get-Date).ToString("o")
  port = $Port
  profile = $Profile
  secureBootEnabled = $secureBoot
  flashCryptCount = $flashCryptCount
  flashEncryptionEnabled = $flashEncryption
  downloadEncryptDisabled = $downloadEncryptDisabled
  downloadDecryptDisabled = $downloadDecryptDisabled
  jtagDisabled = $jtagDisabled
}
$result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $ReportDir "verification.json") -Encoding UTF8

if (-not $secureBoot -or -not $flashEncryption) {
  Write-Error "FAIL: Secure Boot and Flash Encryption were not both detected."
  exit 2
}
if ($Profile -eq "release" -and (-not $downloadEncryptDisabled -or -not $downloadDecryptDisabled -or -not $jtagDisabled)) {
  Write-Error "FAIL: Release profile did not close UART download encryption/decryption and JTAG paths."
  exit 3
}

Write-Host "PASS: hardware security state matches the $Profile profile"
Write-Host "Secure Boot       : $secureBoot"
Write-Host "Flash Encryption  : $flashEncryption"
Write-Host "FLASH_CRYPT_CNT   : $flashCryptCount"
Write-Host "JTAG disabled     : $jtagDisabled"
Write-Host "Report            : $ReportDir"
