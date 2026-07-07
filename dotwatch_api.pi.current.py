import json
from datetime import datetime, timezone
import urllib.error
import urllib.request


def utc_now_iso():
    return datetime.now(timezone.utc).isoformat()


def request_json(url, *, method="GET", payload=None, headers=None, timeout=15):
    body = None
    request_headers = {
        "Accept": "application/json",
        **(headers or {}),
    }

    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request_headers["Content-Type"] = "application/json"

    request = urllib.request.Request(
        url,
        data=body,
        headers=request_headers,
        method=method,
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            text = response.read().decode("utf-8")
            if not text:
                return {"ok": True, "status": response.status}
            try:
                data = json.loads(text)
            except Exception:
                data = {"ok": True, "raw": text}
            data.setdefault("status", response.status)
            return data

    except urllib.error.HTTPError as error:
        text = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {error.code}: {text}") from error

    except urllib.error.URLError as error:
        raise RuntimeError(f"Network error: {error.reason}") from error


def build_ingest_payload(settings, metrics, timestamp=None, firmware_version=None):
    if not isinstance(metrics, dict) or not metrics:
        raise RuntimeError("metrics must be a non-empty dictionary")

    return {
        "firmwareVersion": firmware_version or settings.firmware_version,
        "timestamp": timestamp or utc_now_iso(),
        "metrics": metrics,
    }


def post_ingest_payload(settings, payload):
    if not settings.api_url:
        raise RuntimeError("DOTWATCH_API_URL is missing")

    if not settings.device_code:
        raise RuntimeError("DEVICE_CODE is missing")

    if not settings.device_secret:
        raise RuntimeError("DEVICE_SECRET is missing")

    url = f"{settings.api_url.rstrip('/')}/api/ingest"

    return request_json(
        url,
        method="POST",
        payload=payload,
        timeout=getattr(settings, "request_timeout_seconds", 15),
        headers={
            "User-Agent": f"dotwatch-pi-agent/{settings.firmware_version}",
            "x-device-code": settings.device_code,
            "x-device-secret": settings.device_secret,
        },
    )


def post_ingest(settings, metrics, timestamp=None, firmware_version=None):
    payload = build_ingest_payload(
        settings,
        metrics,
        timestamp=timestamp,
        firmware_version=firmware_version,
    )
    return post_ingest_payload(settings, payload)


def backend_health(settings):
    if not settings.api_url:
        return {"ok": False, "error": "DOTWATCH_API_URL is missing"}

    started = datetime.now(timezone.utc)
    try:
        data = request_json(
            f"{settings.api_url.rstrip('/')}/health/live",
            method="GET",
            timeout=getattr(settings, "request_timeout_seconds", 15),
            headers={"User-Agent": f"dotwatch-pi-agent/{settings.firmware_version}"},
        )
        elapsed = datetime.now(timezone.utc) - started
        data["latencyMsFromPi"] = round(elapsed.total_seconds() * 1000)
        return data
    except Exception as error:
        return {"ok": False, "error": str(error)}
