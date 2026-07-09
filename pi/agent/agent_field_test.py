#!/usr/bin/env python3
"""dotWatch Raspberry Pi Agent field test tool.

Purpose:
- Validate the current .env/device configuration without exposing secrets.
- Read real configured sensor metrics (dummy/modbus_tcp/modbus_rtu).
- Optionally send a small number of ingest payloads to the backend.
- Optionally test the offline queue append/flush behavior.

This script is safe to run manually over SSH before enabling the systemd agent.
"""

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from config import settings
from main import format_metrics, read_metrics, utc_now_iso, flush_offline_queue
from runtime.offline_queue import OfflineQueue
from services.dotwatch_api import backend_health, build_ingest_payload, post_ingest_payload


def now_text():
    return datetime.now().isoformat(timespec="seconds")


def clean_error(error):
    text = str(error)
    secret = getattr(settings, "device_secret", "") or ""
    if secret:
        text = text.replace(secret, "********")
    return text


def add_result(results, name, ok, detail=None):
    item = {"name": name, "ok": bool(ok)}
    if detail not in (None, ""):
        item["detail"] = detail
    results.append(item)
    return item


def read_once():
    metrics, warnings = read_metrics()
    payload = build_ingest_payload(settings, metrics, timestamp=utc_now_iso())
    return metrics, warnings, payload


def run_field_test(cycles=3, send=False, interval_seconds=3, queue_test=False):
    results = []
    events = []
    queue = OfflineQueue(settings.offline_queue_path, settings.offline_queue_max_items)

    try:
        settings.validate()
        add_result(results, "Required settings", True, "DEVICE_CODE/DOTWATCH_API_URL/DEVICE_SECRET present")
    except Exception as error:
        add_result(results, "Required settings", False, clean_error(error))
        return {
            "ok": False,
            "time": now_text(),
            "settings": settings.safe_summary(),
            "queue": queue.describe(),
            "results": results,
            "events": events,
        }

    health = backend_health(settings)
    add_result(results, "Backend health", bool(health.get("ok")), health.get("error") or health.get("status") or health)

    cycle_count = max(1, int(cycles or 1))
    delay = max(0, float(interval_seconds or 0))

    for index in range(cycle_count):
        event = {"cycle": index + 1, "time": now_text()}
        try:
            metrics, warnings, payload = read_once()
            event["metrics"] = metrics
            event["metricText"] = format_metrics(metrics)
            if warnings:
                event["warnings"] = warnings

            if send:
                response = post_ingest_payload(settings, payload)
                event["sent"] = True
                event["responseStatus"] = response.get("status")
                event["requestId"] = response.get("requestId") or response.get("id")
            else:
                event["sent"] = False

            event["ok"] = True
        except Exception as error:
            event["ok"] = False
            event["error"] = clean_error(error)

        events.append(event)

        if index < cycle_count - 1 and delay > 0:
            time.sleep(delay)

    read_ok_count = sum(1 for event in events if event.get("ok"))
    send_ok_count = sum(1 for event in events if event.get("sent") and event.get("ok"))
    add_result(results, "Sensor read", read_ok_count == cycle_count, f"{read_ok_count}/{cycle_count} cycles ok")
    if send:
        add_result(results, "Backend ingest", send_ok_count == cycle_count, f"{send_ok_count}/{cycle_count} cycles sent")

    queue_event = None
    if queue_test:
        queue_event = {"time": now_text()}
        try:
            metrics, warnings, payload = read_once()
            pending = queue.append(payload)
            queue_event["appendPending"] = pending
            flush = flush_offline_queue(queue)
            queue_event["flush"] = flush
            add_result(results, "Offline queue", flush.get("sent") == 1, flush)
        except Exception as error:
            queue_event["error"] = clean_error(error)
            add_result(results, "Offline queue", False, queue_event["error"])

    return {
        "ok": all(item["ok"] for item in results),
        "time": now_text(),
        "sendEnabled": bool(send),
        "cycles": cycle_count,
        "settings": settings.safe_summary(),
        "backendHealth": health,
        "queue": queue.describe(),
        "queueTest": queue_event,
        "results": results,
        "events": events,
    }


def print_human(report):
    print("dotWatch Pi Agent field test")
    print(f"Time        : {report.get('time')}")
    summary = report.get("settings", {})
    print(f"API URL     : {summary.get('apiUrl')}")
    print(f"Device Code : {summary.get('deviceCode')}")
    print(f"Secret      : {summary.get('deviceSecret')}")
    print(f"Sensor      : {summary.get('sensorSource')}")
    print(f"Send mode   : {'enabled' if report.get('sendEnabled') else 'dry-run'}")
    print("")

    for result in report.get("results", []):
        status = "OK" if result.get("ok") else "FAIL"
        detail = result.get("detail", "")
        print(f"[{status}] {result.get('name')}: {detail}")

    print("")
    for event in report.get("events", []):
        status = "OK" if event.get("ok") else "FAIL"
        text = event.get("metricText") or event.get("error") or ""
        sent = "sent" if event.get("sent") else "not-sent"
        ref = event.get("requestId") or "-"
        print(f"Cycle {event.get('cycle')}: {status} {sent} ref={ref} {text}")
        if event.get("warnings"):
            print(f"  warnings: {event.get('warnings')}")

    queue = report.get("queue") or {}
    print("")
    print(f"Offline queue: count={queue.get('count')} path={queue.get('path')}")
    print(f"Overall: {'PASS' if report.get('ok') else 'FAIL'}")


def write_report(report, output_path):
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def main():
    parser = argparse.ArgumentParser(description="dotWatch Raspberry Pi field commissioning test")
    parser.add_argument("--cycles", type=int, default=3, help="number of sensor read cycles")
    parser.add_argument("--interval", type=float, default=3, help="seconds between cycles")
    parser.add_argument("--send", action="store_true", help="send each payload to DOTWATCH_API_URL /api/ingest")
    parser.add_argument("--queue-test", action="store_true", help="append one payload to offline queue and flush one item")
    parser.add_argument("--json", action="store_true", help="print JSON instead of human-readable output")
    parser.add_argument("--output", default="", help="write JSON report to this path")
    args = parser.parse_args()

    report = run_field_test(
        cycles=args.cycles,
        send=args.send,
        interval_seconds=args.interval,
        queue_test=args.queue_test,
    )

    if args.output:
        path = write_report(report, args.output)
        report["outputPath"] = str(path)

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print_human(report)
        if args.output:
            print(f"Report saved: {args.output}")

    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
