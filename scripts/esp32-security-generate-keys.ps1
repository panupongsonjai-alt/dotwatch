param(
  [string]$RepoRoot = "D:\IoT Project\dotwatch",
  [string]$KeyRoot = "$env:USERPROFILE\.dotwatch\esp32-security",
  [string]$KeyId = "dotwatch-secure-boot-v2-2026-01",
  [switch]$Force,
  [string]$Python = "python"
)

$ErrorActionPreference = "Stop"

function Invoke-Checked {
  param([string[]]$Arguments)
  & $Python @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $Python $($Arguments -join ' ')"
  }
}

$RepoRoot = [IO.Path]::GetFullPath($RepoRoot).TrimEnd('\')
$KeyRoot = [IO.Path]::GetFullPath($KeyRoot).TrimEnd('\')
if ($KeyRoot.StartsWith($RepoRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw "KeyRoot must be outside the dotwatch repository"
}
if ($KeyId -notmatch '^[a-zA-Z0-9_.-]{4,80}$') {
  throw "KeyId contains invalid characters"
}

New-Item -ItemType Directory -Path $KeyRoot -Force | Out-Null
$privateKey = Join-Path $KeyRoot "$KeyId.secure-boot-v2.pem"
$publicKey = Join-Path $KeyRoot "$KeyId.secure-boot-v2.public.pem"
$publicDigest = Join-Path $KeyRoot "$KeyId.secure-boot-v2.digest.bin"
$metadataPath = Join-Path $KeyRoot "$KeyId.metadata.json"

foreach ($file in @($privateKey, $publicKey, $publicDigest, $metadataPath)) {
  if ((Test-Path -LiteralPath $file) -and -not $Force) {
    throw "Key material already exists: $file. Use -Force only for an intentional key rotation."
  }
}

Invoke-Checked @("-m", "espsecure", "generate_signing_key", "--version", "2", "--scheme", "rsa3072", $privateKey)
Invoke-Checked @("-m", "espsecure", "extract_public_key", "--version", "2", "--keyfile", $privateKey, $publicKey)
Invoke-Checked @("-m", "espsecure", "digest_sbv2_public_key", "--keyfile", $publicKey, "--output", $publicDigest)

$privateHash = (Get-FileHash -LiteralPath $privateKey -Algorithm SHA256).Hash.ToLowerInvariant()
$publicHash = (Get-FileHash -LiteralPath $publicKey -Algorithm SHA256).Hash.ToLowerInvariant()
$digestHash = (Get-FileHash -LiteralPath $publicDigest -Algorithm SHA256).Hash.ToLowerInvariant()

$metadata = [ordered]@{
  keyId = $KeyId
  scheme = "secure-boot-v2-rsa3072"
  createdAt = (Get-Date).ToString("o")
  privateKeyPath = $privateKey
  publicKeyPath = $publicKey
  publicDigestPath = $publicDigest
  privateKeyFileSha256 = $privateHash
  publicKeyFileSha256 = $publicHash
  publicDigestFileSha256 = $digestHash
}
$metadata | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $metadataPath -Encoding UTF8

$ProductRoot = Join-Path $RepoRoot "esp32\dotwatch_esp32_product"
if (-not (Test-Path -LiteralPath $ProductRoot -PathType Container)) {
  throw "ESP32 product folder not found: $ProductRoot"
}
$localConfig = Join-Path $ProductRoot "sdkconfig.secure.local"
$normalizedKey = $privateKey.Replace('\', '/')
@"
# Local hardware security key path. Generated file; do not commit.
CONFIG_SECURE_BOOT_SIGNING_KEY="$normalizedKey"
"@ | Set-Content -LiteralPath $localConfig -Encoding ASCII

Write-Host "============================================================"
Write-Host "dotWatch ESP32 hardware security keys generated"
Write-Host "============================================================"
Write-Host "Key ID          : $KeyId"
Write-Host "Private key     : $privateKey"
Write-Host "Public key      : $publicKey"
Write-Host "Public digest   : $publicDigest"
Write-Host "Metadata        : $metadataPath"
Write-Host "Local sdkconfig : $localConfig"
Write-Host ""
Write-Host "Set for the current PowerShell session before secure builds:"
Write-Host "`$env:DOTWATCH_SECURE_BOOT_SIGNING_KEY = '$privateKey'"
