import signal
import sys
import time
from datetime import datetime, timezone

from config import settings
from runtime.offline_queue import OfflineQueue
from services.dotwatch_api import (
    build_ingest_payload,
    post_ingest_batch_payload,
    post_ingest_payload,
)
from sensors.dummy_sensor import read_dummy_metrics

RUNNING = True


def now_text():
    return datetime.now().isoformat(timespec="seconds")


def utc_now_iso():
    return datetime.now(timezone.utc).isoformat()


def handle_stop(signum, frame):
    global RUNNING
    RUNNING = False
    print(f"[{now_text()}] Stop signal received. Shutting down after current cycle...", flush=True)


def metric_sort_key(item):
    key = str(item[0])
    if key.startswith("metric_"):
        try:
            return (0, int(key.split("_", 1)[1]))
        except Exception:
            pass
    return (1, key)


def format_metrics(metrics):
    parts = []
    for key, value in sorted(metrics.items(), key=metric_sort_key):
        if isinstance(value, float):
            parts.append(f"{key}={value:.4g}")
        else:
            parts.append(f"{key}={value}")
    return " ".join(parts)


def normalize_metrics_result(result):
    """Accept either a metrics dict or (metrics, errors) from a sensor reader."""
    errors = {}

    if isinstance(result, tuple):
        metrics = result[0] if len(result) > 0 else {}
        errors = result[1] if len(result) > 1 and isinstance(result[1], dict) else {}
    else:
        metrics = result

    if not isinstance(metrics, dict):
        raise RuntimeError(f"Sensor returned invalid metrics type: {type(metrics).__name__}")

    clean_metrics = {}
    for key, value in metrics.items():
        metric_key = str(key).strip()
        if not metric_key:
            continue
        try:
            number_value = float(value)
        except Exception:
            continue
        if number_value == number_value and number_value not in (float("inf"), float("-inf")):
            clean_metrics[metric_key] = number_value

    if not clean_metrics:
        raise RuntimeError("No valid metrics returned from sensor")

    return clean_metrics, errors


def read_metrics():
    if settings.is_modbus:
        from sensors.modbus_sensor import read_modbus_metrics

        return normalize_metrics_result(read_modbus_metrics(settings.modbus_config_path))

    return normalize_metrics_result(read_dummy_metrics())


def flush_offline_queue(queue):
    if not settings.offline_queue_enabled:
        return {"sent": 0, "remaining": 0, "error": None}

    items = queue.load()
    if not items:
        return {"sent": 0, "remaining": 0, "error": None}

    sent = 0
    remaining = list(items)
    first_error = None

    if settings.queue_flush_batch_enabled and settings.queue_flush_limit > 1:
        batch = remaining[: settings.queue_flush_limit]
        try:
            post_ingest_batch_payload(settings, batch)
            sent = len(batch)
            remaining = remaining[sent:]
            queue.write(remaining)
        except Exception as error:
            first_error = str(error)
        return {"sent": sent, "remaining": len(remaining), "error": first_error}

    while remaining and sent < settings.queue_flush_limit and RUNNING:
        item = remaining[0]
        try:
            post_ingest_payload(settings, item)
        except Exception as error:
            first_error = str(error)
            break

        sent += 1
        remaining.pop(0)
        queue.write(remaining)

    return {"sent": sent, "remaining": len(remaining), "error": first_error}


def sleep_interruptible(seconds):
    deadline = time.time() + max(0, float(seconds))
    while RUNNING and time.time() < deadline:
        time.sleep(min(0.5, max(0, deadline - time.time())))


def startup_banner(queue):
    print("dotWatch Raspberry Pi Agent started", flush=True)
    print(f"API URL: {settings.api_url}", flush=True)
    print(f"Device Code: {settings.device_code or 'Not set'}", flush=True)
    print(f"Device Secret: {settings.masked_device_secret}", flush=True)
    print(f"Send interval: {settings.send_interval_seconds}s", flush=True)
    print(f"Request timeout: {settings.request_timeout_seconds}s", flush=True)
    print(f"Sensor source: {settings.sensor_source}", flush=True)
    print(f"Modbus config: {settings.modbus_config_path}", flush=True)
    print(
        f"Offline queue: {'enabled' if settings.offline_queue_enabled else 'disabled'} "
        f"({settings.offline_queue_path}, pending={queue.size()})",
        flush=True,
    )
    print("Press Ctrl+C to stop manual run", flush=True)


def main():
    signal.signal(signal.SIGTERM, handle_stop)
    signal.signal(signal.SIGINT, handle_stop)

    queue = OfflineQueue(settings.offline_queue_path, settings.offline_queue_max_items)
    startup_banner(queue)

    consecutive_errors = 0

    while RUNNING:
        payload = None
        try:
            settings.validate()

            flush_result = flush_offline_queue(queue)
            if flush_result["sent"]:
                consecutive_errors = 0
                print(
                    f"[{now_text()}] QUEUE_FLUSHED sent={flush_result['sent']} "
                    f"remaining={flush_result['remaining']}",
                    flush=True,
                )

            if flush_result["error"]:
                print(f"[{now_text()}] QUEUE_WAIT error={flush_result['error']}", flush=True)

            # Important:
            # If an offline queue item was sent in this cycle, do not send a new live payload
            # immediately afterwards. The backend enforces per-device pacing, so sending
            # queue + live payload in the same loop can trigger HTTP 429.
            #
            # If queue flushing hit an error, also pause and retry later instead of sending
            # a new live payload that would keep the queue from draining.
            if flush_result["sent"] or flush_result["error"]:
                sleep_interruptible(settings.send_interval_seconds)
                continue

            metrics, read_errors = read_metrics()
            payload = build_ingest_payload(settings, metrics, timestamp=utc_now_iso())
            result = post_ingest_payload(settings, payload)

            consecutive_errors = 0
            if settings.log_metrics:
                print(f"[{now_text()}] SENT {format_metrics(metrics)}", flush=True)
            else:
                print(f"[{now_text()}] SENT metric_count={len(metrics)}", flush=True)

            if read_errors:
                print(f"[{now_text()}] READ_WARNINGS {read_errors}", flush=True)

            request_id = result.get("requestId") or result.get("id") or "-"
            print(f"[{now_text()}] SERVER_OK status={result.get('status', 200)} ref={request_id}", flush=True)

        except KeyboardInterrupt:
            break
        except Exception as error:
            consecutive_errors += 1
            error_text = str(error)

            try:
                if settings.offline_queue_enabled and payload is not None:
                    pending = queue.append(payload)
                    print(f"[{now_text()}] QUEUED pending={pending} reason={error_text}", flush=True)
                else:
                    print(f"[{now_text()}] ERROR {error_text}", flush=True)
            except Exception as queue_error:
                print(f"[{now_text()}] ERROR {error_text}; queue_error={queue_error}", flush=True)

            backoff = min(settings.max_backoff_seconds, settings.send_interval_seconds * min(consecutive_errors, 6))
            print(f"[{now_text()}] RETRY_AFTER {backoff}s", flush=True)
            sleep_interruptible(backoff)
            continue

        sleep_interruptible(settings.send_interval_seconds)

    print(f"[{now_text()}] dotWatch Raspberry Pi Agent stopped", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
