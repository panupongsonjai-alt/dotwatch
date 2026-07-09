import base64
import binascii
import os
from pathlib import Path
from urllib.parse import urlparse

BASE_DIR = Path(__file__).resolve().parent
ENV_PATH = BASE_DIR / ".env"


TRUE_VALUES = {"1", "true", "yes", "y", "on", "enabled"}
FALSE_VALUES = {"0", "false", "no", "n", "off", "disabled"}


def load_env_file(path=ENV_PATH):
    if not path.exists():
        return

    for line in path.read_text(encoding="utf-8").splitlines():
        raw = line.strip()
        if not raw or raw.startswith("#") or "=" not in raw:
            continue

        key, value = raw.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")

        if key and key not in os.environ:
            os.environ[key] = value


def get_int(name, default, minimum=None, maximum=None):
    try:
        number = int(os.getenv(name, default))
    except Exception:
        number = int(default)

    if minimum is not None:
        number = max(int(minimum), number)
    if maximum is not None:
        number = min(int(maximum), number)
    return number


def get_bool(name, default=False):
    raw = str(os.getenv(name, "")).strip().lower()
    if raw in TRUE_VALUES:
        return True
    if raw in FALSE_VALUES:
        return False
    return bool(default)


def normalize_sensor_source(value):
    source = str(value or "dummy").strip().lower().replace("-", "_")
    if source in {"modbus", "modbus_tcp", "modbus_rtu"}:
        return source
    return "dummy"


def mask_secret(value):
    if not value:
        return "Not set"
    if len(value) <= 8:
        return "********"
    return f"{value[:4]}********{value[-4:]}"


def is_local_api_url(value):
    try:
        parsed = urlparse(str(value or ""))
    except Exception:
        return False
    host = (parsed.hostname or "").lower()
    return host in {"localhost", "127.0.0.1", "::1"} or host.startswith("192.168.") or host.startswith("10.")


def is_unsafe_secret(value):
    raw = str(value or "").strip().lower()
    if not raw:
        return True
    if len(raw) < 16:
        return True
    return raw in {
        "change-this",
        "change-this-device-secret",
        "device-secret",
        "secret",
        "password",
        "123456",
    }


load_env_file()


class Settings:
    api_url = os.getenv("DOTWATCH_API_URL", "https://dotwatch-backend.onrender.com").rstrip("/")
    allow_http_api = get_bool("ALLOW_HTTP_API", False)
    device_code = os.getenv("DEVICE_CODE", "").strip()
    device_secret = os.getenv("DEVICE_SECRET", "").strip()
    send_interval_seconds = get_int("SEND_INTERVAL_SECONDS", 10, minimum=1, maximum=3600)
    request_timeout_seconds = get_int("REQUEST_TIMEOUT_SECONDS", 15, minimum=3, maximum=120)
    firmware_version = os.getenv("FIRMWARE_VERSION", "rpi-agent-0.2.0").strip()
    sensor_source = normalize_sensor_source(os.getenv("SENSOR_SOURCE", "dummy"))
    modbus_config_path = os.getenv("MODBUS_CONFIG_PATH", str(BASE_DIR / "modbus_config.json"))

    offline_queue_enabled = get_bool("OFFLINE_QUEUE_ENABLED", True)
    offline_queue_path = os.getenv("OFFLINE_QUEUE_PATH", str(BASE_DIR / "data" / "offline_queue.jsonl"))
    offline_queue_max_items = get_int("OFFLINE_QUEUE_MAX_ITEMS", 1000, minimum=0, maximum=100000)
    queue_flush_limit = get_int("QUEUE_FLUSH_LIMIT", 20, minimum=1, maximum=500)
    max_backoff_seconds = get_int("MAX_BACKOFF_SECONDS", 60, minimum=1, maximum=3600)

    log_metrics = get_bool("LOG_METRICS", True)

    @property
    def is_modbus(self):
        return self.sensor_source.startswith("modbus")

    @property
    def masked_device_secret(self):
        return mask_secret(self.device_secret)

    def safe_summary(self):
        return {
            "apiUrl": self.api_url,
            "allowHttpApi": self.allow_http_api,
            "deviceCode": self.device_code or "Not set",
            "deviceSecret": self.masked_device_secret,
            "sendIntervalSeconds": self.send_interval_seconds,
            "requestTimeoutSeconds": self.request_timeout_seconds,
            "firmwareVersion": self.firmware_version,
            "sensorSource": self.sensor_source,
            "modbusConfigPath": self.modbus_config_path,
            "offlineQueueEnabled": self.offline_queue_enabled,
            "offlineQueuePath": self.offline_queue_path,
            "offlineQueueMaxItems": self.offline_queue_max_items,
            "maxBackoffSeconds": self.max_backoff_seconds,
            "logMetrics": self.log_metrics,
        }

    def validate(self):
        missing = []
        if not self.api_url:
            missing.append("DOTWATCH_API_URL")
        if not self.device_code:
            missing.append("DEVICE_CODE")
        if not self.device_secret:
            missing.append("DEVICE_SECRET")
        if missing:
            raise RuntimeError("Missing required setting(s): " + ", ".join(missing))

        parsed = urlparse(self.api_url)
        if parsed.scheme not in {"http", "https"}:
            raise RuntimeError("DOTWATCH_API_URL must start with https:// or http://")

        if parsed.scheme == "http" and not self.allow_http_api and not is_local_api_url(self.api_url):
            raise RuntimeError("Refusing non-local HTTP DOTWATCH_API_URL. Use HTTPS or set ALLOW_HTTP_API=true only for a trusted lab network.")

        if is_unsafe_secret(self.device_secret):
            raise RuntimeError("DEVICE_SECRET is missing, too short, or still a default placeholder")

        if self.is_modbus and not Path(self.modbus_config_path).exists():
            raise RuntimeError(f"Modbus config file not found: {self.modbus_config_path}")


settings = Settings()
