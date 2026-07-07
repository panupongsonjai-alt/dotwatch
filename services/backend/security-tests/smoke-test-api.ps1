param(
  [string]$ApiUrl = "http://localhost:4000",
  [string]$FirebaseToken = $env:FIREBASE_ID_TOKEN,
  [string]$DeviceCode = $env:DOTWATCH_DEVICE_CODE,
  [string]$DeviceSecret = $env:DOTWATCH_DEVICE_SECRET,
  [string]$AllowedOrigin = "http://localhost:5173",
  [string]$BlockedOrigin = "https://evil.example.com"
)

$ErrorActionPreference = "Stop"

function Write-Section($title) {
  Write-Host ""
  Write-Host "============================================================"
  Write-Host $title
  Write-Host "============================================================"
}

function Invoke-Test {
  param(
    [string]$Name,
    [scriptblock]$Script,
    [int[]]$ExpectedStatus = @(200),
    [switch]$AllowAny2xx
  )

  try {
    $result = & $Script
    $status = [int]$result.StatusCode

    $ok = $ExpectedStatus -contains $status
    if ($AllowAny2xx) {
      $ok = $status -ge 200 -and $status -lt 300
    }

    if ($ok) {
      Write-Host "[PASS] $Name -> HTTP $status" -ForegroundColor Green
    } else {
      Write-Host "[FAIL] $Name -> HTTP $status expected $($ExpectedStatus -join ',')" -ForegroundColor Red
      if ($result.Content) {
        Write-Host $result.Content
      }
    }
  } catch {
    $response = $_.Exception.Response

    if ($response) {
      $status = [int]$response.StatusCode
      $ok = $ExpectedStatus -contains $status

      if ($ok) {
        Write-Host "[PASS] $Name -> HTTP $status" -ForegroundColor Green
      } else {
        Write-Host "[FAIL] $Name -> HTTP $status expected $($ExpectedStatus -join ',')" -ForegroundColor Red

        try {
          $stream = $response.GetResponseStream()
          if ($stream) {
            $reader = New-Object System.IO.StreamReader($stream)
            $content = $reader.ReadToEnd()
            if ($content) {
              Write-Host $content
            }
          }
        } catch {}
      }
    } else {
      Write-Host "[FAIL] $Name -> $($_.Exception.Message)" -ForegroundColor Red
    }
  }
}

function Request {
  param(
    [string]$Method = "GET",
    [string]$Path,
    [hashtable]$Headers = @{},
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [object]$Body = $null
  )

  $uri = "$ApiUrl$Path"

  $params = @{
    Uri = $uri
    Method = $Method
    Headers = $Headers
    UseBasicParsing = $true
  }

  # สำคัญ:
  # ห้ามส่ง Body ไปกับ GET/OPTIONS/HEAD
  # PowerShell บางเวอร์ชันจะ error: Cannot send a content-body with this verb-type.
  $methodUpper = $Method.ToUpperInvariant()
  $canHaveBody = @("POST", "PUT", "PATCH", "DELETE") -contains $methodUpper

  if ($canHaveBody -and $PSBoundParameters.ContainsKey("Body") -and $null -ne $Body) {
    $params.ContentType = "application/json"
    $params.Body = [string]$Body
  }

  Invoke-WebRequest @params
}

Write-Section "dotWatch Security Smoke Test"
Write-Host "API URL: $ApiUrl"

Write-Section "Public / Basic"
Invoke-Test "GET /health" {
  Request -Path "/health"
} -ExpectedStatus @(200, 503)

Write-Section "Protected API without token"
Invoke-Test "GET /api/devices without token should be blocked" {
  Request -Path "/api/devices"
} -ExpectedStatus @(401)

Invoke-Test "GET /api/device-models without token should be blocked" {
  Request -Path "/api/device-models"
} -ExpectedStatus @(401)

Invoke-Test "GET /api/alarm-states/summary without token should be blocked" {
  Request -Path "/api/alarm-states/summary"
} -ExpectedStatus @(401)

Write-Section "Device ingest auth"
Invoke-Test "POST /api/ingest without device credentials should be blocked" {
  Request -Method "POST" -Path "/api/ingest" -Body '{"metrics":{"metric_1":30}}'
} -ExpectedStatus @(401)

Invoke-Test "POST /api/ingest with invalid device credentials should be blocked" {
  Request `
    -Method "POST" `
    -Path "/api/ingest" `
    -Headers @{
      "x-device-code" = "DW-INVALID"
      "x-device-secret" = "invalid-secret"
    } `
    -Body '{"metrics":{"metric_1":30}}'
} -ExpectedStatus @(401, 429)

Write-Section "CORS quick check"
Invoke-Test "OPTIONS /api/devices with blocked Origin should not pass" {
  Request `
    -Method "OPTIONS" `
    -Path "/api/devices" `
    -Headers @{
      "Origin" = $BlockedOrigin
      "Access-Control-Request-Method" = "GET"
    }
} -ExpectedStatus @(500, 403, 404)

Invoke-Test "OPTIONS /api/devices with allowed Origin" {
  Request `
    -Method "OPTIONS" `
    -Path "/api/devices" `
    -Headers @{
      "Origin" = $AllowedOrigin
      "Access-Control-Request-Method" = "GET"
    }
} -ExpectedStatus @(204, 200)

if ($FirebaseToken) {
  Write-Section "Protected API with Firebase token"

  $authHeaders = @{
    "Authorization" = "Bearer $FirebaseToken"
  }

  Invoke-Test "GET /api/devices with token" {
    Request -Path "/api/devices" -Headers $authHeaders
  } -ExpectedStatus @(200)

  Invoke-Test "GET /api/device-models with token" {
    Request -Path "/api/device-models" -Headers $authHeaders
  } -ExpectedStatus @(200)

  Invoke-Test "GET /api/alarm-states/summary with token" {
    Request -Path "/api/alarm-states/summary" -Headers $authHeaders
  } -ExpectedStatus @(200)
} else {
  Write-Section "Protected API with token skipped"
  Write-Host "Set FIREBASE_ID_TOKEN env var to test authenticated endpoints."
}

if ($DeviceCode -and $DeviceSecret) {
  Write-Section "Valid device ingest"

  Invoke-Test "POST /api/ingest with valid device credentials" {
    Request `
      -Method "POST" `
      -Path "/api/ingest" `
      -Headers @{
        "x-device-code" = $DeviceCode
        "x-device-secret" = $DeviceSecret
      } `
      -Body '{"metrics":{"metric_1":30.11,"metric_2":60.22},"firmwareVersion":"security-smoke-test"}'
  } -ExpectedStatus @(201, 200, 429)
} else {
  Write-Section "Valid device ingest skipped"
  Write-Host "Set DOTWATCH_DEVICE_CODE and DOTWATCH_DEVICE_SECRET env vars to test valid ingest."
}

Write-Section "Done"
