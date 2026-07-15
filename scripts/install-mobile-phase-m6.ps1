param(
  [string]$RepoRoot = "D:\IoT Project\dotwatch"
)

$ErrorActionPreference = "Stop"

$MobileRoot = Join-Path $RepoRoot "apps\mobile"

if (-not (Test-Path -LiteralPath (Join-Path $MobileRoot "package.json"))) {
  throw "Mobile package.json not found: $MobileRoot"
}

Push-Location $MobileRoot
try {
  npx expo install @react-native-async-storage/async-storage expo-dev-client
  npm run typecheck
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "Phase M6 dependencies installed and typecheck completed."
Write-Host "Next: run eas build:configure, then create a development build."
