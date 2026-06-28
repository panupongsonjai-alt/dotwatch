#!/usr/bin/env python3
import base64
import html
import json
import os
import platform
import subprocess
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs

APP_VERSION = "0.9.0"

PROJECT_DIR = Path(os.getenv("DOTWATCH_AGENT_DIR", "/home/pi/dotwatch-pi-agent"))
ENV_PATH = PROJECT_DIR / ".env"
MODBUS_CONFIG_PATH = PROJECT_DIR / "modbus_config.json"
LAST_TEST_PATH = PROJECT_DIR / "modbus_last_test_result.json"
HOST = os.getenv("DOTWATCH_CONFIG_HOST", "0.0.0.0")
PORT = int(os.getenv("DOTWATCH_CONFIG_PORT", "8080"))

DEFAULTS = {
    "DOTWATCH_API_URL": "https://dotwatch-backend.onrender.com",
    "DEVICE_CODE": "",
    "DEVICE_SECRET": "",
    "SEND_INTERVAL_SECONDS": "5",
    "FIRMWARE_VERSION": "rpi-agent-modbus-0.9.0",
    "SENSOR_SOURCE": "dummy",
    "MODBUS_CONFIG_PATH": str(MODBUS_CONFIG_PATH),
    "CONFIG_UI_USERNAME": "admin",
    "CONFIG_UI_PASSWORD": "change-this-config-password",
}


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
            f"Value {index + 1}", "", "holding", index, "uint16", 1, 1, 0, 2
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
        "tcp": {"host": "192.168.1.22", "port": 502, "timeout": 3},
        "rtu": {"port": "/dev/ttyUSB0", "baudrate": 9600, "parity": "N", "stopbits": 1, "bytesize": 8, "timeout": 3},
        "registers": [default_register(i) for i in range(20)],
    }


def esc(value):
    return html.escape(str(value if value is not None else ""), quote=True)


def selected(current, value):
    return "selected" if str(current or "") == str(value) else ""


