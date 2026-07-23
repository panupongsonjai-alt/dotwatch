#!/usr/bin/env python3
"""dotWatch Raspberry Pi Config UI

A dependency-free local web UI for setting up and operating the dotWatch Pi Agent.
Designed to run on Raspberry Pi with Python standard library only.
"""

import base64
import hmac
import html
import json
import os
import platform
import shutil
import socket
import subprocess
import time
import urllib.error
import urllib.request
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

APP_VERSION = "1.2.2-phase2-security"

PROJECT_DIR = Path(os.getenv("DOTWATCH_AGENT_DIR", "/home/pi/dotwatch-pi-agent"))
ENV_PATH = PROJECT_DIR / ".env"
MODBUS_CONFIG_PATH = PROJECT_DIR / "modbus_config.json"
LAST_TEST_PATH = PROJECT_DIR / "modbus_last_test_result.json"
HOST = os.getenv("DOTWATCH_CONFIG_HOST", "127.0.0.1")
PORT = int(os.getenv("DOTWATCH_CONFIG_PORT", "8080"))

DEFAULTS = {
    "DOTWATCH_API_URL": "https://dotwatch-backend.onrender.com",
    "DEVICE_CODE": "",
    "DEVICE_SECRET": "",
    "SEND_INTERVAL_SECONDS": "20",
    "REQUEST_TIMEOUT_SECONDS": "15",
    "FIRMWARE_VERSION": "rpi-agent-0.2.0",
    "SENSOR_SOURCE": "dummy",
    "MODBUS_CONFIG_PATH": str(MODBUS_CONFIG_PATH),
    "OFFLINE_QUEUE_ENABLED": "true",
    "OFFLINE_QUEUE_PATH": str(PROJECT_DIR / "data" / "offline_queue.jsonl"),
    "OFFLINE_QUEUE_MAX_ITEMS": "1000",
    "QUEUE_FLUSH_LIMIT": "1",
    "MAX_BACKOFF_SECONDS": "60",
    "LOG_METRICS": "true",
    "CONFIG_UI_USERNAME": "admin",
    "CONFIG_UI_PASSWORD": "",
}

ENV_KEYS = [
    "DOTWATCH_API_URL",
    "DEVICE_CODE",
    "DEVICE_SECRET",
    "SEND_INTERVAL_SECONDS",
    "REQUEST_TIMEOUT_SECONDS",
    "FIRMWARE_VERSION",
    "SENSOR_SOURCE",
    "MODBUS_CONFIG_PATH",
    "OFFLINE_QUEUE_ENABLED",
    "OFFLINE_QUEUE_PATH",
    "OFFLINE_QUEUE_MAX_ITEMS",
    "QUEUE_FLUSH_LIMIT",
    "MAX_BACKOFF_SECONDS",
    "LOG_METRICS",
    "CONFIG_UI_USERNAME",
    "CONFIG_UI_PASSWORD",
]


def esc(value):
    return html.escape(str(value if value is not None else ""), quote=True)


def selected(current, value):
    return "selected" if str(current or "") == str(value) else ""


def checked(value):
    return "checked" if bool(value) else ""


UNSAFE_CONFIG_UI_PASSWORDS = {
    "",
    "admin",
    "password",
    "123456",
    "12345678",
    "change-this-config-password",
    "change-this",
}


def is_loopback_host(host):
    value = str(host or "").strip().lower()
    return value in ("127.0.0.1", "localhost", "::1")


def is_lan_exposed_host(host):
    value = str(host or "").strip().lower()
    return value in ("", "0.0.0.0", "::") or value.startswith("192.168.") or value.startswith("10.") or value.startswith("172.")


def is_unsafe_config_ui_password(password):
    value = str(password or "").strip()
    return len(value) < 12 or value.lower() in UNSAFE_CONFIG_UI_PASSWORDS


def security_notice():
    cfg = read_env()
    password = cfg.get("CONFIG_UI_PASSWORD", "")
    if is_unsafe_config_ui_password(password):
        return "Config UI password is missing/weak. Run install_config_ui_service.sh again or set CONFIG_UI_PASSWORD in .env."
    if is_lan_exposed_host(HOST):
        return "Config UI is exposed on the LAN. Keep this only for trusted local networks and use a strong password."
    return "Config UI is bound to localhost by default. Use SSH tunnel for safer access."


def validate_config_ui_runtime_security():
    cfg = read_env()
    password = cfg.get("CONFIG_UI_PASSWORD", "")
    if is_lan_exposed_host(HOST) and is_unsafe_config_ui_password(password):
        raise RuntimeError(
            "Unsafe Pi Config UI configuration: LAN exposure requires CONFIG_UI_PASSWORD with at least 12 characters and not the default value. "
            "Use install_config_ui_service.sh --password '<strong-password>' or keep DOTWATCH_CONFIG_HOST=127.0.0.1."
        )


def read_env(path=ENV_PATH):
    data = DEFAULTS.copy()
    if not path.exists():
        return data

    for line in path.read_text(encoding="utf-8").splitlines():
        raw = line.strip()
        if not raw or raw.startswith("#") or "=" not in raw:
            continue
        key, value = raw.split("=", 1)
        data[key.strip()] = value.strip().strip('"').strip("'")
    return data


def write_env(values, path=ENV_PATH):
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# dotWatch Raspberry Pi Agent settings",
        f"# Updated at {datetime.now().isoformat(timespec='seconds')}",
        "",
    ]
    for key in ENV_KEYS:
        lines.append(f"{key}={str(values.get(key, DEFAULTS.get(key, ''))).strip()}")
    lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")
    try:
        os.chmod(path, 0o600)
    except Exception:
        pass


def default_register(index):
    defaults = [
        ("Voltage", "V", "holding", 0, "uint16", 1, 1, 0, 2),
        ("Current", "A", "holding", 1, "uint16", 1, 1, 0, 2),
        ("Active Power", "W", "holding", 2, "uint16", 1, 1, 0, 2),
        ("Energy", "kWh", "holding", 3, "uint16", 1, 1, 0, 2),
        ("Frequency", "Hz", "holding", 4, "uint16", 1, 1, 0, 2),
        ("Power Factor", "PF", "holding", 5, "uint16", 1, 1, 0, 2),
    ]
    if index < len(defaults):
        name, unit, function, address, data_type, count, scale, offset, round_value = defaults[index]
    else:
        name, unit, function, address, data_type, count, scale, offset, round_value = (
            f"Value {index + 1}",
            "",
            "holding",
            index,
            "uint16",
            1,
            1,
            0,
            2,
        )

    return {
        "enabled": index == 0,
        "metric_key": f"metric_{index + 1}",
        "name": name,
        "unit": unit,
        "function": function,
        "address": address,
        "data_type": data_type,
        "count": count,
        "scale": scale,
        "offset": offset,
        "round": round_value,
        "unit_id": 1,
        "byte_order": "big",
        "word_order": "big",
    }


def default_modbus_config():
    return {
        "enabled": True,
        "mode": "tcp",
        "unit_id": 1,
        "poll_interval_ms": 3000,
        "tcp": {"host": "192.168.1.50", "port": 502, "timeout": 3},
        "rtu": {"port": "/dev/ttyUSB0", "baudrate": 9600, "parity": "N", "stopbits": 1, "bytesize": 8, "timeout": 3},
        "registers": [default_register(i) for i in range(20)],
    }


def read_modbus_config():
    base = default_modbus_config()
    if not MODBUS_CONFIG_PATH.exists():
        return base

    try:
        data = json.loads(MODBUS_CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        return base

    cfg = {**base, **data}
    cfg["tcp"] = {**base["tcp"], **data.get("tcp", {})}
    cfg["rtu"] = {**base["rtu"], **data.get("rtu", {})}

    registers = data.get("registers", [])
    normalized = []
    for i in range(20):
        item = default_register(i)
        if i < len(registers) and isinstance(registers[i], dict):
            item.update(registers[i])
        item["metric_key"] = f"metric_{i + 1}"
        normalized.append(item)
    cfg["registers"] = normalized

    try:
        cfg["poll_interval_ms"] = int(cfg.get("poll_interval_ms", 3000) or 3000)
    except Exception:
        cfg["poll_interval_ms"] = 3000

    return cfg


def write_modbus_config(config):
    MODBUS_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    MODBUS_CONFIG_PATH.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")


def run_cmd(args, timeout=12, cwd=None):
    try:
        result = subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=timeout, check=False)
        output = (result.stdout or result.stderr or "").strip()
        return {"ok": result.returncode == 0, "output": output, "code": result.returncode}
    except Exception as error:
        return {"ok": False, "output": str(error), "code": -1}


