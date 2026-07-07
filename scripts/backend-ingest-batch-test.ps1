param(
  [string]$BaseUrl = "http://localhost:4000",
  [Parameter(Mandatory = $true)] [string]$DeviceCode,
  [Parameter(Mandatory = $true)] [string]$DeviceSecret
)

$ErrorActionPreference = "Stop"

$Uri = ($BaseUrl.TrimEnd('/')) + "/api/ingest/batch"
$Headers = @{
  "x-device-code" = $DeviceCode
  "x-device-secret" = $DeviceSecret
}

$Now = [DateTimeOffset]::UtcNow
$Payload = @{
  firmwareVersion = "phase4-smoke-test"
  readings = @(
    @{
      timestamp = $Now.AddSeconds(-20).ToString("o")
      metrics = @{
        metric_1 = 24.8
        metric_2 = 51.2
        metric_3 = -45
      }
    },
    @{
      timestamp = $Now.AddSeconds(-10).ToString("o")
      metrics = @{
        metric_1 = 24.9
        metric_2 = 51.1
        metric_3 = -44
      }
    }
  )
} | ConvertTo-Json -Depth 10

Write-Host "POST $Uri" -ForegroundColor Cyan
$Result = Invoke-RestMethod -Method POST -Uri $Uri -Headers $Headers -ContentType "application/json" -Body $Payload
$Result | ConvertTo-Json -Depth 10
