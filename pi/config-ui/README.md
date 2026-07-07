# dotWatch Pi Config UI V8 / Phase 2

Local web UI for Raspberry Pi Gateway.

Default URL after install:

```text
http://<PI_IP>:8080
```

Default login:

```text
Username: admin
Password: change-this-config-password
```

Pages:

- Setup: Backend URL, Device Code/Secret, sensor source, queue/retry behavior, UI password
- Live: Modbus TCP/RTU setup, 20 metric mapping, read-once and continuous live preview
- Status: service status, system health, offline queue count, recent agent logs
- Diagnostics: backend health, USB/RS485 scan, last Modbus test, dependency install

Supported `SENSOR_SOURCE` values:

```text
dummy
modbus
modbus_tcp
modbus_rtu
```

Recommended flow:

1. Start with `SENSOR_SOURCE=dummy`.
2. Confirm Dashboard receives `metric_1`, `metric_2`, `metric_3`.
3. Open Live page and configure Modbus.
4. Use Read Once / Start to verify values.
5. Switch Agent Source to `Modbus`, `Force Modbus TCP`, or `Force Modbus RTU`.
6. Save and restart Agent.
7. Check Status page for queue count and logs.
