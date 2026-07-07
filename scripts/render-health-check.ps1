param(
  [string]$BackendUrl = 'https://dotwatch-backend.onrender.com',
  [string]$DashboardUrl = 'https://dotwatch.onrender.com',
  [int]$TimeoutSec = 20
)

$ErrorActionPreference = 'Stop'

function Test-Url([string]$Name, [string]$Url) {
  Write-Host "`nChecking $Name" -ForegroundColor Cyan
  Write-Host $Url
  try {
    $started = Get-Date
    $response = Invoke-WebRequest -Uri $Url -Method GET -TimeoutSec $TimeoutSec -UseBasicParsing
    $elapsed = [math]::Round(((Get-Date) - $started).TotalMilliseconds)
    Write-Host "[OK] HTTP $($response.StatusCode) in ${elapsed}ms" -ForegroundColor Green
    if ($response.Content) {
      $body = $response.Content
      if ($body.Length -gt 500) { $body = $body.Substring(0, 500) + '...' }
      Write-Host $body
    }
    return $true
  } catch {
    Write-Host "[FAIL] $($_.Exception.Message)" -ForegroundColor Red
    return $false
  }
}

Write-Host 'dotWatch Render health check' -ForegroundColor Cyan
$ok1 = Test-Url 'Backend /health' ($BackendUrl.TrimEnd('/') + '/health')
$ok2 = Test-Url 'Dashboard root' $DashboardUrl

if ($ok1 -and $ok2) {
  Write-Host "`nRender check: OK" -ForegroundColor Green
  exit 0
}

Write-Host "`nRender check: FAILED" -ForegroundColor Red
exit 1