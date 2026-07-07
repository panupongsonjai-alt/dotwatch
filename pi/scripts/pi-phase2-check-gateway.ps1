param(
  [string] $PiHost = "192.168.1.154",
  [string] $PiUser = "pi",
  [string] $RemoteDir = ""
)

$ErrorActionPreference = "Stop"

if (-not $RemoteDir) {
  $RemoteDir = "/home/$PiUser/dotwatch-pi-agent"
}

$Remote = "$PiUser@$PiHost"

Write-Host "dotWatch Phase 2 Pi Gateway check" -ForegroundColor Cyan
Write-Host "Pi: ${Remote}" -ForegroundColor Cyan
Write-Host "Remote dir: ${RemoteDir}" -ForegroundColor Cyan

Write-Host "\nChecking SSH..." -ForegroundColor Cyan
ssh $Remote "hostname && date"

Write-Host "\nChecking services..." -ForegroundColor Cyan
ssh $Remote "systemctl is-active dotwatch-pi-agent; systemctl is-enabled dotwatch-pi-agent; systemctl is-active dotwatch-pi-config-ui; systemctl is-enabled dotwatch-pi-config-ui"

Write-Host "\nRunning agent self check..." -ForegroundColor Cyan
ssh $Remote ("cd '{0}' && ./venv/bin/python agent_self_check.py" -f $RemoteDir)

Write-Host "\nOffline queue count..." -ForegroundColor Cyan
ssh $Remote ("cd '{0}' && if [ -f data/offline_queue.jsonl ]; then wc -l data/offline_queue.jsonl; else echo '0 data/offline_queue.jsonl'; fi" -f $RemoteDir)

Write-Host "\nRecent logs..." -ForegroundColor Cyan
ssh $Remote "journalctl -u dotwatch-pi-agent -n 80 --no-pager"

Write-Host "\nConfig UI:" -ForegroundColor Green
Write-Host "http://${PiHost}:8080"