def get_service_status(service):
    active = run_cmd(["systemctl", "is-active", service], timeout=5)
    enabled = run_cmd(["systemctl", "is-enabled", service], timeout=5)
    return {"active": active["output"] or "unknown", "enabled": enabled["output"] or "unknown"}


def get_primary_ip():
    route = run_cmd(["sh", "-lc", "ip route get 1.1.1.1 | awk '{print $7; exit}'"], timeout=5)["output"]
    if route and route != "unknown":
        return route.strip()

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
        sock.close()
        return ip
    except Exception:
        return "N/A"


def get_all_ips():
    output = run_cmd(["sh", "-lc", "hostname -I 2>/dev/null || true"], timeout=5)["output"]
    ips = [item for item in str(output or "").split() if item and ":" not in item]
    if ips:
        return " / ".join(ips)
    return get_primary_ip()


def parse_percent(value):
    try:
        return value.strip().replace("%", "")
    except Exception:
        return ""


def count_queue_items(path):
    try:
        queue_path = Path(path)
        if not queue_path.exists():
            return 0
        return sum(1 for line in queue_path.read_text(encoding="utf-8", errors="ignore").splitlines() if line.strip())
    except Exception:
        return 0


def system_status():
    env = read_env()
    modbus = read_modbus_config()
    queue_path = env.get("OFFLINE_QUEUE_PATH") or str(PROJECT_DIR / "data" / "offline_queue.jsonl")
    disk = run_cmd(["sh", "-lc", "df -h / | awk 'NR==2{print $3 \" / \" $2 \" (\" $5 \" used)\"}'"], timeout=5)["output"]
    memory = run_cmd(["sh", "-lc", "free -m | awk '/Mem:/ {print $3 \" / \" $2 \" MB\"}'"], timeout=5)["output"]
    load = run_cmd(["sh", "-lc", "uptime | sed 's/^.*load average: //'"], timeout=5)["output"]
    temp = run_cmd(["sh", "-lc", "command -v vcgencmd >/dev/null 2>&1 && vcgencmd measure_temp | cut -d= -f2 || echo N/A"], timeout=5)["output"]

    return {
        "primary_ip": get_primary_ip(),
        "all_ips": get_all_ips(),
        "agent": get_service_status("dotwatch-pi-agent"),
        "config_ui": get_service_status("dotwatch-pi-config-ui"),
        "platform": platform.platform(),
        "python": platform.python_version(),
        "disk": disk or "N/A",
        "memory": memory or "N/A",
        "load": load or "N/A",
        "temperature": temp or "N/A",
        "agent_dir": str(PROJECT_DIR),
        "env_path": str(ENV_PATH),
        "modbus_path": str(MODBUS_CONFIG_PATH),
        "api_url": env.get("DOTWATCH_API_URL", ""),
        "device_code": env.get("DEVICE_CODE", ""),
        "sensor_source": env.get("SENSOR_SOURCE", "dummy"),
        "send_interval": env.get("SEND_INTERVAL_SECONDS", ""),
        "request_timeout": env.get("REQUEST_TIMEOUT_SECONDS", ""),
        "modbus_mode": modbus.get("mode", "tcp"),
        "enabled_metrics": sum(1 for item in modbus.get("registers", []) if item.get("enabled")),
        "offline_queue_enabled": env.get("OFFLINE_QUEUE_ENABLED", "true"),
        "offline_queue_path": queue_path,
        "offline_queue_count": count_queue_items(queue_path),
    }


def status_badge(value):
    v = str(value or "unknown").lower().replace("/", " ").replace("-", " ")
    words = set(v.split())
    if words.intersection({"inactive", "failed", "offline", "error", "disabled", "missing"}):
        cls = "bad"
    elif words.intersection({"active", "online", "ok", "connected", "enabled", "success", "running"}):
        cls = "ok"
    else:
        cls = "warn"
    return f'<span class="badge {cls}"><span></span>{esc(value or "unknown")}</span>'


def mask_secret(value):
    if not value:
        return "Not set"
    if len(value) <= 8:
        return "********"
    return f"{value[:4]}{'*' * 8}{value[-4:]}"


def quick_check_items():
    cfg = read_env()
    st = system_status()
    checks = [
        ("Backend URL", bool(cfg.get("DOTWATCH_API_URL")), cfg.get("DOTWATCH_API_URL") or "Not set"),
        ("Device Code", bool(cfg.get("DEVICE_CODE")), cfg.get("DEVICE_CODE") or "Not set"),
        ("Device Secret", bool(cfg.get("DEVICE_SECRET")), mask_secret(cfg.get("DEVICE_SECRET"))),
        ("Agent Service", st["agent"]["active"] == "active", st["agent"]["active"]),
        ("Config UI", st["config_ui"]["active"] == "active", st["config_ui"]["active"]),
    ]
    html_items = []
    for label, ok, detail in checks:
        html_items.append(
            f"""
            <div class="check-item {'done' if ok else 'todo'}">
              <div class="check-icon">{'✓' if ok else '!'}</div>
              <div><strong>{esc(label)}</strong><small>{esc(detail)}</small></div>
            </div>
            """
        )
    return "".join(html_items)


def install_requirements():
    venv_python = PROJECT_DIR / "venv" / "bin" / "python"
    python_bin = str(venv_python) if venv_python.exists() else "python3"
    req = PROJECT_DIR / "requirements.txt"
    if not req.exists():
        return False, "requirements.txt not found on Raspberry Pi"
    result = run_cmd([python_bin, "-m", "pip", "install", "-r", str(req)], timeout=180, cwd=str(PROJECT_DIR))
    return result["ok"], result["output"]


def test_modbus():
    venv_python = PROJECT_DIR / "venv" / "bin" / "python"
    python_bin = str(venv_python) if venv_python.exists() else "python3"
    script = PROJECT_DIR / "modbus_test.py"

    if not script.exists():
        return False, {"ok": False, "error": "modbus_test.py not found. Upload the Modbus agent files first."}

    result = run_cmd([python_bin, str(script)], timeout=45, cwd=str(PROJECT_DIR))
    output = result["output"] or ""

    try:
        data = json.loads(output)
    except Exception:
        data = {"ok": False, "raw_output": output}

    data["ui_time"] = datetime.now().isoformat(timespec="seconds")
    try:
        LAST_TEST_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass

    return bool(data.get("ok")), data


