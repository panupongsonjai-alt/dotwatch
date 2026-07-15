param(
  [string]$RepoRoot = "D:\IoT Project\dotwatch"
)

$ErrorActionPreference = "Stop"

$MobileRoot = Join-Path $RepoRoot "apps\mobile"
$PackagePath = Join-Path $MobileRoot "package.json"
$AppJsonPath = Join-Path $MobileRoot "app.json"

if (-not (Test-Path -LiteralPath $PackagePath)) {
  throw "Mobile package.json not found: $PackagePath"
}

$Package = Get-Content -LiteralPath $PackagePath -Raw | ConvertFrom-Json

if (-not $Package.scripts) {
  $Package | Add-Member -MemberType NoteProperty -Name scripts -Value ([pscustomobject]@{})
}

$Package.scripts | Add-Member `
  -MemberType NoteProperty `
  -Name "check:release" `
  -Value "node scripts/check-release.mjs" `
  -Force

$Package |
  ConvertTo-Json -Depth 100 |
  Set-Content -LiteralPath $PackagePath -Encoding UTF8

if (Test-Path -LiteralPath $AppJsonPath) {
  $AppConfig = Get-Content -LiteralPath $AppJsonPath -Raw | ConvertFrom-Json

  if (-not $AppConfig.expo.plugins) {
    $AppConfig.expo | Add-Member `
      -MemberType NoteProperty `
      -Name plugins `
      -Value @()
  }

  $Plugins = @($AppConfig.expo.plugins)
  $PluginNames = @(
    $Plugins | ForEach-Object {
      if ($_ -is [System.Array]) {
        $_[0]
      } else {
        $_
      }
    }
  )

  if ($PluginNames -notcontains "expo-notifications") {
    $Plugins += "expo-notifications"
    $AppConfig.expo.plugins = $Plugins

    $AppConfig |
      ConvertTo-Json -Depth 100 |
      Set-Content -LiteralPath $AppJsonPath -Encoding UTF8

    Write-Host "OK added expo-notifications plugin"
  } else {
    Write-Host "SKIP expo-notifications plugin already exists"
  }
}

Push-Location $MobileRoot
try {
  npm run typecheck
  npm run check:release
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "Phase M7 release readiness installed successfully."
