param(
  [string]$RepoRoot = "D:\IoT Project\dotwatch"
)

$ErrorActionPreference = "Stop"

$alarmServicePath = Join-Path `
  $RepoRoot `
  "services\backend\src\services\alarm.service.js"

if (-not (Test-Path -LiteralPath $alarmServicePath)) {
  throw "Alarm service not found: $alarmServicePath"
}

$content = Get-Content -LiteralPath $alarmServicePath -Raw

$importLine = "import { sendAlarmTriggeredPush } from './mobilePush.service.js'"

if (-not $content.Contains($importLine)) {
  $poolImportPattern = "(?m)^import\s+\{\s*pool\s*\}\s+from\s+['""]\.\./db/pool\.js['""]\s*;?\s*$"
  $poolMatch = [regex]::Match($content, $poolImportPattern)

  if (-not $poolMatch.Success) {
    throw "Patch point not found: alarm service pool import"
  }

  $replacement = $poolMatch.Value + "`r`n" + $importLine
  $content = $content.Remove($poolMatch.Index, $poolMatch.Length)
  $content = $content.Insert($poolMatch.Index, $replacement)

  Write-Host "OK patched: mobile push import"
} else {
  Write-Host "SKIP already patched: mobile push import"
}

if ($content.Contains("void sendAlarmTriggeredPush({")) {
  Write-Host "SKIP already patched: alarm push call"
} else {
  $activeEventPattern = @'
(?ms)
(?<indent>^[ \t]*)
const\s+event\s*=\s*await\s+createAlarmEvent\s*\(\s*\{\s*
userId\s*,\s*
deviceId\s*,\s*
rule\s*:\s*triggeredRule\s*,\s*
metric\s*,\s*
value\s*,\s*
status\s*:\s*['"]active['"]\s*,\s*
time\s*:\s*reading\.time\s*,?\s*
\}\s*\)\s*;?
'@

  $match = [regex]::Match(
    $content,
    $activeEventPattern,
    [System.Text.RegularExpressions.RegexOptions]::IgnorePatternWhitespace
  )

  if (-not $match.Success) {
    throw "Patch point not found: active alarm event"
  }

  $indent = $match.Groups["indent"].Value
  $childIndent = $indent + "  "

  $pushCall = @"
$indent
${indent}void sendAlarmTriggeredPush({
${childIndent}userId,
${childIndent}deviceId,
${childIndent}alarmEvent: {
${childIndent}  ...event,
${childIndent}  metric_name: triggeredRule.metric_name || metric,
${childIndent}  unit: triggeredRule.unit || '',
${childIndent}  decimal_places: triggeredRule.decimal_places ?? 2,
${childIndent}},
${indent}}).catch((error) => {
${childIndent}console.error('Alarm push notification failed:', {
${childIndent}  userId,
${childIndent}  deviceId,
${childIndent}  alarmEventId: event.id,
${childIndent}  message: error.message,
${childIndent}})
${indent}})
"@

  $insertAt = $match.Index + $match.Length
  $content = $content.Insert($insertAt, $pushCall)

  Write-Host "OK patched: alarm push call"
}

Set-Content `
  -LiteralPath $alarmServicePath `
  -Value $content `
  -Encoding UTF8

Write-Host ""
Write-Host "Phase M5B alarm push integration installed successfully."
