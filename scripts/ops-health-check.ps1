param(
  [string]$BackendUrl = $(if ($env:DOTWATCH_BACKEND_URL) { $env:DOTWATCH_BACKEND_URL } elseif ($env:BACKEND_URL) { $env:BACKEND_URL } else { 'http://localhost:4000' }),
  [string]$DashboardUrl = $(if ($env:DOTWATCH_DASHBOARD_URL) { $env:DOTWATCH_DASHBOARD_URL } else { '' }),
  [string]$AdminUrl = $(if ($env:DOTWATCH_ADMIN_URL) { $env:DOTWATCH_ADMIN_URL } else { '' }),
  [int]$TimeoutSec = 35,
  [int]$RetryCount = 2,
  [int]$RetryDelaySec = 3,
  [switch]$AllowReady503,
  [switch]$NoReport
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$reportDir = Join-Path $repoRoot '_reports\ops'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'

function New-CheckResult {
  param(
    [string]$Name,
    [string]$Url,
    [bool]$Ok,
    [nullable[int]]$StatusCode,
    [nullable[int]]$LatencyMs,
    [string]$RequestId,
    [string]$Message,
    [object]$Body,
    [int]$Attempts = 1
  )

  [pscustomobject]@{
    name = $Name
    url = $Url
    ok = $Ok
    statusCode = $StatusCode
    latencyMs = $LatencyMs
    requestId = $RequestId
    message = $Message
    attempts = $Attempts
    body = $Body
  }
}

function Invoke-OneHealthAttempt {
  param(
    [string]$Name,
    [string]$Url,
    [int[]]$AcceptStatus,
    [string]$RequestId
  )

  $started = Get-Date
  $statusCode = $null
  $body = $null
  $message = ''

  try {
    $headers = @{ 'X-Request-ID' = $RequestId }
    $response = Invoke-WebRequest -Uri $Url -Method GET -TimeoutSec $TimeoutSec -UseBasicParsing -Headers $headers -ErrorAction Stop
    $statusCode = [int]$response.StatusCode
    $message = "HTTP $statusCode"

    if ($response.Content) {
      try { $body = $response.Content | ConvertFrom-Json } catch { $body = $response.Content }
    }
  }
  catch {
    if ($_.Exception.Response -ne $null) {
      $statusCode = [int]$_.Exception.Response.StatusCode
      $stream = $_.Exception.Response.GetResponseStream()
      if ($stream -ne $null) {
        $reader = New-Object System.IO.StreamReader($stream)
        $content = $reader.ReadToEnd()
        if ($content) {
          try { $body = $content | ConvertFrom-Json } catch { $body = $content }
        }
      }
      $message = "HTTP $statusCode"
    } else {
      $message = $_.Exception.Message
    }
  }

  $latencyMs = [math]::Round(((Get-Date) - $started).TotalMilliseconds)
  $ok = $statusCode -ne $null -and ($AcceptStatus -contains [int]$statusCode)

  $responseRequestId = $RequestId
  if ($body -and $body.PSObject.Properties.Name -contains 'requestId') {
    $responseRequestId = [string]$body.requestId
  }

  return New-CheckResult -Name $Name -Url $Url -Ok $ok -StatusCode $statusCode -LatencyMs $latencyMs -RequestId $responseRequestId -Message $message -Body $body -Attempts 1
}

function Invoke-HealthCheck {
  param(
    [string]$Name,
    [string]$Url,
    [int[]]$AcceptStatus = @(200)
  )

  if ([string]::IsNullOrWhiteSpace($Url)) {
    return New-CheckResult -Name $Name -Url $Url -Ok $true -StatusCode $null -LatencyMs $null -RequestId '' -Message 'Skipped: URL not configured' -Body $null -Attempts 0
  }

  $maxAttempts = [math]::Max(1, $RetryCount + 1)
  $lastResult = $null
  $totalLatencyMs = 0

  for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    $requestId = "ops-$([guid]::NewGuid().ToString('N').Substring(0, 12))"
    $result = Invoke-OneHealthAttempt -Name $Name -Url $Url -AcceptStatus $AcceptStatus -RequestId $requestId
    $totalLatencyMs += [int]($result.latencyMs)
    $lastResult = $result

    if ($result.ok) {
      $result.attempts = $attempt
      $result.latencyMs = $totalLatencyMs
      if ($attempt -gt 1) {
        $result.message = "$($result.message) after retry $attempt/$maxAttempts"
      }
      return $result
    }

    if ($attempt -lt $maxAttempts) {
      Start-Sleep -Seconds $RetryDelaySec
    }
  }

  if ($lastResult -ne $null) {
    $lastResult.attempts = $maxAttempts
    $lastResult.latencyMs = $totalLatencyMs
    if ($maxAttempts -gt 1) {
      $lastResult.message = "$($lastResult.message) after $maxAttempts attempts"
    }
    return $lastResult
  }

  return New-CheckResult -Name $Name -Url $Url -Ok $false -StatusCode $null -LatencyMs $null -RequestId '' -Message 'No health check attempt completed' -Body $null -Attempts 0
}

$backend = $BackendUrl.TrimEnd('/')
$checks = @()
$checks += Invoke-HealthCheck -Name 'backend-live' -Url "$backend/health/live" -AcceptStatus @(200)
$readyAcceptStatus = if ($AllowReady503) { @(200, 503) } else { @(200) }
$checks += Invoke-HealthCheck -Name 'backend-ready' -Url "$backend/health/ready" -AcceptStatus $readyAcceptStatus
$checks += Invoke-HealthCheck -Name 'backend-root-health' -Url "$backend/health" -AcceptStatus $readyAcceptStatus
$checks += Invoke-HealthCheck -Name 'dashboard-root' -Url $DashboardUrl -AcceptStatus @(200)
$checks += Invoke-HealthCheck -Name 'admin-root' -Url $AdminUrl -AcceptStatus @(200)

$failed = @($checks | Where-Object { -not $_.ok })
$summary = [pscustomobject]@{
  ok = ($failed.Count -eq 0)
  timestamp = (Get-Date).ToUniversalTime().ToString('o')
  backendUrl = $BackendUrl
  dashboardUrl = $DashboardUrl
  adminUrl = $AdminUrl
  timeoutSec = $TimeoutSec
  retryCount = $RetryCount
  retryDelaySec = $RetryDelaySec
  failedCount = $failed.Count
  checks = $checks
}

foreach ($check in $checks) {
  $color = if ($check.ok) { 'Green' } else { 'Red' }
  Write-Host ("[{0}] {1} status={2} latency={3}ms attempts={4} requestId={5} - {6}" -f ($(if ($check.ok) { 'OK' } else { 'FAIL' }), $check.name, $check.statusCode, $check.latencyMs, $check.attempts, $check.requestId, $check.message)) -ForegroundColor $color
}

if (-not $NoReport) {
  New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
  $reportPath = Join-Path $reportDir "ops-health-$timestamp.json"
  $summary | ConvertTo-Json -Depth 12 | Set-Content -Encoding UTF8 -Path $reportPath
  Write-Host "Report: $reportPath" -ForegroundColor Cyan
}

if ($summary.ok) {
  Write-Host 'Ops health check: OK' -ForegroundColor Green
  exit 0
}

Write-Host 'Ops health check: FAILED' -ForegroundColor Red
exit 1