def checked(value):
    return "checked" if bool(value) else ""


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
    keys = [
        "DOTWATCH_API_URL",
        "DEVICE_CODE",
        "DEVICE_SECRET",
        "SEND_INTERVAL_SECONDS",
        "FIRMWARE_VERSION",
        "SENSOR_SOURCE",
        "MODBUS_CONFIG_PATH",
        "CONFIG_UI_USERNAME",
        "CONFIG_UI_PASSWORD",
    ]

    path.parent.mkdir(parents=True, exist_ok=True)
    lines = ["# dotWatch Raspberry Pi Agent settings", f"# Updated at {datetime.now().isoformat(timespec='seconds')}", ""]

    for key in keys:
        lines.append(f"{key}={str(values.get(key, DEFAULTS.get(key, ''))).strip()}")

    lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def read_modbus_config():
    if not MODBUS_CONFIG_PATH.exists():
        return default_modbus_config()

    try:
        data = json.loads(MODBUS_CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        return default_modbus_config()

    cfg = default_modbus_config()
    cfg.update(data)
    base = default_modbus_config()
    cfg["tcp"] = {**base["tcp"], **data.get("tcp", {})}
    cfg["rtu"] = {**base["rtu"], **data.get("rtu", {})}
    cfg["poll_interval_ms"] = int(data.get("poll_interval_ms", 3000) or 3000)

    registers = data.get("registers", [])
    normalized = []

    for i in range(20):
        item = default_register(i)
        if i < len(registers) and isinstance(registers[i], dict):
            item.update(registers[i])
        item["metric_key"] = f"metric_{i + 1}"
        normalized.append(item)

    cfg["registers"] = normalized
    return cfg


def write_modbus_config(config):
    MODBUS_CONFIG_PATH.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")


def run_cmd(args, timeout=12, cwd=None):
    try:
        result = subprocess.run(
            args,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        output = (result.stdout or result.stderr or "").strip()
        return {"ok": result.returncode == 0, "output": output, "code": result.returncode}
    except Exception as error:
        return {"ok": False, "output": str(error), "code": -1}


def get_service_status(service):
    active = run_cmd(["systemctl", "is-active", service], timeout=5)
    enabled = run_cmd(["systemctl", "is-enabled", service], timeout=5)
    return {"active": active["output"] or "unknown", "enabled": enabled["output"] or "unknown"}


def get_primary_ip():
    ip_br = run_cmd(["ip", "-br", "addr"], timeout=5)["output"] or ""
    for line in ip_br.splitlines():
        if "UP" in line and "127.0.0.1" not in line:
            parts = line.split()
            if len(parts) >= 3:
                return parts[2].split("/")[0]
    return "N/A"


def system_status():
    return {
        "primary_ip": get_primary_ip(),
        "agent": get_service_status("dotwatch-pi-agent"),
        "config_ui": get_service_status("dotwatch-pi-config-ui"),
        "platform": platform.platform(),
    }


def dot_class(value):
    return "" if value == "active" else "offline"


def mask_secret(value):
    if not value:
        return "Not set"
    if len(value) <= 8:
        return "********"
    return f"{value[:4]}{'*' * 8}{value[-4:]}"


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
    LAST_TEST_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    return bool(data.get("ok")), data


def read_last_test():
    if not LAST_TEST_PATH.exists():
        return {}
    try:
        return json.loads(LAST_TEST_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


STYLE = """
<style>
:root{color-scheme:dark;--bg:#070a12;--sidebar:#0b1020;--line:rgba(148,163,184,.16);--text:#f8fafc;--muted:#9fb2cd;--muted2:#64748b;--accent:#ef4444;--accent2:#f97316;--green:#22c55e;--red:#ef4444;--yellow:#f59e0b;--radius:22px;--shadow:0 24px 70px rgba(0,0,0,.34)}
*{box-sizing:border-box}body{margin:0;min-height:100vh;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--text);background:radial-gradient(circle at -10% -20%,rgba(239,68,68,.24),transparent 34rem),linear-gradient(135deg,#070a12,#0b1020 48%,#070a12)}a{color:inherit;text-decoration:none}button,input,select{font:inherit}.app{min-height:100vh;display:grid;grid-template-columns:260px 1fr}.sidebar{position:sticky;top:0;height:100vh;padding:22px;background:linear-gradient(180deg,rgba(11,16,32,.96),rgba(7,10,18,.96));border-right:1px solid var(--line)}.brand{display:flex;gap:12px;align-items:center;padding:10px 8px 22px}.logo{width:46px;height:46px;border-radius:16px;display:grid;place-items:center;background:linear-gradient(135deg,var(--accent),var(--accent2));font-weight:950}.brand-title{font-size:1.1rem;font-weight:950}.brand-subtitle{color:var(--muted2);font-size:.78rem;font-weight:800;text-transform:uppercase}.nav-label{padding:0 10px 10px;color:var(--muted2);font-size:.72rem;font-weight:900;text-transform:uppercase;letter-spacing:.12em}.nav-link{display:flex;gap:10px;padding:12px 13px;margin-bottom:8px;border:1px solid transparent;border-radius:16px;color:var(--muted);font-weight:850}.nav-link.active{color:#fff;border-color:rgba(239,68,68,.34);background:linear-gradient(135deg,rgba(239,68,68,.20),rgba(249,115,22,.10));box-shadow:inset 3px 0 0 rgba(239,68,68,.95)}.nav-icon{width:28px;height:28px;border-radius:10px;display:grid;place-items:center;background:rgba(148,163,184,.09)}.main{min-width:0;padding:26px clamp(18px,3vw,36px) 44px}.header{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:20px}.eyebrow{color:#fca5a5;font-size:.78rem;font-weight:950;text-transform:uppercase;letter-spacing:.12em}h1{margin:6px 0 0;font-size:clamp(1.7rem,3vw,2.65rem);line-height:1.03;letter-spacing:-.055em}.header p{margin:10px 0 0;color:var(--muted)}.header-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}.pill{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:999px;background:rgba(15,23,42,.70);color:var(--muted);padding:9px 12px;font-size:.82rem;font-weight:850}.status-dot{width:9px;height:9px;border-radius:99px;background:var(--green);box-shadow:0 0 0 5px rgba(34,197,94,.12)}.status-dot.offline{background:var(--red);box-shadow:0 0 0 5px rgba(239,68,68,.12)}.button-link,button{border:0;border-radius:14px;padding:11px 14px;color:#fff;cursor:pointer;font-weight:950;background:linear-gradient(135deg,var(--accent),var(--accent2));box-shadow:0 14px 30px rgba(239,68,68,.18);font-size:.88rem}.secondary{background:rgba(148,163,184,.10);border:1px solid var(--line);box-shadow:none}.warning{background:rgba(245,158,11,.13);border:1px solid rgba(245,158,11,.25);box-shadow:none;color:#fde68a}.ok{background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.25);box-shadow:none;color:#bbf7d0}.danger{background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.28);box-shadow:none;color:#fecaca}.grid{display:grid;grid-template-columns:1fr 390px;gap:18px;align-items:start}.card{border:1px solid var(--line);background:linear-gradient(180deg,rgba(16,24,39,.92),rgba(13,20,34,.90));border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden}.card-header{padding:20px 22px 16px;border-bottom:1px solid var(--line);background:rgba(255,255,255,.025)}.card-header h2{margin:0;font-size:1.04rem}.card-header p{margin:8px 0 0;color:var(--muted);font-size:.88rem;line-height:1.55}.card-body{padding:20px 22px 22px}.block{padding:16px;border:1px solid var(--line);border-radius:18px;background:rgba(2,6,23,.22);margin-bottom:16px}.block-title{margin:0 0 14px;color:#cbd5e1;font-size:.76rem;font-weight:950;text-transform:uppercase;letter-spacing:.11em}.simple-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.field{display:flex;flex-direction:column;gap:8px}.field.full{grid-column:1/-1}.field.two{grid-column:span 2}label{color:#cbd5e1;font-size:.82rem;font-weight:850}input,select{width:100%;border:1px solid rgba(148,163,184,.18);background:rgba(2,6,23,.52);color:var(--text);border-radius:14px;padding:11px 12px;outline:none}.hint{color:var(--muted2);font-size:.78rem;line-height:1.45}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}.notice{border-radius:16px;padding:13px 15px;margin-bottom:16px;border:1px solid var(--line);background:rgba(56,189,248,.08);color:#bfdbfe;line-height:1.5}.notice.success{background:rgba(34,197,94,.10);border-color:rgba(34,197,94,.22);color:#bbf7d0}.notice.danger{background:rgba(239,68,68,.10);border-color:rgba(239,68,68,.22);color:#fecaca}.notice.warning{background:rgba(245,158,11,.10);border-color:rgba(245,158,11,.22);color:#fde68a}.read-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px;border:1px solid var(--line);border-radius:18px;background:rgba(2,6,23,.28);margin-bottom:16px}.read-buttons{display:flex;gap:10px;flex-wrap:wrap}.small-status{color:var(--muted);font-size:.82rem}.live-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.live-card{min-height:94px;border:1px solid var(--line);border-radius:16px;padding:13px;background:rgba(2,6,23,.28)}.live-card .top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.live-card span{color:var(--muted);font-size:.75rem;font-weight:850}.live-card strong{display:block;margin-top:4px;font-size:.92rem;line-height:1.2}.live-value{margin-top:10px;font-size:1.3rem;font-weight:950;color:#bbf7d0;letter-spacing:-.04em;overflow-wrap:anywhere}.live-value.empty{color:var(--muted2)}.live-error{margin-top:8px;color:#fecaca;font-size:.74rem;line-height:1.35}.tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.tab{border:1px solid var(--line);border-radius:999px;background:rgba(148,163,184,.08);color:var(--muted);padding:8px 12px;font-weight:850;font-size:.82rem}.tab.active{color:white;border-color:rgba(239,68,68,.35);background:rgba(239,68,68,.18)}details{border:1px solid var(--line);border-radius:18px;background:rgba(2,6,23,.18);overflow:hidden}summary{cursor:pointer;padding:16px 18px;font-weight:950;color:#cbd5e1}.map-table-wrap{overflow:auto;border-top:1px solid var(--line)}.map-table{width:100%;min-width:1260px;border-collapse:separate;border-spacing:0;background:rgba(2,6,23,.28)}.map-table th,.map-table td{border-bottom:1px solid var(--line);padding:9px 7px;text-align:left;vertical-align:middle}.map-table th{position:sticky;top:0;background:#111827;color:#cbd5e1;font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;z-index:1}.map-table input,.map-table select{padding:8px 9px;border-radius:10px;font-size:.82rem}.map-table .mini{width:76px}.map-table .tiny{width:58px}.map-table .name{width:160px}.map-table .metric{width:86px}.check{width:18px;height:18px}.footer{margin-top:18px;color:var(--muted2);font-size:.8rem;text-align:center}@media(max-width:1200px){.grid{grid-template-columns:1fr}.simple-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:1080px){.app{grid-template-columns:1fr}.sidebar{position:relative;height:auto;border-right:0;border-bottom:1px solid var(--line)}.nav-section{display:flex;gap:8px;overflow:auto}.nav-label{display:none}}@media(max-width:640px){.main{padding:18px 12px 36px}.header{flex-direction:column}.simple-grid,.live-grid{grid-template-columns:1fr}}
</style>
"""


def shell(content, page="modbus", message="", message_type="info"):
    st = system_status()
    active = {name: "active" if page == name else "" for name in ["settings", "status", "modbus"]}
    message_html = f'<div class="notice {esc(message_type)}">{esc(message)}</div>' if message else ""

    return f"""<!doctype html>
<html lang="th">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>dotWatch Pi Config</title>{STYLE}</head>
<body>
<div class="app">
<aside class="sidebar">
  <div class="brand"><div class="logo">d</div><div><div class="brand-title">dotWatch</div><div class="brand-subtitle">Pi Gateway</div></div></div>
  <div class="nav-label">Navigation</div>
  <nav class="nav-section">
    <a class="nav-link {active["settings"]}" href="/"><span class="nav-icon">⚙</span>Settings</a>
    <a class="nav-link {active["status"]}" href="/status"><span class="nav-icon">●</span>Status</a>
    <a class="nav-link {active["modbus"]}" href="/modbus"><span class="nav-icon">↔</span>Modbus Live</a>
    <a class="nav-link" href="/logout"><span class="nav-icon">↩</span>Logout</a>
  </nav>
</aside>
<main class="main">
  <header class="header">
    <div>
      <div class="eyebrow">dotWatch Raspberry Pi</div>
      <h1>{"Modbus Live Reader" if page == "modbus" else esc(page.title())}</h1>
      <p>{"อ่านค่า Modbus แบบต่อเนื่อง พร้อมตั้งค่า mapping 20 ค่าแบบง่าย" if page == "modbus" else "dotWatch Pi configuration"}</p>
    </div>
    <div class="header-actions">
      <span class="pill"><span class="status-dot {dot_class(st["agent"]["active"])}"></span>Agent: {esc(st["agent"]["active"])}</span>
      <span class="pill">IP: {esc(st["primary_ip"])}</span>
      <a class="button-link secondary" href="/{'' if page == 'settings' else page}">Refresh</a>
    </div>
  </header>
  {message_html}
  {content}
  <div class="footer">dotWatch Pi Config UI v{APP_VERSION} · Local network only</div>
</main>
</div>
</body>
</html>""".encode("utf-8")


def render_live_cards(registers):
    cards = []
    for i in range(20):
        item = registers[i] if i < len(registers) else default_register(i)
        key = f"metric_{i+1}"
        enabled_class = "" if item.get("enabled") else " empty"
        cards.append(f"""
          <div class="live-card" data-metric-card="{key}">
            <div class="top">
              <div>
                <span>{key}</span>
                <strong data-name="{key}">{esc(item.get("name", key))}</strong>
              </div>
              <span data-unit-label="{key}">{esc(item.get("unit", ""))}</span>
            </div>
            <div class="live-value{enabled_class}" data-value="{key}">{"Waiting" if item.get("enabled") else "Off"}</div>
            <div class="live-error" data-error="{key}"></div>
          </div>
        """)
    return "".join(cards)


def render_register_rows(registers):
    rows = []
    for i, item in enumerate(registers[:20]):
        rows.append(f"""
        <tr>
          <td><input class="check" type="checkbox" name="reg_{i}_enabled" value="true" {checked(item.get("enabled", False))}></td>
          <td><input class="metric" name="reg_{i}_metric_key" value="metric_{i+1}" readonly></td>
          <td><input class="name" name="reg_{i}_name" value="{esc(item.get("name"))}"></td>
          <td><input class="tiny" name="reg_{i}_unit" value="{esc(item.get("unit", ""))}"></td>
          <td>
            <select name="reg_{i}_function">
              <option value="holding" {selected(item.get("function"), "holding")}>holding / FC03</option>
              <option value="input" {selected(item.get("function"), "input")}>input / FC04</option>
              <option value="coil" {selected(item.get("function"), "coil")}>coil / FC01</option>
              <option value="discrete" {selected(item.get("function"), "discrete")}>discrete / FC02</option>
            </select>
          </td>
          <td><input class="mini" type="number" name="reg_{i}_address" value="{esc(item.get("address", 0))}"></td>
          <td>
            <select name="reg_{i}_data_type">
              <option value="uint16" {selected(item.get("data_type"), "uint16")}>uint16</option>
              <option value="int16" {selected(item.get("data_type"), "int16")}>int16</option>
              <option value="uint32" {selected(item.get("data_type"), "uint32")}>uint32</option>
              <option value="int32" {selected(item.get("data_type"), "int32")}>int32</option>
              <option value="float32" {selected(item.get("data_type"), "float32")}>float32</option>
              <option value="raw" {selected(item.get("data_type"), "raw")}>raw</option>
            </select>
          </td>
          <td><input class="tiny" type="number" name="reg_{i}_count" value="{esc(item.get("count", 1))}"></td>
          <td><input class="mini" type="number" step="any" name="reg_{i}_scale" value="{esc(item.get("scale", 1))}"></td>
          <td><input class="mini" type="number" step="any" name="reg_{i}_offset" value="{esc(item.get("offset", 0))}"></td>
          <td><input class="tiny" type="number" name="reg_{i}_round" value="{esc(item.get("round", 2))}"></td>
          <td><input class="tiny" type="number" name="reg_{i}_unit_id" value="{esc(item.get("unit_id", 1))}"></td>
          <td>
            <select name="reg_{i}_byte_order">
              <option value="big" {selected(item.get("byte_order"), "big")}>big</option>
              <option value="little" {selected(item.get("byte_order"), "little")}>little</option>
            </select>
          </td>
          <td>
            <select name="reg_{i}_word_order">
              <option value="big" {selected(item.get("word_order"), "big")}>big</option>
              <option value="little" {selected(item.get("word_order"), "little")}>little</option>
            </select>
          </td>
        </tr>
        """)
    return "\n".join(rows)


def modbus_page(message="", message_type="info"):
    cfg = read_env()
    modbus = read_modbus_config()
    registers = modbus.get("registers", [])
    interval_ms = int(modbus.get("poll_interval_ms", 3000) or 3000)
    enabled_count = sum(1 for r in registers if r.get("enabled"))

    content = f"""
    <section class="grid">
      <div>
        <form class="card" method="POST" action="/modbus/save-table" id="mappingForm">
          <div class="card-header">
            <h2>Simple Setup</h2>
            <p>ตั้งค่า connection และเปิดค่าที่ต้องการอ่าน แล้วใช้ Start Continuous Read เพื่อดูค่าแบบต่อเนื่อง</p>
          </div>
          <div class="card-body">
            <div class="block">
              <div class="block-title">Connection</div>
              <div class="simple-grid">
                <div class="field">
                  <label>Mode</label>
                  <select name="mode">
                    <option value="tcp" {selected(modbus.get("mode"), "tcp")}>TCP</option>
                    <option value="rtu" {selected(modbus.get("mode"), "rtu")}>RTU</option>
                  </select>
                </div>
                <div class="field">
                  <label>Host / IP</label>
                  <input name="tcp_host" value="{esc(modbus.get("tcp", {}).get("host", "192.168.1.22"))}">
                </div>
                <div class="field">
                  <label>Port</label>
                  <input name="tcp_port" type="number" value="{esc(modbus.get("tcp", {}).get("port", 502))}">
                </div>
                <div class="field">
                  <label>Unit ID</label>
                  <input name="unit_id" type="number" value="{esc(modbus.get("unit_id", 1))}">
                </div>
                <div class="field">
                  <label>Poll</label>
                  <select name="poll_interval_ms">
                    <option value="1000" {selected(interval_ms, 1000)}>1 sec</option>
                    <option value="2000" {selected(interval_ms, 2000)}>2 sec</option>
                    <option value="3000" {selected(interval_ms, 3000)}>3 sec</option>
                    <option value="5000" {selected(interval_ms, 5000)}>5 sec</option>
                    <option value="10000" {selected(interval_ms, 10000)}>10 sec</option>
                  </select>
                </div>
                <div class="field">
                  <label>Agent Source</label>
                  <select name="sensor_source">
                    <option value="dummy" {selected(cfg.get("SENSOR_SOURCE"), "dummy")}>Dummy</option>
                    <option value="modbus" {selected(cfg.get("SENSOR_SOURCE"), "modbus")}>Modbus</option>
                  </select>
                </div>
                <div class="field">
                  <label>RTU Port</label>
                  <input name="rtu_port" value="{esc(modbus.get("rtu", {}).get("port", "/dev/ttyUSB0"))}">
                </div>
                <div class="field">
                  <label>Baudrate</label>
                  <input name="rtu_baudrate" type="number" value="{esc(modbus.get("rtu", {}).get("baudrate", 9600))}">
                </div>
                <div class="field">
                  <label>Parity</label>
                  <select name="rtu_parity">
                    <option value="N" {selected(modbus.get("rtu", {}).get("parity"), "N")}>N</option>
                    <option value="E" {selected(modbus.get("rtu", {}).get("parity"), "E")}>E</option>
                    <option value="O" {selected(modbus.get("rtu", {}).get("parity"), "O")}>O</option>
                  </select>
                </div>
                <div class="field">
                  <label>Stopbits</label>
                  <input name="rtu_stopbits" type="number" value="{esc(modbus.get("rtu", {}).get("stopbits", 1))}">
                </div>
                <div class="field">
                  <label>Timeout</label>
                  <input name="tcp_timeout" type="number" step="0.1" value="{esc(modbus.get("tcp", {}).get("timeout", 3))}">
                </div>
                <div class="field">
                  <label>RTU Timeout</label>
                  <input name="rtu_timeout" type="number" step="0.1" value="{esc(modbus.get("rtu", {}).get("timeout", 3))}">
                </div>
              </div>
              <input type="hidden" name="enabled" value="true">
              <div class="actions">
                <button type="submit">Save Setup</button>
                <button class="secondary" type="submit" name="action" value="save_and_test">Save & Read Once</button>
              </div>
            </div>

            <details open>
              <summary>Advanced Mapping 20 Values · Enabled {enabled_count}/20</summary>
              <div class="map-table-wrap">
                <table class="map-table">
                  <thead>
                    <tr>
                      <th>On</th><th>Metric</th><th>Name</th><th>Unit</th><th>Function</th><th>Addr</th><th>Type</th><th>Cnt</th><th>Scale</th><th>Offset</th><th>Round</th><th>ID</th><th>Byte</th><th>Word</th>
                    </tr>
                  </thead>
                  <tbody>{render_register_rows(registers)}</tbody>
                </table>
              </div>
            </details>
          </div>
        </form>
      </div>

      <aside class="card">
        <div class="card-header">
          <h2>Continuous Read</h2>
          <p>อ่านค่าต่อเนื่องจาก Modbus และแสดงผลทันที</p>
        </div>
        <div class="card-body">
          <div class="read-toolbar">
            <div>
              <strong id="readState">Stopped</strong>
              <div class="small-status" id="readMeta">Poll every {interval_ms / 1000:g}s</div>
            </div>
            <div class="read-buttons">
              <button class="ok" type="button" onclick="startRead()">Start</button>
              <button class="danger" type="button" onclick="stopRead()">Stop</button>
              <button class="secondary" type="button" onclick="readOnce()">Read Once</button>
            </div>
          </div>

          <form class="actions" method="POST" action="/modbus/install">
            <button class="secondary" type="submit">Install Dependencies</button>
          </form>
          <form class="actions" method="POST" action="/restart-agent">
            <button class="warning" type="submit">Restart Agent</button>
          </form>

          <div style="height:16px;"></div>
          <div class="live-grid" id="liveGrid">
            {render_live_cards(registers)}
          </div>
        </div>
      </aside>
    </section>

    <script>
      const pollMs = {interval_ms};
      let timer = null;
      let isReading = false;
      let round = 0;

      function setState(text) {{
        document.getElementById('readState').textContent = text;
      }}

      function setMeta(text) {{
        document.getElementById('readMeta').textContent = text;
      }}

      function formatValue(value) {{
        if (value === undefined || value === null) return '-';
        return String(value);
      }}

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
        isReading = true;
        round += 1;
        setState('Reading...');
        setMeta(`Request #${{round}}`);

        try {{
          const res = await fetch('/api/modbus/read', {{ cache: 'no-store' }});
          const data = await res.json();

          if (data.ok) {{
            updateCards(data);
            setState('Live OK');
            setMeta(`Last read: ${{data.time || data.ui_time || new Date().toLocaleTimeString()}}`);
          }} else {{
            setState('Read Error');
            setMeta(data.error || 'Unknown error');
            updateCards(data);
          }}
        }} catch (err) {{
          setState('Connection Error');
          setMeta(String(err));
        }} finally {{
          isReading = false;
        }}
      }}

      function startRead() {{
        if (timer) return;
        setState('Starting...');
        readOnce();
        timer = setInterval(readOnce, pollMs);
      }}

      function stopRead() {{
        if (timer) clearInterval(timer);
        timer = null;
        setState('Stopped');
        setMeta(`Poll every ${{pollMs / 1000}}s`);
      }}
    </script>
    """
    return shell(content, "modbus", message, message_type)


def settings_page(message="", message_type="info"):
    cfg = read_env()
    content = f"""
    <section class="card">
      <div class="card-header"><h2>Settings</h2><p>ตั้งค่าพื้นฐานของ Agent</p></div>
      <div class="card-body">
        <form method="POST" action="/save">
          <div class="simple-grid">
            <div class="field two"><label>Backend API URL</label><input name="DOTWATCH_API_URL" value="{esc(cfg.get("DOTWATCH_API_URL"))}"></div>
            <div class="field"><label>Device Code</label><input name="DEVICE_CODE" value="{esc(cfg.get("DEVICE_CODE"))}"></div>
            <div class="field"><label>Device Secret</label><input name="DEVICE_SECRET" type="password" value="{esc(cfg.get("DEVICE_SECRET"))}"><div class="hint">{esc(mask_secret(cfg.get("DEVICE_SECRET")))}</div></div>
            <div class="field"><label>Send Interval</label><input name="SEND_INTERVAL_SECONDS" type="number" value="{esc(cfg.get("SEND_INTERVAL_SECONDS"))}"></div>
            <div class="field"><label>Sensor Source</label><select name="SENSOR_SOURCE"><option value="dummy" {selected(cfg.get("SENSOR_SOURCE"), "dummy")}>Dummy</option><option value="modbus" {selected(cfg.get("SENSOR_SOURCE"), "modbus")}>Modbus</option></select></div>
            <div class="field"><label>UI Username</label><input name="CONFIG_UI_USERNAME" value="{esc(cfg.get("CONFIG_UI_USERNAME"))}"></div>
            <div class="field"><label>UI Password</label><input name="CONFIG_UI_PASSWORD" type="password" value="{esc(cfg.get("CONFIG_UI_PASSWORD"))}"></div>
          </div>
          <div class="actions"><button type="submit">Save Settings</button></div>
        </form>
      </div>
    </section>
    """
    return shell(content, "settings", message, message_type)


def status_page(message="", message_type="info"):
    st = system_status()
    content = f"""
    <section class="card">
      <div class="card-header"><h2>Status</h2></div>
      <div class="card-body">
        <div class="block">
          <div class="block-title">Services</div>
          <div class="simple-grid">
            <div class="field"><label>Agent</label><input readonly value="{esc(st["agent"]["active"])}"></div>
            <div class="field"><label>Config UI</label><input readonly value="{esc(st["config_ui"]["active"])}"></div>
            <div class="field two"><label>Primary IP</label><input readonly value="{esc(st["primary_ip"])}"></div>
          </div>
        </div>
      </div>
    </section>
    """
    return shell(content, "status", message, message_type)


def parse_register(form, i):
    data_type = form.get(f"reg_{i}_data_type", "uint16")
    default_count = 2 if data_type in ("float32", "int32", "uint32") else 1

    return {
        "enabled": form.get(f"reg_{i}_enabled") == "true",
        "metric_key": f"metric_{i + 1}",
        "name": form.get(f"reg_{i}_name", f"Metric {i + 1}").strip(),
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
    return f"""<!doctype html><html><head><meta charset="utf-8">{STYLE}</head><body><main class="main" style="max-width:760px;margin:0 auto;"><section class="card"><div class="card-header"><h2>Logged out</h2></div><div class="card-body"><div class="notice warning">บาง browser จะจำ Basic Auth ไว้จนกว่าจะปิดแท็บหรือปิด browser</div><a class="button-link secondary" href="/">Login again</a></div></section></main></body></html>""".encode("utf-8")


class Handler(BaseHTTPRequestHandler):
    server_version = f"dotWatchPiConfig/{APP_VERSION}"

    def is_authorized(self):
        cfg = read_env()
        username = cfg.get("CONFIG_UI_USERNAME", "admin")
        password = cfg.get("CONFIG_UI_PASSWORD", "change-this-config-password")
        header = self.headers.get("Authorization", "")
        if not header.startswith("Basic "):
            return False
        try:
            decoded = base64.b64decode(header.split(" ", 1)[1].strip()).decode("utf-8")
            supplied_username, supplied_password = decoded.split(":", 1)
            return supplied_username == username and supplied_password == password
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

    def send_html(self, page="modbus", message="", message_type="info"):
        if not self.is_authorized():
            self.require_auth()
            return
        pages = {"settings": settings_page, "status": status_page, "modbus": modbus_page}
        body = pages.get(page, modbus_page)(message, message_type)
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(body)

    def read_form(self):
        length = int(self.headers.get("Content-Length", "0") or "0")
        body = self.rfile.read(length).decode("utf-8")
        parsed = parse_qs(body)
        return {key: values[0] if values else "" for key, values in parsed.items()}

    def do_GET(self):
        if self.path == "/health":
            self.send_json({"ok": True, "version": APP_VERSION})
            return

        if self.path == "/api/modbus/read":
            if not self.is_authorized():
                self.send_json({"ok": False, "error": "Authentication required"}, 401)
                return
            ok, data = test_modbus()
            self.send_json(data, 200)
            return

        if self.path == "/logout":
            self.send_response(401)
            self.send_header("WWW-Authenticate", f'Basic realm="dotWatch Pi Config Logout {int(time.time())}"')
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(logout_page())
            return

        if self.path == "/" or self.path.startswith("/?"):
            self.send_html("settings")
            return
        if self.path.startswith("/status"):
            self.send_html("status")
            return
        if self.path.startswith("/modbus"):
            self.send_html("modbus")
            return

        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        if not self.is_authorized():
            self.require_auth()
            return

        if self.path == "/save":
            form = self.read_form()
            cfg = read_env()
            cfg.update(form)
            cfg["MODBUS_CONFIG_PATH"] = str(MODBUS_CONFIG_PATH)
            write_env(cfg)
            self.send_html("settings", "Saved settings successfully.", "success")
            return

        if self.path == "/restart-agent":
            result = run_cmd(["sudo", "-n", "systemctl", "restart", "dotwatch-pi-agent"], timeout=12)
            self.send_html("modbus", "Agent restarted successfully." if result["ok"] else "Restart failed: " + result["output"], "success" if result["ok"] else "danger")
            return

        if self.path == "/modbus/install":
            ok, output = install_requirements()
            self.send_html("modbus", ("Install success: " if ok else "Install failed: ") + output[:1200], "success" if ok else "danger")
            return

        if self.path == "/modbus/save-table":
            form = self.read_form()
            try:
                config = {
                    "enabled": True,
                    "mode": form.get("mode", "tcp"),
                    "unit_id": int(form.get("unit_id", 1)),
                    "poll_interval_ms": int(form.get("poll_interval_ms", 3000) or 3000),
                    "tcp": {
                        "host": form.get("tcp_host", "192.168.1.22"),
                        "port": int(form.get("tcp_port", 502)),
                        "timeout": float(form.get("tcp_timeout", 3)),
                    },
                    "rtu": {
                        "port": form.get("rtu_port", "/dev/ttyUSB0"),
                        "baudrate": int(form.get("rtu_baudrate", 9600)),
                        "parity": form.get("rtu_parity", "N"),
                        "stopbits": int(form.get("rtu_stopbits", 1)),
                        "bytesize": 8,
                        "timeout": float(form.get("rtu_timeout", 3)),
                    },
                    "registers": [parse_register(form, i) for i in range(20)],
                }
                write_modbus_config(config)

                cfg = read_env()
                cfg["SENSOR_SOURCE"] = form.get("sensor_source", "dummy")
                cfg["MODBUS_CONFIG_PATH"] = str(MODBUS_CONFIG_PATH)
                write_env(cfg)

                if form.get("action") == "save_and_test":
                    ok, data = test_modbus()
                    self.send_html("modbus", "Saved and read success." if ok else "Saved but read failed.", "success" if ok else "danger")
                else:
                    self.send_html("modbus", "Saved Modbus setup successfully.", "success")
            except Exception as error:
                self.send_html("modbus", "Save failed: " + str(error), "danger")
            return

        self.send_response(404)
        self.end_headers()


def main():
    print(f"dotWatch Pi Config UI started on http://{HOST}:{PORT}")
    print(f"Version: {APP_VERSION}")
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
