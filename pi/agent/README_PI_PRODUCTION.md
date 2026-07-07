# dotWatch Raspberry Pi Agent - Production Baseline

This folder stores the Raspberry Pi agent files synced from a known-good Pi.

## Known-good runtime

- Agent service: dotwatch-pi-agent.service
- Config UI service: dotwatch-pi-config-ui.service
- Agent directory on Pi: $RemoteAgentDir
- Config UI URL over LAN: http:///
- Queue pacing:
  - SEND_INTERVAL_SECONDS=20
  - QUEUE_FLUSH_LIMIT=1

## Services that should remain active

`	ext
dotwatch-pi-agent.service
dotwatch-pi-config-ui.service
`

Old services such as dotwatch-sender.service, dotwatch-agent.service, and dotwatch-setup-ui.service should not be active on the production Pi.

## Quick checks

`powershell
$PiHost = "192.168.50.2"

ssh pi@$PiHost "systemctl is-active dotwatch-pi-agent.service dotwatch-pi-config-ui.service"

ssh pi@$PiHost "journalctl -u dotwatch-pi-agent.service -n 40 --no-pager"

ssh pi@$PiHost "ss -ltnp | grep ':8080' || true"
`

## Secret handling

Do not commit the Pi .env file. Use .env.example as a template only.