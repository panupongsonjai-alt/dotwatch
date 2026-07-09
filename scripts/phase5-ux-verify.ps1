param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'

Write-Host 'dotWatch Phase 5 UX verify' -ForegroundColor Cyan
Write-Host "RepoRoot: $RepoRoot"

Push-Location $RepoRoot
try {
  node .\scripts\phase5-ux-verify.mjs
}
finally {
  Pop-Location
}
