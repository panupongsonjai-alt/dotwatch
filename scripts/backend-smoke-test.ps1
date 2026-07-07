param(
  [string]$BaseUrl = $(if ($env:DOTWATCH_BACKEND_URL) { $env:DOTWATCH_BACKEND_URL } elseif ($env:BACKEND_URL) { $env:BACKEND_URL } else { 'http://localhost:4000' }),
  [switch]$SkipReady
)

$ErrorActionPreference = 'Stop'
$base = $BaseUrl.TrimEnd('/')

function Invoke-Check {
  param(
    [string]$Name,
    [string]$Path,
    [int[]]$AcceptStatus = @(200)
  )

  $url = "$base$Path"
  Write-Host "Checking $Name -> $url" -ForegroundColor Cyan

  try {
    $response = Invoke-WebRequest -Uri $url -Method GET -TimeoutSec 20 -ErrorAction Stop
    $statusCode = [int]$response.StatusCode
    $body = $response.Content | ConvertFrom-Json
  }
  catch {
    if ($_.Exception.Response -eq $null) {
      throw
    }

    $statusCode = [int]$_.Exception.Response.StatusCode
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $content = $reader.ReadToEnd()
    $body = if ($content) { $content | ConvertFrom-Json } else { $null }
  }

  if ($AcceptStatus -notcontains $statusCode) {
    throw "$Name failed. Expected status $($AcceptStatus -join '/'), got $statusCode"
  }

  $requestId = $null
  if ($body -and $body.PSObject.Properties.Name -contains 'requestId') {
    $requestId = $body.requestId
  }

  Write-Host "OK $Name status=$statusCode requestId=$requestId" -ForegroundColor Green
  return $body
}

Write-Host "dotWatch backend smoke test" -ForegroundColor Yellow
Write-Host "Base URL: $base"

$live = Invoke-Check -Name 'live health' -Path '/health/live' -AcceptStatus @(200)

if (-not $live.ok) {
  throw '/health/live returned ok=false'
}

if (-not $SkipReady) {
  $ready = Invoke-Check -Name 'ready health' -Path '/health/ready' -AcceptStatus @(200)

  if (-not $ready.ok) {
    throw '/health/ready returned ok=false'
  }

  if ($ready.database -ne 'connected') {
    throw "Database is not connected. Current value: $($ready.database)"
  }
}

Invoke-Check -Name 'protected API auth guard' -Path '/api/devices' -AcceptStatus @(200, 401) | Out-Null

Write-Host 'Smoke test passed.' -ForegroundColor Green
