#!/usr/bin/env python3
import argparse
import json
import platform
from datetime import datetime
from pathlib import Path

from config import settings
from runtime.offline_queue import OfflineQueue
from services.dotwatch_api import backend_health, post_ingest
from sensors.dummy_sensor import read_dummy_metrics


def check_file(path):
    p = Path(path)
    return {"path": str(p), "exists": p.exists(), "size": p.stat().st_size if p.exists() else 0}


def run_check(send_test=False):
    queue = OfflineQueue(settings.offline_queue_path, settings.offline_queue_max_items)
    checks = []

    def add(name, ok, detail=""):
        checks.append({"name": name, "ok": bool(ok), "detail": str(detail)})

    add("DOTWATCH_API_URL", bool(settings.api_url), settings.api_url or "missing")
    add("DEVICE_CODE", bool(settings.device_code), settings.device_code or "missing")
    add("DEVICE_SECRET", bool(settings.device_secret), settings.masked_device_secret)
    add("SEND_INTERVAL_SECONDS", settings.send_interval_seconds >= 1, settings.send_interval_seconds)
    add("SENSOR_SOURCE", settings.sensor_source in {"dummy", "modbus", "modbus_tcp", "modbus_rtu"}, settings.sensor_source)

    health = backend_health(settings)
    add("Backend health", bool(health.get("ok")), health.get("error") or health.get("status") or health)

    send_result = None
    if send_test:
        try:
            metrics = read_dummy_metrics()
            send_result = post_ingest(settings, metrics)
            add("Test ingest", True, "dummy metrics sent")
        except Exception as error:
            send_result = {"ok": False, "error": str(error)}
            add("Test ingest", False, str(error))

    return {
        "ok": all(item["ok"] for item in checks),
        "time": datetime.now().isoformat(timespec="seconds"),
        "platform": platform.platform(),
        "python": platform.python_version(),
        "settings": {
            "apiUrl": settings.api_url,
            "deviceCode": settings.device_code,
            "deviceSecret": settings.masked_device_secret,
            "sendIntervalSeconds": settings.send_interval_seconds,
            "requestTimeoutSeconds": settings.request_timeout_seconds,
            "firmwareVersion": settings.firmware_version,
            "sensorSource": settings.sensor_source,
            "modbusConfigPath": settings.modbus_config_path,
            "offlineQueueEnabled": settings.offline_queue_enabled,
            "offlineQueue": queue.describe(),
        },
        "files": {
            "env": check_file(Path(__file__).resolve().parent / ".env"),
            "modbusConfig": check_file(settings.modbus_config_path),
            "queue": check_file(settings.offline_queue_path),
        },
        "backendHealth": health,
        "sendTest": send_result,
        "checks": checks,
    }


def main():
    parser = argparse.ArgumentParser(description="dotWatch Pi Agent self check")
    parser.add_argument("--send-test", action="store_true", help="send one dummy ingest payload to backend")
    args = parser.parse_args()

    print(json.dumps(run_check(send_test=args.send_test), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
