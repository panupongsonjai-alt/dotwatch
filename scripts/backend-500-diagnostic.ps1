<#
 dotWatch backend 500 diagnostic helper
 Checks common local backend files and remote backend health without printing secrets.

 Examples:
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/backend-500-diagnostic.ps1
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/backend-500-diagnostic.ps1 -ApiUrl https://dotwatch-backend.onrender.com
#>

[CmdletBinding()]
param(
    [string]$Root = (Get-Location).Path,
    [string]$ApiUrl = "https://dotwatch-backend.onrender.com"
)

$ErrorActionPreference = "Continue"

function Write-Section {
    param([string]$Title)
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor DarkGray
    Write-Host $Title -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor DarkGray
}

function Write-CommandLine {
    param([string]$Command)
    Write-Host $Command -ForegroundColor DarkGray
}

function Mask-SecretLine {
    param([string]$Line)
    if ($Line -match "(?i)(SECRET|PASSWORD|TOKEN|KEY|DATABASE_URL|PRIVATE_KEY)=") {
        $parts = $Line -split "=", 2
        if ($parts.Count -eq 2) {
            return "$($parts[0])=***MASKED***"
        }
    }
    return $Line
}

try {
    $Root = (Resolve-Path -LiteralPath $Root).Path
} catch {
    Write-Warning "Root path not found: $Root"
}

Write-Host "dotWatch backend 500 diagnostic" -ForegroundColor Cyan
Write-Host "Root: $Root"
Write-Host "API URL: $ApiUrl"
Write-Host "Secrets are masked."

Write-Section "Remote backend /health"
try {
    $healthUrl = $ApiUrl.TrimEnd('/') + "/health"
    Write-CommandLine "GET $healthUrl"
    $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 20
    Write-Host "Status: $($response.StatusCode)"
    Write-Host $response.Content
} catch {
    Write-Warning $_.Exception.Message
    if ($_.Exception.Response) {
        try {
            Write-Warning "HTTP status: $([int]$_.Exception.Response.StatusCode)"
        } catch {}
    }
}

$backendDirCandidates = @(
    (Join-Path -Path $Root -ChildPath "services\backend"),
    (Join-Path -Path $Root -ChildPath "dotwatch-backend"),
    (Join-Path -Path $Root -ChildPath "backend")
)

$backendDir = $null
foreach ($candidate in $backendDirCandidates) {
    if (Test-Path -LiteralPath $candidate) {
        $backendDir = $candidate
        break
    }
}

Write-Section "Local backend directory"
if ($backendDir) {
    Write-Host "Found: $backendDir" -ForegroundColor Green
} else {
    Write-Warning "Backend directory not found. Checked:"
    $backendDirCandidates | ForEach-Object { Write-Host "- $_" }
    exit 0
}

Write-Section "Important backend files"
$importantFiles = @(
    "package.json",
    ".env",
    ".env.example",
    "src\server.js",
    "src\app.js",
    "src\config\env.js",
    "src\routes\ingest.js",
    "src\controllers\ingestController.js",
    "src\services\db.js"
)

foreach ($relativePath in $importantFiles) {
    $fullPath = Join-Path -Path $backendDir -ChildPath $relativePath
    if (Test-Path -LiteralPath $fullPath) {
        Write-Host "OK: $relativePath" -ForegroundColor Green
    } else {
        Write-Host "MISSING: $relativePath" -ForegroundColor Yellow
    }
}

Write-Section "Masked backend .env"
$envPath = Join-Path -Path $backendDir -ChildPath ".env"
if (Test-Path -LiteralPath $envPath) {
    Get-Content -Path $envPath | ForEach-Object { Mask-SecretLine $_ }
} else {
    Write-Warning ".env not found in backend directory"
}

Write-Section "package.json scripts"
$packagePath = Join-Path -Path $backendDir -ChildPath "package.json"
if (Test-Path -LiteralPath $packagePath) {
    try {
        $packageJson = Get-Content -Raw -Path $packagePath | ConvertFrom-Json
        if ($packageJson.scripts) {
            $packageJson.scripts.PSObject.Properties | ForEach-Object {
                Write-Host "$($_.Name): $($_.Value)"
            }
        } else {
            Write-Warning "No scripts object found in backend package.json"
        }
    } catch {
        Write-Warning "Could not parse backend package.json: $($_.Exception.Message)"
    }
} else {
    Write-Warning "Backend package.json not found"
}

Write-Section "Backend 500 next checks"
Write-Host "1. If /api/ingest returns 500, run: npm run diagnose:pi"
Write-Host "2. Check Render logs around the exact ingest timestamp."
Write-Host "3. Confirm DATABASE_URL, device_code, device secret hash, and metric schema/migrations."
Write-Host "4. Confirm Raspberry Pi payload uses metric_1, metric_2, metric_3 or the backend accepts legacy temperature/humidity."

Write-Host ""
Write-Host "Done." -ForegroundColor Green
