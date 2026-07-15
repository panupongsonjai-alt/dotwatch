param(
  [string]$RepoRoot = "D:\IoT Project\dotwatch",
  [string]$EasProjectId = ""
)

$ErrorActionPreference = "Stop"

function Replace-Once {
  param(
    [string]$Content,
    [string]$Needle,
    [string]$Replacement,
    [string]$Label
  )

  if ($Content.Contains($Replacement)) {
    Write-Host "SKIP already patched: $Label"
    return $Content
  }

  if (-not $Content.Contains($Needle)) {
    throw "Patch point not found: $Label"
  }

  return $Content.Replace($Needle, $Replacement)
}

function Add-NotificationTab {
  param(
    [string]$Content
  )

  if ($Content -match 'name\s*=\s*["'']notifications["'']') {
    Write-Host "SKIP already patched: notification tab"
    return $Content
  }

  $notificationBlock = @'
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notifications',
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              color={color}
              name="notifications-outline"
              size={size}
            />
          )
        }}
      />
'@

  $settingsPattern = '(?ms)^(?<indent>\s*)<Tabs\.Screen\s*\r?\n\s*name=["'']settings["'']'

  if ($Content -match $settingsPattern) {
    return [regex]::Replace(
      $Content,
      $settingsPattern,
      {
        param($match)

        $indent = $match.Groups['indent'].Value
        $block = $notificationBlock -replace '(?m)^      ', $indent

        return $block + $match.Value
      },
      1
    )
  }

  $hiddenDevicePattern = '(?ms)^(?<indent>\s*)<Tabs\.Screen\s*\r?\n\s*name=["'']devices/\[id\]["'']'

  if ($Content -match $hiddenDevicePattern) {
    Write-Host "WARN settings tab not found; inserting Notifications before hidden Device Detail route"

    return [regex]::Replace(
      $Content,
      $hiddenDevicePattern,
      {
        param($match)

        $indent = $match.Groups['indent'].Value
        $block = $notificationBlock -replace '(?m)^      ', $indent

        return $block + $match.Value
      },
      1
    )
  }

  $tabsCloseIndex = $Content.LastIndexOf('</Tabs>')

  if ($tabsCloseIndex -lt 0) {
    throw "Patch point not found: notification tab"
  }

  Write-Host "WARN named tab anchor not found; inserting Notifications before </Tabs>"

  return $Content.Insert($tabsCloseIndex, $notificationBlock)
}

$serverPath = Join-Path $RepoRoot "services\backend\src\server.js"
$server = Get-Content -LiteralPath $serverPath -Raw

$server = Replace-Once `
  -Content $server `
  -Needle "import { billingRouter } from './routes/billing.routes.js'" `
  -Replacement "import { billingRouter } from './routes/billing.routes.js'`nimport { mobilePushRouter } from './routes/mobilePush.routes.js'" `
  -Label "server import"

$server = Replace-Once `
  -Content $server `
  -Needle "app.use('/api/billing', apiLimiter, billingRouter)" `
  -Replacement "app.use('/api/billing', apiLimiter, billingRouter)`napp.use('/api/mobile-push', apiLimiter, mobilePushRouter)" `
  -Label "server route"

Set-Content -LiteralPath $serverPath -Value $server -Encoding UTF8

$layoutPath = Join-Path $RepoRoot "apps\mobile\app\_layout.tsx"
$layout = Get-Content -LiteralPath $layoutPath -Raw

$layout = Replace-Once `
  -Content $layout `
  -Needle "import { theme } from '@/theme';" `
  -Replacement "import { theme } from '@/theme';`nimport { useNotificationNavigation } from '@/hooks/useNotificationNavigation';" `
  -Label "layout hook import"

$layout = Replace-Once `
  -Content $layout `
  -Needle "export default function RootLayout() {" `
  -Replacement "export default function RootLayout() {`n  useNotificationNavigation();" `
  -Label "layout hook call"

Set-Content -LiteralPath $layoutPath -Value $layout -Encoding UTF8

$tabsPath = Join-Path $RepoRoot "apps\mobile\app\(app)\_layout.tsx"
$tabs = Get-Content -LiteralPath $tabsPath -Raw
$tabs = Add-NotificationTab -Content $tabs
Set-Content -LiteralPath $tabsPath -Value $tabs -Encoding UTF8

Push-Location (Join-Path $RepoRoot "apps\mobile")
try {
  npx expo install expo-notifications expo-device
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "Phase M5 code patch installed successfully."
Write-Host "Set EAS projectId in apps/mobile/app.json before requesting a token."

if ($EasProjectId) {
  Write-Host "Requested EAS projectId: $EasProjectId"
}