def read_last_test():
    if not LAST_TEST_PATH.exists():
        return {}
    try:
        return json.loads(LAST_TEST_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def backend_health():
    cfg = read_env()
    api = cfg.get("DOTWATCH_API_URL", "").rstrip("/")
    if not api:
        return {"ok": False, "error": "DOTWATCH_API_URL is missing"}

    request = urllib.request.Request(f"{api}/health", headers={"Accept": "application/json"}, method="GET")
    try:
        started = time.time()
        with urllib.request.urlopen(request, timeout=12) as response:
            body = response.read().decode("utf-8")
            data = json.loads(body) if body else {"ok": True}
            data["latencyMsFromPi"] = round((time.time() - started) * 1000)
            return data
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        return {"ok": False, "error": f"HTTP {error.code}: {body}"}
    except Exception as error:
        return {"ok": False, "error": str(error)}


def get_logs(service="dotwatch-pi-agent", lines=80):
    safe_service = "dotwatch-pi-config-ui" if service == "dotwatch-pi-config-ui" else "dotwatch-pi-agent"
    safe_lines = max(10, min(int(lines or 80), 300))
    result = run_cmd(["journalctl", "-u", safe_service, "-n", str(safe_lines), "--no-pager"], timeout=10)
    if result["ok"]:
        return result["output"] or "No logs yet."
    return result["output"] or "Unable to read logs."


def usb_scan():
    output = []
    output.append("USB serial ports:")
    output.append(run_cmd(["sh", "-lc", "ls -1 /dev/ttyUSB* /dev/ttyACM* 2>/dev/null || true"], timeout=5)["output"] or "No /dev/ttyUSB* or /dev/ttyACM* found")
    output.append("\nUSB devices:")
    output.append(run_cmd(["sh", "-lc", "command -v lsusb >/dev/null 2>&1 && lsusb || echo 'lsusb not installed'"], timeout=5)["output"])
    return "\n".join(output).strip()


def service_action(service, action):
    service_name = "dotwatch-pi-config-ui" if service == "config-ui" else "dotwatch-pi-agent"
    action_name = action if action in ("start", "stop", "restart") else "restart"
    return run_cmd(["sudo", "-n", "systemctl", action_name, service_name], timeout=15)


STYLE = r"""
<style>
:root{
  color-scheme:dark;
  --bg:#0f172a;
  --panel:#1e293b;
  --panel-2:#111827;
  --panel-soft:#0f172a;
  --text:#f8fafc;
  --muted:#94a3b8;
  --muted-2:#64748b;
  --border:#334155;
  --input:#0f172a;
  --sidebar:#020617;
  --sidebar-text:#ffffff;
  --sidebar-muted:#94a3b8;
  --primary:#2563eb;
  --primary-hover:#1d4ed8;
  --success:#22c55e;
  --warning:#f59e0b;
  --danger:#ef4444;
  --info:#0ea5e9;
  --brand-red:#ef4444;
  --brand-red-dark:#991b1b;
  --radius-sm:12px;
  --radius-md:16px;
  --radius-lg:22px;
  --shadow:0 18px 45px rgba(0,0,0,.26);
  --shadow-hover:0 24px 60px rgba(0,0,0,.34);
}
*{box-sizing:border-box}
html{min-width:320px;min-height:100%;background:var(--bg);scroll-behavior:smooth}
body{margin:0;min-width:320px;min-height:100vh;background:var(--bg);color:var(--text);font-family:"Inter","Prompt",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
button,input,select,textarea{font:inherit}
body::before{content:"";position:fixed;inset:0;pointer-events:none;background:radial-gradient(circle at 82% -10%,rgba(37,99,235,.22),transparent 30rem),radial-gradient(circle at -8% 24%,rgba(239,68,68,.12),transparent 26rem);opacity:.9}
a{color:inherit;text-decoration:none}
button,input,select,textarea{font:inherit}
button{cursor:pointer}
button:disabled,input:disabled,select:disabled{cursor:not-allowed;opacity:.55}
::-webkit-scrollbar{width:10px;height:10px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(148,163,184,.45);border-radius:999px}::-webkit-scrollbar-thumb:hover{background:rgba(37,99,235,.8)}
.app{position:relative;z-index:1;display:flex;min-height:100vh;background:transparent}
.sidebar{width:280px;min-height:100vh;flex-shrink:0;overflow:hidden;padding:22px 16px;background:linear-gradient(180deg,#111827 0%,#020617 100%);color:var(--sidebar-text);border-right:1px solid rgba(148,163,184,.16);box-shadow:12px 0 30px rgba(2,6,23,.20);display:flex;flex-direction:column;gap:18px}
.brand{height:58px;margin:0 0 8px;padding:10px;border-radius:18px;display:flex;align-items:center;justify-content:flex-start;gap:12px;white-space:nowrap;background:rgba(255,255,255,.055);border:1px solid rgba(148,163,184,.14);box-shadow:inset 0 1px 0 rgba(255,255,255,.05)}
.logo{width:38px;height:38px;flex:0 0 auto;border-radius:14px;display:inline-block;color:transparent;background:radial-gradient(circle at 30% 30%,#fff 0 8%,transparent 9%),linear-gradient(135deg,var(--brand-red),var(--brand-red-dark));box-shadow:0 12px 26px rgba(239,68,68,.34)}
.brand-title{color:#fff;font-size:18px;font-weight:900;line-height:1.05;letter-spacing:-.04em}.brand-subtitle{margin-top:4px;color:var(--sidebar-muted);font-size:11px;font-weight:700;letter-spacing:0;text-transform:none}
.nav-label{padding:0 6px;color:var(--sidebar-muted);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.nav-section{display:flex;flex-direction:column;gap:8px}.nav-link{position:relative;width:100%;height:48px;padding:0 14px;border:0;border-radius:16px;background:transparent;color:var(--sidebar-muted);display:flex;align-items:center;gap:12px;text-align:left;font-size:14px;font-weight:800;white-space:nowrap;transition:transform .2s ease,background .2s ease,color .2s ease,box-shadow .2s ease}.nav-link:hover,.nav-link.active{color:#fff;background:rgba(255,255,255,.08)}.nav-link.active::before{content:"";position:absolute;left:7px;top:12px;bottom:12px;width:4px;border-radius:999px;background:var(--primary)}.nav-icon{min-width:24px;height:24px;border-radius:0;display:inline-flex;align-items:center;justify-content:center;background:transparent;font-size:18px}.side-card{margin-top:auto;padding:16px;border-radius:18px;background:rgba(255,255,255,.055);border:1px solid rgba(148,163,184,.14);color:var(--sidebar-muted);font-size:12px;line-height:1.55;box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}.side-card strong{color:#fff;font-size:12px;font-weight:900}
.main{flex:1;min-width:0;padding:28px;background:transparent;overflow-x:hidden}.header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:24px;margin:0 0 18px;border-radius:var(--radius-lg);background:var(--panel);border:1px solid var(--border);box-shadow:var(--shadow)}.eyebrow{display:inline-flex;margin-bottom:8px;color:var(--primary);font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.header h1{margin:0;color:var(--text);font-size:28px;line-height:1.15;font-weight:900;letter-spacing:-.04em}.header p{margin:7px 0 0;color:var(--muted);font-size:14px;line-height:1.55}.header-actions{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap}
.pill,.badge{display:inline-flex;align-items:center;gap:8px;min-height:34px;padding:0 12px;border-radius:999px;border:1px solid var(--border);background:var(--panel-2);color:var(--muted);font-size:12px;font-weight:800;white-space:nowrap}.badge span{width:8px;height:8px;border-radius:999px;background:var(--warning);box-shadow:0 0 0 4px rgba(245,158,11,.12)}.badge.ok{color:#bbf7d0;border-color:rgba(34,197,94,.25);background:rgba(34,197,94,.10)}.badge.ok span{background:var(--success);box-shadow:0 0 0 4px rgba(34,197,94,.12)}.badge.bad{color:#fecaca;border-color:rgba(239,68,68,.25);background:rgba(239,68,68,.10)}.badge.bad span{background:var(--danger);box-shadow:0 0 0 4px rgba(239,68,68,.12)}.badge.warn{color:#fde68a;border-color:rgba(245,158,11,.25);background:rgba(245,158,11,.10)}
button,.button-link{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:0 14px;border-radius:13px;border:0;color:#fff;background:var(--primary);font-weight:800;font-size:13px;white-space:nowrap;box-shadow:0 12px 28px rgba(37,99,235,.20);transition:transform .2s ease,background-color .2s ease,border-color .2s ease,box-shadow .2s ease}.button-link{height:40px}button:hover,.button-link:hover{transform:translateY(-1px);box-shadow:0 16px 34px rgba(37,99,235,.27)}.secondary{background:transparent;color:var(--text);border:1px solid var(--border);box-shadow:none}.secondary:hover{background:rgba(148,163,184,.10);box-shadow:none}.warning{background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.28);box-shadow:none;color:#fde68a}.ok-btn{background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.28);box-shadow:none;color:#bbf7d0}.danger{background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.28);box-shadow:none;color:#fecaca}.button-row,.actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:16px}
.layout{display:grid;grid-template-columns:minmax(0,1fr) 390px;gap:18px;align-items:start}.setup-layout{display:grid;grid-template-columns:1fr;gap:18px;align-items:start}.setup-summary{display:grid;grid-template-columns:1fr 1fr;gap:18px}.stack{display:grid;gap:18px}.card{background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius-lg);box-shadow:var(--shadow);overflow:hidden;transition:box-shadow .2s ease,transform .2s ease}.card:hover{box-shadow:var(--shadow-hover)}.card-header{padding:22px 24px 16px;border-bottom:1px solid var(--border);background:transparent;display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.card-header h2{margin:0;color:var(--text);font-size:20px;font-weight:900;line-height:1.2;letter-spacing:-.02em}.card-header p{margin:6px 0 0;color:var(--muted);font-size:14px;line-height:1.55}.card-body{padding:24px}.mini-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.stat-card{background:var(--panel-2);color:var(--text);border:1px solid var(--border);border-radius:var(--radius-md);box-shadow:0 10px 30px rgba(0,0,0,.10);padding:16px;min-width:0}.stat-card small{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:12px;font-weight:800;text-transform:none;letter-spacing:0}.stat-card strong{display:block;margin-top:8px;color:var(--text);font-size:20px;font-weight:900;line-height:1.15;letter-spacing:-.04em;overflow-wrap:anywhere}.block{padding:18px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--panel-2);margin-bottom:16px}.block-title{margin:0 0 14px;color:var(--text);font-size:14px;font-weight:900;letter-spacing:-.01em;text-transform:none}.form-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.field{display:flex;flex-direction:column;gap:8px}.field.full{grid-column:1/-1}.field.two{grid-column:span 2}label{display:grid;gap:8px;color:var(--text);font-size:13px;font-weight:700}input,select,textarea{width:100%;border:1px solid var(--border);border-radius:13px;background:var(--input);color:var(--text);padding:12px 14px;outline:none;transition:border-color .2s ease,box-shadow .2s ease,background-color .2s ease}textarea{min-height:180px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}input:focus,select:focus,textarea:focus{border-color:var(--primary);box-shadow:0 0 0 4px rgba(37,99,235,.12)}.hint{color:var(--muted);font-size:12px;line-height:1.45}.notice{border-radius:16px;padding:14px 16px;margin-bottom:18px;border:1px solid rgba(14,165,233,.28);background:rgba(14,165,233,.10);color:#bfdbfe;line-height:1.5;font-size:14px}.notice.success{background:rgba(34,197,94,.10);border-color:rgba(34,197,94,.28);color:#bbf7d0}.notice.danger{background:rgba(239,68,68,.10);border-color:rgba(239,68,68,.28);color:#fecaca}.notice.warning{background:rgba(245,158,11,.10);border-color:rgba(245,158,11,.28);color:#fde68a}.check-list{display:grid;gap:10px}.check-item{display:flex;gap:12px;align-items:flex-start;border:1px solid var(--border);border-radius:16px;padding:13px;background:var(--panel-2)}.check-item strong{color:var(--text);font-size:13px}.check-item small{display:block;margin-top:4px;color:var(--muted);font-size:12px;overflow-wrap:anywhere}.check-icon{width:28px;height:28px;border-radius:10px;display:grid;place-items:center;font-weight:900;background:rgba(245,158,11,.14);color:#fde68a}.check-item.done .check-icon{background:rgba(34,197,94,.14);color:#bbf7d0}.read-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--panel-2);margin-bottom:16px}.read-buttons{display:flex;gap:10px;flex-wrap:wrap}.small-status{color:var(--muted);font-size:13px}.live-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.live-card{min-height:106px;border:1px solid var(--border);border-radius:16px;padding:14px;background:var(--panel-2);box-shadow:0 10px 30px rgba(0,0,0,.10)}.live-card .top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.live-card span{color:var(--muted);font-size:12px;font-weight:800}.live-card strong{display:block;margin-top:4px;font-size:14px;line-height:1.2;color:var(--text)}.live-value{margin-top:12px;font-size:24px;font-weight:900;color:#bbf7d0;letter-spacing:-.05em;overflow-wrap:anywhere}.live-value.empty{color:var(--muted-2)}.live-error{margin-top:8px;color:#fecaca;font-size:12px;line-height:1.35}details{border:1px solid var(--border);border-radius:var(--radius-md);background:var(--panel-2);overflow:hidden}summary{cursor:pointer;padding:16px 18px;font-weight:900;color:var(--text)}.map-table-wrap{overflow:auto;border-top:1px solid var(--border)}.map-table{width:100%;min-width:1260px;border-collapse:separate;border-spacing:0;background:var(--panel-2)}.map-table th,.map-table td{border-bottom:1px solid var(--border);padding:9px 7px;text-align:left;vertical-align:middle}.map-table th{position:sticky;top:0;background:#0f172a;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.06em;z-index:1}.map-table input,.map-table select{padding:8px 9px;border-radius:10px;font-size:12px}.map-table .mini{width:76px}.map-table .tiny{width:58px}.map-table .name{width:160px}.map-table .metric{width:86px}.check{width:18px;height:18px}.console{white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.55;background:var(--input);border:1px solid var(--border);border-radius:16px;padding:14px;color:#dbeafe;max-height:420px;overflow:auto}.footer{margin-top:18px;color:var(--muted);font-size:12px;text-align:center}
@media(max-width:1200px){.layout{grid-template-columns:1fr}.setup-summary{grid-template-columns:1fr}.mini-grid,.form-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.layout>aside.card{position:static}}
@media(max-width:1080px){.app{display:block}.sidebar{width:auto;min-height:auto;border-right:0;border-bottom:1px solid rgba(148,163,184,.16);box-shadow:0 12px 30px rgba(2,6,23,.20)}.side-card{display:none}.nav-label{display:none}.nav-section{display:flex;flex-direction:row;gap:8px;overflow:auto;padding-bottom:2px}.nav-link{width:auto;min-width:max-content}.nav-link.active::before{display:none}}
@media(max-width:640px){.main{padding:16px 12px 36px}.header{flex-direction:column;padding:20px}.header h1{font-size:24px}.card-header{flex-direction:column;padding:20px 20px 14px}.card-body{padding:20px}.mini-grid,.form-grid,.live-grid{grid-template-columns:1fr}.field.two{grid-column:1}.read-toolbar{align-items:flex-start;flex-direction:column}.button-row,.actions{align-items:stretch}.button-row>*{width:100%}.button-row button,.button-row .button-link,.actions button,.actions .button-link{width:100%}}
</style>
"""


def nav_item(path, icon, label, page, current):
    active = "active" if current == page else ""
    return f'<a class="nav-link {active}" href="{path}"><span class="nav-icon">{icon}</span>{label}</a>'


def shell(content, page="setup", message="", message_type="info", title=None, subtitle=None):
    st = system_status()
    cfg = read_env()
    message_html = f'<div class="notice {esc(message_type)}">{esc(message)}</div>' if message else ""
    title_text = title or {
        "setup": "Pi Setup Center",
        "live": "Modbus Live Workbench",
        "status": "System Status",
        "diagnostics": "Diagnostics",
    }.get(page, "Pi Setup Center")
    subtitle_text = subtitle or {
        "setup": "ตั้งค่า Backend, Device, Security และ Sensor Source ในหน้าเดียว",
        "live": "ตั้งค่า Modbus 20 ค่า และอ่านค่าแบบต่อเนื่องก่อนส่งเข้า dotWatch",
        "status": "ดูสถานะ Agent, Config UI และ log ล่าสุดของ Raspberry Pi",
        "diagnostics": "ทดสอบ Backend, Modbus, USB/RS485 และ dependency",
    }.get(page, "dotWatch Pi configuration")

    return f"""<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>dotWatch Pi Config</title>
  {STYLE}
</head>
<body>
<div class="app">
<aside class="sidebar">
  <div class="brand"><div class="logo">d</div><div><div class="brand-title">dotWatch</div><div class="brand-subtitle">Pi Gateway</div></div></div>
  <div class="nav-label">Control Center</div>
  <nav class="nav-section">
    {nav_item('/', '⌂', 'Setup', 'setup', page)}
    {nav_item('/live', '▣', 'Live', 'live', page)}
    {nav_item('/status', '◉', 'Status', 'status', page)}
    {nav_item('/diagnostics', '◇', 'Diagnostics', 'diagnostics', page)}
    <a class="nav-link" href="/logout"><span class="nav-icon">↩</span>Logout</a>
  </nav>
  <div class="side-card">
    <strong>Device</strong><br>{esc(cfg.get('DEVICE_CODE') or 'Not paired')}<br><br>
    <strong>Source</strong><br>{esc(cfg.get('SENSOR_SOURCE', 'dummy'))}<br><br>
    <strong>UI</strong><br>v{APP_VERSION}
  </div>
</aside>
<main class="main">
  <header class="header">
    <div>
      <div class="eyebrow">dotWatch Raspberry Pi</div>
      <h1>{esc(title_text)}</h1>
      <p>{esc(subtitle_text)}</p>
    </div>
    <div class="header-actions">
      <span class="pill">IPs: {esc(st.get('all_ips') or st['primary_ip'])}</span>
      {status_badge('Agent ' + st['agent']['active'])}
      {status_badge('UI ' + st['config_ui']['active'])}
    </div>
  </header>
  {message_html}
  {content}
  <div class="footer">dotWatch Pi Config UI · {APP_VERSION} · {esc(st['agent_dir'])}</div>
</main>
</div>
</body>
</html>"""


def setup_page(message="", message_type="info"):
    cfg = read_env()
    st = system_status()
    content = f"""
    <section class="setup-layout">
      <div class="stack">
        <section class="card">
          <div class="card-header">
            <div><h2>Quick Setup</h2><p>ใส่ Device Code/Secret จาก Dashboard แล้วเลือกโหมดอ่านค่า เริ่มจาก Dummy ก่อนเพื่อเช็คระบบ</p></div>
            {status_badge('Source ' + cfg.get('SENSOR_SOURCE', 'dummy'))}
          </div>
          <div class="card-body">
            <form method="POST" action="/settings/save">
              <div class="block">
                <div class="block-title">Backend & Device Pairing</div>
                <div class="form-grid">
                  <div class="field two"><label>Backend API URL</label><input name="DOTWATCH_API_URL" value="{esc(cfg.get('DOTWATCH_API_URL'))}" placeholder="https://dotwatch-backend.onrender.com"></div>
                  <div class="field"><label>Device Code</label><input name="DEVICE_CODE" value="{esc(cfg.get('DEVICE_CODE'))}" placeholder="DW-..."></div>
                  <div class="field"><label>Device Secret</label><input name="DEVICE_SECRET" type="password" value="" placeholder="เว้นว่างเพื่อใช้ค่าเดิม"><div class="hint">Current: {esc(mask_secret(cfg.get('DEVICE_SECRET')))}</div></div>
                </div>
              </div>
              <div class="block">
                <div class="block-title">Agent Behavior</div>
                <div class="form-grid">
                  <div class="field"><label>Sensor Source</label><select name="SENSOR_SOURCE"><option value="dummy" {selected(cfg.get('SENSOR_SOURCE'), 'dummy')}>Dummy / Test</option><option value="modbus" {selected(cfg.get('SENSOR_SOURCE'), 'modbus')}>Modbus config mode</option><option value="modbus_tcp" {selected(cfg.get('SENSOR_SOURCE'), 'modbus_tcp')}>Force Modbus TCP</option><option value="modbus_rtu" {selected(cfg.get('SENSOR_SOURCE'), 'modbus_rtu')}>Force Modbus RTU</option></select></div>
                  <div class="field"><label>Send Interval</label><select name="SEND_INTERVAL_SECONDS"><option value="5" {selected(cfg.get('SEND_INTERVAL_SECONDS'), '5')}>5 sec</option><option value="10" {selected(cfg.get('SEND_INTERVAL_SECONDS'), '10')}>10 sec</option><option value="20" {selected(cfg.get('SEND_INTERVAL_SECONDS'), '20')}>20 sec</option><option value="30" {selected(cfg.get('SEND_INTERVAL_SECONDS'), '30')}>30 sec</option><option value="60" {selected(cfg.get('SEND_INTERVAL_SECONDS'), '60')}>60 sec</option></select></div>
                  <div class="field"><label>Request Timeout</label><select name="REQUEST_TIMEOUT_SECONDS"><option value="10" {selected(cfg.get('REQUEST_TIMEOUT_SECONDS'), '10')}>10 sec</option><option value="15" {selected(cfg.get('REQUEST_TIMEOUT_SECONDS'), '15')}>15 sec</option><option value="30" {selected(cfg.get('REQUEST_TIMEOUT_SECONDS'), '30')}>30 sec</option><option value="60" {selected(cfg.get('REQUEST_TIMEOUT_SECONDS'), '60')}>60 sec</option></select></div>
                  <div class="field"><label>Firmware Version</label><input name="FIRMWARE_VERSION" value="{esc(cfg.get('FIRMWARE_VERSION'))}"></div>
                  <div class="field"><label>Offline Queue</label><select name="OFFLINE_QUEUE_ENABLED"><option value="true" {selected(cfg.get('OFFLINE_QUEUE_ENABLED'), 'true')}>Enabled</option><option value="false" {selected(cfg.get('OFFLINE_QUEUE_ENABLED'), 'false')}>Disabled</option></select></div>
                  <div class="field"><label>Queue Max Items</label><input name="OFFLINE_QUEUE_MAX_ITEMS" value="{esc(cfg.get('OFFLINE_QUEUE_MAX_ITEMS'))}" placeholder="1000"></div>
                  <div class="field"><label>Flush Per Cycle</label><input name="QUEUE_FLUSH_LIMIT" value="{esc(cfg.get('QUEUE_FLUSH_LIMIT'))}" placeholder="1"></div>
                  <div class="field"><label>Max Backoff</label><input name="MAX_BACKOFF_SECONDS" value="{esc(cfg.get('MAX_BACKOFF_SECONDS'))}" placeholder="60"></div>
                </div>
              </div>
              <div class="block">
                <div class="block-title">Config UI Security</div>
                <div class="form-grid">
                  <div class="field"><label>UI Username</label><input name="CONFIG_UI_USERNAME" value="{esc(cfg.get('CONFIG_UI_USERNAME'))}"></div>
                  <div class="field"><label>UI Password</label><input name="CONFIG_UI_PASSWORD" type="password" value="" placeholder="เว้นว่างเพื่อใช้ค่าเดิม"></div>
                </div>
              </div>
              <input type="hidden" name="MODBUS_CONFIG_PATH" value="{esc(MODBUS_CONFIG_PATH)}">
              <div class="actions">
                <button type="submit" name="after" value="save">Save Settings</button>
                <button class="warning" type="submit" name="after" value="restart">Save & Restart Agent</button>
                <a class="button-link secondary" href="/live">Go to Modbus Setup</a>
              </div>
            </form>
          </div>
        </section>
      </div>

      <div class="setup-summary">
        <section class="card">
          <div class="card-header"><div><h2>Setup Checklist</h2><p>ถ้าทุกข้อเป็นสีเขียว แปลว่าพร้อมเริ่มส่งข้อมูล</p></div></div>
          <div class="card-body"><div class="check-list">{quick_check_items()}</div></div>
        </section>
        <section class="card">
          <div class="card-header"><div><h2>Snapshot</h2><p>สถานะปัจจุบันของ Pi Gateway</p></div></div>
          <div class="card-body">
            <div class="mini-grid" style="grid-template-columns:repeat(2,minmax(0,1fr));">
              <div class="stat-card"><small>IP</small><strong>{esc(st.get('all_ips') or st['primary_ip'])}</strong></div>
              <div class="stat-card"><small>Agent</small><strong>{esc(st['agent']['active'])}</strong></div>
              <div class="stat-card"><small>Source</small><strong>{esc(cfg.get('SENSOR_SOURCE'))}</strong></div>
              <div class="stat-card"><small>Interval</small><strong>{esc(cfg.get('SEND_INTERVAL_SECONDS'))}s</strong></div>
              <div class="stat-card"><small>Queue</small><strong>{esc(st['offline_queue_count'])}</strong></div>
            </div>
            <div class="notice warning">{esc(security_notice())}</div>
            <div class="button-row">
              <a class="button-link secondary" href="/diagnostics">Run Diagnostics</a>
              <a class="button-link secondary" href="/status">View Logs</a>
            </div>
          </div>
        </section>
      </div>
    </section>
    """
    return shell(content, "setup", message, message_type)


def render_live_cards(registers):
    cards = []
    for i, item in enumerate(registers[:20]):
        key = f"metric_{i + 1}"
        enabled = bool(item.get("enabled"))
        cards.append(
            f"""
            <div class="live-card" data-card="{key}">
              <div class="top">
                <div><span>{esc(key)}</span><strong data-name="{key}">{esc(item.get('name') or key)}</strong></div>
                {status_badge('On' if enabled else 'Off')}
              </div>
              <div class="live-value empty" data-value="{key}">-</div>
              <span data-unit-label="{key}" style="display:none">{esc(item.get('unit', ''))}</span>
              <div class="live-error" data-error="{key}"></div>
            </div>
            """
        )
    return "".join(cards)


def render_register_rows(registers):
    rows = []
    for i, item in enumerate(registers[:20]):
        rows.append(f"""
        <tr>
          <td><input class="check" type="checkbox" name="reg_{i}_enabled" value="true" {checked(item.get('enabled', False))}></td>
          <td><input class="metric" name="reg_{i}_metric_key" value="metric_{i+1}" readonly></td>
          <td><input class="name" name="reg_{i}_name" value="{esc(item.get('name'))}"></td>
          <td><input class="tiny" name="reg_{i}_unit" value="{esc(item.get('unit', ''))}"></td>
          <td><select name="reg_{i}_function"><option value="holding" {selected(item.get('function'), 'holding')}>holding / FC03</option><option value="input" {selected(item.get('function'), 'input')}>input / FC04</option><option value="coil" {selected(item.get('function'), 'coil')}>coil / FC01</option><option value="discrete" {selected(item.get('function'), 'discrete')}>discrete / FC02</option></select></td>
          <td><input class="mini" type="number" name="reg_{i}_address" value="{esc(item.get('address', 0))}"></td>
          <td><select name="reg_{i}_data_type"><option value="uint16" {selected(item.get('data_type'), 'uint16')}>uint16</option><option value="int16" {selected(item.get('data_type'), 'int16')}>int16</option><option value="uint32" {selected(item.get('data_type'), 'uint32')}>uint32</option><option value="int32" {selected(item.get('data_type'), 'int32')}>int32</option><option value="float32" {selected(item.get('data_type'), 'float32')}>float32</option><option value="raw" {selected(item.get('data_type'), 'raw')}>raw</option></select></td>
          <td><input class="tiny" type="number" name="reg_{i}_count" value="{esc(item.get('count', 1))}"></td>
          <td><input class="mini" type="number" step="any" name="reg_{i}_scale" value="{esc(item.get('scale', 1))}"></td>
          <td><input class="mini" type="number" step="any" name="reg_{i}_offset" value="{esc(item.get('offset', 0))}"></td>
          <td><input class="tiny" type="number" name="reg_{i}_round" value="{esc(item.get('round', 2))}"></td>
          <td><input class="tiny" type="number" name="reg_{i}_unit_id" value="{esc(item.get('unit_id', 1))}"></td>
          <td><select name="reg_{i}_byte_order"><option value="big" {selected(item.get('byte_order'), 'big')}>big</option><option value="little" {selected(item.get('byte_order'), 'little')}>little</option></select></td>
          <td><select name="reg_{i}_word_order"><option value="big" {selected(item.get('word_order'), 'big')}>big</option><option value="little" {selected(item.get('word_order'), 'little')}>little</option></select></td>
        </tr>
        """)
    return "\n".join(rows)


def live_page(message="", message_type="info"):
    cfg = read_env()
    modbus = read_modbus_config()
    registers = modbus.get("registers", [])
    interval_ms = int(modbus.get("poll_interval_ms", 3000) or 3000)
    enabled_count = sum(1 for r in registers if r.get("enabled"))
    content = f"""
    <section class="layout">
      <div class="stack">
        <form class="card" method="POST" action="/modbus/save" id="mappingForm">
          <div class="card-header">
            <div><h2>Modbus Setup</h2><p>ตั้งค่า TCP/RTU และ mapping metric_1 ถึง metric_20 ให้ตรงกับ Dashboard รุ่น DW20CH</p></div>
            {status_badge(f'{enabled_count}/20 enabled')}
          </div>
          <div class="card-body">
            <div class="block">
              <div class="block-title">Connection</div>
              <div class="form-grid">
                <div class="field"><label>Mode</label><select name="mode"><option value="tcp" {selected(modbus.get('mode'), 'tcp')}>TCP</option><option value="rtu" {selected(modbus.get('mode'), 'rtu')}>RTU</option></select></div>
                <div class="field"><label>Host / IP</label><input name="tcp_host" value="{esc(modbus.get('tcp', {}).get('host', '192.168.1.50'))}"></div>
                <div class="field"><label>TCP Port</label><input name="tcp_port" type="number" value="{esc(modbus.get('tcp', {}).get('port', 502))}"></div>
                <div class="field"><label>Unit ID</label><input name="unit_id" type="number" value="{esc(modbus.get('unit_id', 1))}"></div>
                <div class="field"><label>Poll</label><select name="poll_interval_ms"><option value="1000" {selected(interval_ms, 1000)}>1 sec</option><option value="2000" {selected(interval_ms, 2000)}>2 sec</option><option value="3000" {selected(interval_ms, 3000)}>3 sec</option><option value="5000" {selected(interval_ms, 5000)}>5 sec</option><option value="10000" {selected(interval_ms, 10000)}>10 sec</option></select></div>
                <div class="field"><label>Agent Source</label><select name="sensor_source"><option value="dummy" {selected(cfg.get('SENSOR_SOURCE'), 'dummy')}>Dummy</option><option value="modbus" {selected(cfg.get('SENSOR_SOURCE'), 'modbus')}>Modbus</option></select></div>
                <div class="field"><label>RTU Port</label><input name="rtu_port" value="{esc(modbus.get('rtu', {}).get('port', '/dev/ttyUSB0'))}"></div>
                <div class="field"><label>Baudrate</label><input name="rtu_baudrate" type="number" value="{esc(modbus.get('rtu', {}).get('baudrate', 9600))}"></div>
                <div class="field"><label>Parity</label><select name="rtu_parity"><option value="N" {selected(modbus.get('rtu', {}).get('parity'), 'N')}>N</option><option value="E" {selected(modbus.get('rtu', {}).get('parity'), 'E')}>E</option><option value="O" {selected(modbus.get('rtu', {}).get('parity'), 'O')}>O</option></select></div>
                <div class="field"><label>Stopbits</label><input name="rtu_stopbits" type="number" value="{esc(modbus.get('rtu', {}).get('stopbits', 1))}"></div>
                <div class="field"><label>TCP Timeout</label><input name="tcp_timeout" type="number" step="0.1" value="{esc(modbus.get('tcp', {}).get('timeout', 3))}"></div>
                <div class="field"><label>RTU Timeout</label><input name="rtu_timeout" type="number" step="0.1" value="{esc(modbus.get('rtu', {}).get('timeout', 3))}"></div>
              </div>
              <div class="actions">
                <button type="submit" name="action" value="save">Save Mapping</button>
                <button class="secondary" type="submit" name="action" value="save_and_test">Save & Read Once</button>
                <button class="warning" type="submit" name="action" value="save_restart">Save & Restart Agent</button>
              </div>
            </div>
            <details open>
              <summary>Advanced Mapping 20 Values · Enabled {enabled_count}/20</summary>
              <div class="map-table-wrap"><table class="map-table"><thead><tr><th>On</th><th>Value</th><th>Name</th><th>Unit</th><th>Function</th><th>Addr</th><th>Type</th><th>Cnt</th><th>Scale</th><th>Offset</th><th>Round</th><th>ID</th><th>Byte</th><th>Word</th></tr></thead><tbody>{render_register_rows(registers)}</tbody></table></div>
            </details>
          </div>
        </form>
      </div>
      <aside class="card">
        <div class="card-header"><div><h2>Live Preview</h2><p>อ่านค่า Modbus บนหน้าเว็บก่อนเปิดให้ Agent ส่งเข้า Backend</p></div></div>
        <div class="card-body">
          <div class="read-toolbar"><div><strong id="readState">Stopped</strong><div class="small-status" id="readMeta">Poll every {interval_ms / 1000:g}s</div></div><div class="read-buttons"><button class="ok-btn" type="button" onclick="startRead()">Start</button><button class="danger" type="button" onclick="stopRead()">Stop</button><button class="secondary" type="button" onclick="readOnce()">Read Once</button></div></div>
          <div class="live-grid" id="liveGrid">{render_live_cards(registers)}</div>
          <div class="button-row"><form method="POST" action="/diagnostics/install"><button class="secondary" type="submit">Install Dependencies</button></form><form method="POST" action="/service/action"><input type="hidden" name="service" value="agent"><input type="hidden" name="action" value="restart"><button class="warning" type="submit">Restart Agent</button></form></div>
        </div>
      </aside>
    </section>
    <script>
      const pollMs = {interval_ms};
      let timer = null;
      let isReading = false;
      let round = 0;
      function setState(text) {{ document.getElementById('readState').textContent = text; }}
      function setMeta(text) {{ document.getElementById('readMeta').textContent = text; }}
      function formatValue(value) {{ if (value === undefined || value === null) return '-'; return String(value); }}
      function updateCards(data) {{
        const metrics = data.metrics || {{}};
        const errors = data.errors || {{}};
        const registers = data.registers || [];
        registers.forEach((item, index) => {{
          const key = item.metric_key || `metric_${{index + 1}}`;
          const nameEl = document.querySelector(`[data-name="${{key}}"]`);
          const unitEl = document.querySelector(`[data-unit-label="${{key}}"]`);
          if (nameEl) nameEl.textContent = item.name || key;
          if (unitEl) unitEl.textContent = item.unit || '';
        }});
        for (let i = 1; i <= 20; i++) {{
          const key = `metric_${{i}}`;
          const valueEl = document.querySelector(`[data-value="${{key}}"]`);
          const errorEl = document.querySelector(`[data-error="${{key}}"]`);
          const unitEl = document.querySelector(`[data-unit-label="${{key}}"]`);
          if (!valueEl) continue;
          if (Object.prototype.hasOwnProperty.call(metrics, key)) {{
            const unit = unitEl ? unitEl.textContent : '';
            valueEl.textContent = `${{formatValue(metrics[key])}} ${{unit}}`.trim();
            valueEl.classList.remove('empty');
            if (errorEl) errorEl.textContent = '';
          }} else if (errors[key]) {{
            valueEl.textContent = 'Error';
            valueEl.classList.add('empty');
            if (errorEl) errorEl.textContent = errors[key];
          }}
        }}
      }}
      async function readOnce() {{
        if (isReading) return;
        isReading = true; round += 1; setState('Reading...'); setMeta(`Request #${{round}}`);
        try {{
          const res = await fetch('/api/modbus/read', {{ cache: 'no-store' }});
          const data = await res.json();
          if (data.ok) {{ updateCards(data); setState('Live OK'); setMeta(`Last read: ${{data.time || data.ui_time || new Date().toLocaleTimeString()}}`); }}
          else {{ setState('Read Error'); setMeta(data.error || 'Unknown error'); updateCards(data); }}
        }} catch (err) {{ setState('Connection Error'); setMeta(String(err)); }}
        finally {{ isReading = false; }}
      }}
      function startRead() {{ if (timer) return; setState('Starting...'); readOnce(); timer = setInterval(readOnce, pollMs); }}
      function stopRead() {{ if (timer) clearInterval(timer); timer = null; setState('Stopped'); setMeta(`Poll every ${{pollMs / 1000}}s`); }}
    </script>
    """
    return shell(content, "live", message, message_type)


def status_page(message="", message_type="info"):
    st = system_status()
    agent_logs = get_logs("dotwatch-pi-agent", 80)
    content = f"""
    <section class="stack">
      <section class="card">
        <div class="card-header"><div><h2>System Overview</h2><p>สถานะเครื่องและ service หลัก</p></div></div>
        <div class="card-body">
          <div class="mini-grid">
            <div class="stat-card"><small>Primary IP</small><strong>{esc(st['primary_ip'])}</strong></div>
            <div class="stat-card"><small>Agent</small><strong>{esc(st['agent']['active'])}</strong></div>
            <div class="stat-card"><small>Config UI</small><strong>{esc(st['config_ui']['active'])}</strong></div>
            <div class="stat-card"><small>Source</small><strong>{esc(st['sensor_source'])}</strong></div>
            <div class="stat-card"><small>Disk</small><strong>{esc(st['disk'])}</strong></div>
            <div class="stat-card"><small>Memory</small><strong>{esc(st['memory'])}</strong></div>
            <div class="stat-card"><small>Load</small><strong>{esc(st['load'])}</strong></div>
            <div class="stat-card"><small>Temperature</small><strong>{esc(st['temperature'])}</strong></div>
            <div class="stat-card"><small>Offline Queue</small><strong>{esc(st['offline_queue_count'])}</strong></div>
            <div class="stat-card"><small>Queue Path</small><strong>{esc(st['offline_queue_path'])}</strong></div>
          </div>
          <div class="button-row">
            <form method="POST" action="/service/action"><input type="hidden" name="service" value="agent"><input type="hidden" name="action" value="restart"><button class="warning" type="submit">Restart Agent</button></form>
            <form method="POST" action="/service/action"><input type="hidden" name="service" value="agent"><input type="hidden" name="action" value="start"><button class="ok-btn" type="submit">Start Agent</button></form>
            <form method="POST" action="/service/action"><input type="hidden" name="service" value="agent"><input type="hidden" name="action" value="stop"><button class="danger" type="submit">Stop Agent</button></form>
          </div>
        </div>
      </section>
      <section class="card">
        <div class="card-header"><div><h2>Agent Logs</h2><p>บันทึกล่าสุดจาก dotwatch-pi-agent</p></div><a class="button-link secondary" href="/status">Refresh</a></div>
        <div class="card-body"><div class="console">{esc(agent_logs)}</div></div>
      </section>
    </section>
    """
    return shell(content, "status", message, message_type)


def diagnostics_page(message="", message_type="info"):
    backend = backend_health()
    last = read_last_test()
    content = f"""
    <section class="layout">
      <div class="stack">
        <section class="card">
          <div class="card-header"><div><h2>Quick Diagnostics</h2><p>ใช้หน้านี้ไล่ปัญหา Backend, Modbus และ USB/RS485</p></div></div>
          <div class="card-body">
            <div class="mini-grid">
              <div class="stat-card"><small>Backend</small><strong>{esc('OK' if backend.get('ok') else 'ERROR')}</strong></div>
              <div class="stat-card"><small>Backend latency</small><strong>{esc(str(backend.get('latencyMsFromPi', '-')) + ' ms')}</strong></div>
              <div class="stat-card"><small>Last Modbus</small><strong>{esc('OK' if last.get('ok') else 'No/Fail')}</strong></div>
              <div class="stat-card"><small>Config Version</small><strong>{APP_VERSION}</strong></div>
            </div>
            <div class="button-row">
              <a class="button-link secondary" href="/diagnostics">Retest Backend</a>
              <a class="button-link secondary" href="/api/modbus/read" target="_blank">Read Modbus JSON</a>
              <form method="POST" action="/diagnostics/install"><button class="secondary" type="submit">Install Python Dependencies</button></form>
            </div>
          </div>
        </section>
        <section class="card">
          <div class="card-header"><div><h2>Backend Health Result</h2></div></div>
          <div class="card-body"><div class="console">{esc(json.dumps(backend, ensure_ascii=False, indent=2))}</div></div>
        </section>
        <section class="card">
          <div class="card-header"><div><h2>Last Modbus Read Result</h2></div></div>
          <div class="card-body"><div class="console">{esc(json.dumps(last or {'message': 'No test result yet'}, ensure_ascii=False, indent=2))}</div></div>
        </section>
      </div>
      <aside class="card">
        <div class="card-header"><div><h2>USB / RS485 Scan</h2><p>สำหรับ Modbus RTU ให้เช็คว่ามี /dev/ttyUSB0 หรือไม่</p></div></div>
        <div class="card-body"><div class="console">{esc(usb_scan())}</div></div>
      </aside>
    </section>
    """
    return shell(content, "diagnostics", message, message_type)


def parse_register(form, i):
    data_type = form.get(f"reg_{i}_data_type", "uint16")
    default_count = 2 if data_type in ("float32", "int32", "uint32") else 1
    return {
        "enabled": form.get(f"reg_{i}_enabled") == "true",
        "metric_key": f"metric_{i + 1}",
        "name": form.get(f"reg_{i}_name", f"Value {i + 1}").strip(),
        "unit": form.get(f"reg_{i}_unit", "").strip(),
        "function": form.get(f"reg_{i}_function", "holding"),
        "address": int(form.get(f"reg_{i}_address", i) or i),
        "data_type": data_type,
        "count": int(form.get(f"reg_{i}_count", default_count) or default_count),
        "scale": float(form.get(f"reg_{i}_scale", 1) or 1),
        "offset": float(form.get(f"reg_{i}_offset", 0) or 0),
        "round": int(form.get(f"reg_{i}_round", 2) or 2),
        "unit_id": int(form.get(f"reg_{i}_unit_id", form.get("unit_id", 1)) or 1),
        "byte_order": form.get(f"reg_{i}_byte_order", "big"),
        "word_order": form.get(f"reg_{i}_word_order", "big"),
    }


def logout_page():
    return f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">{STYLE}</head><body><main class="main" style="max-width:760px;margin:0 auto;"><section class="card"><div class="card-header"><h2>Logged out</h2></div><div class="card-body"><div class="notice warning">บาง browser จะจำ Basic Auth ไว้จนกว่าจะปิดแท็บหรือปิด browser</div><a class="button-link secondary" href="/">Login again</a></div></section></main></body></html>""".encode("utf-8")


class Handler(BaseHTTPRequestHandler):
    server_version = f"dotWatchPiConfig/{APP_VERSION}"

    def is_authorized(self):
        cfg = read_env()
        username = str(cfg.get("CONFIG_UI_USERNAME", "admin") or "admin")
        password = str(cfg.get("CONFIG_UI_PASSWORD", "") or "")

        if is_unsafe_config_ui_password(password):
            return False

        header = self.headers.get("Authorization", "")
        if not header.startswith("Basic "):
            return False
        try:
            decoded = base64.b64decode(header.split(" ", 1)[1].strip()).decode("utf-8")
            supplied_username, supplied_password = decoded.split(":", 1)
            return hmac.compare_digest(supplied_username, username) and hmac.compare_digest(supplied_password, password)
        except Exception:
            return False

    def require_auth(self):
        self.send_response(401)
        self.send_header("WWW-Authenticate", 'Basic realm="dotWatch Pi Config"')
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write("Authentication required".encode("utf-8"))

    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def send_html(self, html_text):
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(html_text.encode("utf-8"))

    def read_form(self):
        length = int(self.headers.get("Content-Length", "0") or "0")
        body = self.rfile.read(length).decode("utf-8")
        parsed = parse_qs(body)
        return {key: values[0] if values else "" for key, values in parsed.items()}

    def route_html(self, path, message="", message_type="info"):
        if not self.is_authorized():
            self.require_auth()
            return
        if path in ("/", ""):
            self.send_html(setup_page(message, message_type))
        elif path.startswith("/live") or path.startswith("/modbus"):
            self.send_html(live_page(message, message_type))
        elif path.startswith("/status"):
            self.send_html(status_page(message, message_type))
        elif path.startswith("/diagnostics"):
            self.send_html(diagnostics_page(message, message_type))
        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/health":
            self.send_json({"ok": True, "version": APP_VERSION})
            return

        if path == "/api/modbus/read":
            if not self.is_authorized():
                self.send_json({"ok": False, "error": "Authentication required"}, 401)
                return
            ok, data = test_modbus()
            self.send_json(data, 200)
            return

        if path == "/api/system":
            if not self.is_authorized():
                self.send_json({"ok": False, "error": "Authentication required"}, 401)
                return
            self.send_json({"ok": True, "status": system_status()})
            return

        if path == "/api/backend/health":
            if not self.is_authorized():
                self.send_json({"ok": False, "error": "Authentication required"}, 401)
                return
            self.send_json(backend_health())
            return

        if path == "/api/logs":
            if not self.is_authorized():
                self.send_json({"ok": False, "error": "Authentication required"}, 401)
                return
            query = parse_qs(parsed.query)
            service = query.get("service", ["dotwatch-pi-agent"])[0]
            lines = query.get("lines", [80])[0]
            self.send_json({"ok": True, "service": service, "logs": get_logs(service, lines)})
            return

        if path == "/logout":
            self.send_response(401)
            self.send_header("WWW-Authenticate", f'Basic realm="dotWatch Pi Config Logout {int(time.time())}"')
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(logout_page())
            return

        self.route_html(path)

    def do_POST(self):
        if not self.is_authorized():
            self.require_auth()
            return

        if self.path == "/settings/save" or self.path == "/save":
            form = self.read_form()
            cfg = read_env()
            for key in ["DOTWATCH_API_URL", "DEVICE_CODE", "SEND_INTERVAL_SECONDS", "REQUEST_TIMEOUT_SECONDS", "FIRMWARE_VERSION", "SENSOR_SOURCE", "OFFLINE_QUEUE_ENABLED", "OFFLINE_QUEUE_MAX_ITEMS", "QUEUE_FLUSH_LIMIT", "MAX_BACKOFF_SECONDS", "CONFIG_UI_USERNAME"]:
                if key in form:
                    cfg[key] = form.get(key, cfg.get(key, "")).strip()
            if form.get("DEVICE_SECRET", "").strip():
                cfg["DEVICE_SECRET"] = form.get("DEVICE_SECRET", "").strip()
            if form.get("CONFIG_UI_PASSWORD", "").strip():
                cfg["CONFIG_UI_PASSWORD"] = form.get("CONFIG_UI_PASSWORD", "").strip()
            cfg["MODBUS_CONFIG_PATH"] = str(MODBUS_CONFIG_PATH)
            cfg["OFFLINE_QUEUE_PATH"] = str(PROJECT_DIR / "data" / "offline_queue.jsonl")
            write_env(cfg)
            if form.get("after") == "restart":
                result = service_action("agent", "restart")
                msg = "Saved and restarted agent." if result["ok"] else "Saved but restart failed: " + result["output"]
                self.route_html("/", msg, "success" if result["ok"] else "warning")
            else:
                self.route_html("/", "Saved settings successfully.", "success")
            return

        if self.path in ("/modbus/save", "/modbus/save-table"):
            form = self.read_form()
            try:
                config = {
                    "enabled": True,
                    "mode": form.get("mode", "tcp"),
                    "unit_id": int(form.get("unit_id", 1)),
                    "poll_interval_ms": int(form.get("poll_interval_ms", 3000) or 3000),
                    "tcp": {"host": form.get("tcp_host", "192.168.1.50"), "port": int(form.get("tcp_port", 502)), "timeout": float(form.get("tcp_timeout", 3))},
                    "rtu": {"port": form.get("rtu_port", "/dev/ttyUSB0"), "baudrate": int(form.get("rtu_baudrate", 9600)), "parity": form.get("rtu_parity", "N"), "stopbits": int(form.get("rtu_stopbits", 1)), "bytesize": 8, "timeout": float(form.get("rtu_timeout", 3))},
                    "registers": [parse_register(form, i) for i in range(20)],
                }
                write_modbus_config(config)
                cfg = read_env()
                cfg["SENSOR_SOURCE"] = form.get("sensor_source", "dummy")
                cfg["MODBUS_CONFIG_PATH"] = str(MODBUS_CONFIG_PATH)
                write_env(cfg)
                action = form.get("action")
                if action == "save_and_test":
                    ok, _data = test_modbus()
                    self.route_html("/live", "Saved and read success." if ok else "Saved but read failed. Check Diagnostics.", "success" if ok else "danger")
                elif action == "save_restart":
                    result = service_action("agent", "restart")
                    self.route_html("/live", "Saved and restarted agent." if result["ok"] else "Saved but restart failed: " + result["output"], "success" if result["ok"] else "warning")
                else:
                    self.route_html("/live", "Saved Modbus setup successfully.", "success")
            except Exception as error:
                self.route_html("/live", "Save failed: " + str(error), "danger")
            return

        if self.path == "/service/action" or self.path == "/restart-agent":
            form = self.read_form() if self.path == "/service/action" else {"service": "agent", "action": "restart"}
            service = form.get("service", "agent")
            action = form.get("action", "restart")
            result = service_action(service, action)
            msg = f"{action.title()} {service} success." if result["ok"] else f"{action.title()} {service} failed: {result['output']}"
            self.route_html("/status" if service == "agent" else "/", msg, "success" if result["ok"] else "danger")
            return

        if self.path == "/diagnostics/install" or self.path == "/modbus/install":
            ok, output = install_requirements()
            self.route_html("/diagnostics", ("Install success: " if ok else "Install failed: ") + output[:1400], "success" if ok else "danger")
            return

        self.send_response(404)
        self.end_headers()


def main():
    validate_config_ui_runtime_security()
    print(f"dotWatch Pi Config UI started on http://{HOST}:{PORT}")
    print(f"Version: {APP_VERSION}")
    print(f"Agent dir: {PROJECT_DIR}")
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
