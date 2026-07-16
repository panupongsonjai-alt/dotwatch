param(
  [string]$RepoRoot = "D:\IoT Project\dotwatch",
  [Parameter(Mandatory = $true)][string]$Port,
  [string]$Python = "python",
  [int]$FlashSizeBytes = 0x400000
)

$ErrorActionPreference = "Stop"

function Invoke-Checked {
  param([string[]]$Arguments)
  & $Python @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Command failed: $Python $($Arguments -join ' ')" }
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$OutputDir = Join-Path ([IO.Path]::GetFullPath($RepoRoot)) "_backups\esp32-flash\$stamp"
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

$flashFile = Join-Path $OutputDir "flash-before-security.bin"
$efuseFile = Join-Path $OutputDir "efuse-summary-before.txt"
$chipFile = Join-Path $OutputDir "chip-id.txt"

$chip = & $Python -m esptool --chip esp32 --port $Port chip_id 2>&1
if ($LASTEXITCODE -ne 0) { throw "Unable to read chip identity" }
$chip | Set-Content -LiteralPath $chipFile -Encoding UTF8

$efuse = & $Python -m espefuse --chip esp32 --port $Port summary 2>&1
if ($LASTEXITCODE -ne 0) { throw "Unable to read eFuse summary" }
$efuse | Set-Content -LiteralPath $efuseFile -Encoding UTF8

Invoke-Checked @("-m", "esptool", "--chip", "esp32", "--port", $Port, "read_flash", "0x0", ("0x{0:X}" -f $FlashSizeBytes), $flashFile)
$hash = (Get-FileHash -LiteralPath $flashFile -Algorithm SHA256).Hash.ToLowerInvariant()
@{
  createdAt = (Get-Date).ToString("o")
  port = $Port
  flashSizeBytes = $FlashSizeBytes
  flashFile = $flashFile
  flashSha256 = $hash
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $OutputDir "backup.json") -Encoding UTF8

Write-Host "PASS: flash and eFuse backup completed"
Write-Host "Backup: $OutputDir"
Write-Host "SHA-256: $hash"
