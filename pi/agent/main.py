import signal
import sys
import time
from datetime import datetime, timezone

from config import settings
from runtime.offline_queue import OfflineQueue
from services.dotwatch_api import (
    BATCH_MAX_READINGS,
    HttpStatusError,
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
        raise RuntimeError(f"Sensor returned invalid values type: {type(metrics).__name__}")

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
        raise RuntimeError("No valid values returned from sensor")

    return clean_metrics, errors


def read_metrics():
    if settings.is_modbus:
        from sensors.modbus_sensor import read_modbus_metrics

        return normalize_metrics_result(read_modbus_metrics(settings.modbus_config_path))

    return normalize_metrics_result(read_dummy_metrics())


def get_flush_limit():
    # One slot of the batch is reserved for the live reading.
    return max(1, min(int(settings.queue_flush_limit), BATCH_MAX_READINGS - 1))


# The backend rejects readings older than 7 days or more than 5 minutes in the
# future (HTTP 400). Such an item would block the queue forever, so it is
# dropped before sending (with a margin so nothing near the limit is sent).
MAX_QUEUED_AGE_SECONDS = 7 * 24 * 3600 - 3600
MAX_FUTURE_SECONDS = 4 * 60
REJECTED_STATUS_CODES = {400, 413, 422}


def is_sendable(item, now=None):
    now = now or datetime.now(timezone.utc)
    try:
        timestamp = datetime.fromisoformat(str(item.get("timestamp")).replace("Z", "+00:00"))
    except Exception:
        return False
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    age_seconds = (now - timestamp).total_seconds()
    return -MAX_FUTURE_SECONDS <= age_seconds <= MAX_QUEUED_AGE_SECONDS


def send_items_individually(items):
    """Isolate rejected items after a batch was refused (HTTP 400/413/422).

    Each item goes in its own one-reading batch (the batch route has no
    per-request pacing). Items the backend rejects are dropped; a network or
    server error stops the loop so the rest is retried next cycle.
    Returns (processed_count, dropped_count, error).
    """
    processed = 0
    dropped = 0
    for item in items:
        try:
            post_ingest_batch_payload(settings, [item])
        except HttpStatusError as error:
            if error.status not in REJECTED_STATUS_CODES:
                return processed, dropped, str(error)
            dropped += 1
        except Exception as error:
            return processed, dropped, str(error)
        processed += 1
    return processed, dropped, None


def flush_offline_queue(queue, live_payload=None):
    """Send queued readings (and the live reading) via /api/ingest/batch.

    Previously one queued item was sent per loop cycle and the live reading
    was skipped while the queue drained, so after a 1-hour outage the gateway
    spent another hour replaying old data. Now each cycle sends up to
    QUEUE_FLUSH_LIMIT queued items in one request.

    Ordering: the backend records history in time order per device, so while
    the backlog is larger than one batch the live reading is appended to the
    queue (sent after the older items). Once the remaining backlog fits in one
    batch it is sent together with the live reading.
    """
    flush_limit = get_flush_limit()
    window = []
    live_queued = False

    if settings.offline_queue_enabled:
        window = queue.peek(flush_limit + 1)

        if len(window) > flush_limit:
            window = window[:flush_limit]
            if live_payload is not None:
                queue.append(live_payload)
                live_payload = None
                live_queued = True

    queued = [item for item in window if is_sendable(item)]
    stale_dropped = len(window) - len(queued)

    def result_dict(sent, remaining, error=None, result=None, dropped=0):
        return {
            "sent": sent,
            "remaining": remaining,
            "error": error,
            "result": result,
            "live_queued": live_queued,
            "dropped": dropped,
        }

    if not queued and live_payload is None:
        remaining = queue.drop_first(len(window)) if window else 0
        return result_dict(0, remaining, dropped=stale_dropped)

    batch = list(queued)
    if live_payload is not None:
        batch.append(live_payload)

    try:
        if len(batch) == 1 and live_payload is not None:
            result = post_ingest_payload(settings, live_payload)
        else:
            result = post_ingest_batch_payload(settings, batch)
    except HttpStatusError as error:
        if error.status not in REJECTED_STATUS_CODES or not queued:
            return result_dict(0, queue.size(), error=str(error))

        processed, dropped, item_error = send_items_individually(queued)
        if item_error is not None:
            # Remove what was already handled; keep the rest for next cycle.
            handled = window[: window.index(queued[processed - 1]) + 1] if processed else []
            remaining = queue.drop_first(len(handled)) if handled else queue.size()
            return result_dict(processed - dropped, remaining, error=item_error, dropped=dropped + stale_dropped)

        remaining = queue.drop_first(len(window))
        if live_payload is None:
            return result_dict(processed - dropped, remaining, dropped=dropped + stale_dropped)

        try:
            result = post_ingest_batch_payload(settings, [live_payload])
        except Exception as live_error:
            return result_dict(processed - dropped, remaining, error=str(live_error), dropped=dropped + stale_dropped)
        return result_dict(processed - dropped, remaining, result=result, dropped=dropped + stale_dropped)
    except Exception as error:
        return result_dict(
            0,
            queue.size() if settings.offline_queue_enabled else 0,
            error=str(error),
        )

    remaining = queue.drop_first(len(window)) if window else queue.size()

    return result_dict(len(queued), remaining, result=result, dropped=stale_dropped)


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

            metrics, read_errors = read_metrics()
            payload = build_ingest_payload(settings, metrics, timestamp=utc_now_iso())

            flush_result = flush_offline_queue(queue, live_payload=payload)
            if flush_result["live_queued"]:
                # Already stored in the queue; do not queue it twice on error.
                payload = None
            if flush_result["error"]:
                raise RuntimeError(flush_result["error"])

            result = flush_result["result"] or {}
            consecutive_errors = 0

            if flush_result["sent"] or flush_result.get("dropped"):
                print(
                    f"[{now_text()}] QUEUE_FLUSHED sent={flush_result['sent']} "
                    f"dropped={flush_result.get('dropped', 0)} "
                    f"remaining={flush_result['remaining']}",
                    flush=True,
                )

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
