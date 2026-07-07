# dotWatch Pi Gateway Operations

## Common commands on Raspberry Pi

```bash
cd /home/pi/dotwatch-pi-agent

sudo systemctl status dotwatch-pi-agent --no-pager
sudo systemctl restart dotwatch-pi-agent
sudo journalctl -u dotwatch-pi-agent -f

sudo systemctl status dotwatch-pi-config-ui --no-pager
sudo systemctl restart dotwatch-pi-config-ui

./venv/bin/python agent_self_check.py
./venv/bin/python agent_self_check.py --send-test
./dotwatch-pi-health.sh
```

## Files on Raspberry Pi

```text
/home/pi/dotwatch-pi-agent/.env
/home/pi/dotwatch-pi-agent/modbus_config.json
/home/pi/dotwatch-pi-agent/data/offline_queue.jsonl
```

## When backend is down

The agent logs `QUEUED pending=...` and stores payloads in `data/offline_queue.jsonl`.

When the backend returns, the agent logs `QUEUE_FLUSHED sent=... remaining=...`.

## If Dashboard does not update

Check in this order:

1. `DEVICE_CODE` and `DEVICE_SECRET` in `/home/pi/dotwatch-pi-agent/.env`
2. Backend health: `./venv/bin/python agent_self_check.py`
3. Service logs: `sudo journalctl -u dotwatch-pi-agent -n 100 --no-pager`
4. Queue count: `wc -l /home/pi/dotwatch-pi-agent/data/offline_queue.jsonl`
5. Render backend logs

## Recommended Modbus test flow

1. Start with TCP if possible.
2. Test one register only.
3. Confirm value in Live page.
4. Enable more metrics gradually.
5. Only then switch agent source to Modbus and restart agent.
