#!/usr/bin/env python3
import base64
import html
import json
import os
import subprocess
import urllib.error
import urllib.request
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs


PROJECT_DIR = Path(os.getenv("DOTWATCH_AGENT_DIR", "/home/pi/dotwatch-pi-agent"))
ENV_PATH = PROJECT_DIR / ".env"
HOST = os.getenv("DOTWATCH_CONFIG_HOST", "0.0.0.0")
PORT = int(os.getenv("DOTWATCH_CONFIG_PORT", "8080"))

DEFAULTS = {
    "DOTWATCH_API_URL": "https://dotwatch-backend.onrender.com",
    "DEVICE_CODE": "",
    "DEVICE_SECRET": "",
    "SEND_INTERVAL_SECONDS": "5",
    "FIRMWARE_VERSION": "rpi-agent-0.1.0",
    "CONFIG_UI_USERNAME": "admin",
    "CONFIG_UI_PASSWORD": "change-this-config-password",
}


def read_env(path=ENV_PATH):
    data = DEFAULTS.copy()

    if not path.exists():
        return data

    for line in path.read_text(encoding="utf-8").splitlines():
        raw = line.strip()

        if not raw or raw.startswith("#") or "=" not in raw:
            continue

        key, value = raw.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")

        if key:
            data[key] = value

    return data


def write_env(values, path=ENV_PATH):
    path.parent.mkdir(parents=True, exist_ok=True)

    allowed_keys = [
        "DOTWATCH_API_URL",
        "DEVICE_CODE",
        "DEVICE_SECRET",
        "SEND_INTERVAL_SECONDS",
        "FIRMWARE_VERSION",
        "CONFIG_UI_USERNAME",
        "CONFIG_UI_PASSWORD",
    ]

    lines = [
        "# dotWatch Raspberry Pi Agent settings",
        f"# Updated at {datetime.now().isoformat(timespec='seconds')}",
        "",
    ]

    for key in allowed_keys:
        value = str(values.get(key, "")).strip()
        lines.append(f"{key}={value}")

    lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def mask_secret(value):
    if not value:
        return "Not set"

    if len(value) <= 6:
        return "******"

    return f"{value[:3]}{'*' * max(len(value) - 6, 6)}{value[-3:]}"


def run_cmd(args, timeout=8):
    try:
        completed = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )

        output = (completed.stdout or completed.stderr or "").strip()

        return {
            "ok": completed.returncode == 0,
            "code": completed.returncode,
            "output": output,
        }

    except Exception as error:
        return {
            "ok": False,
            "code": -1,
            "output": str(error),
        }


def get_agent_status():
    active = run_cmd(["systemctl", "is-active", "dotwatch-pi-agent"])
    enabled = run_cmd(["systemctl", "is-enabled", "dotwatch-pi-agent"])
    logs = run_cmd(
        ["journalctl", "-u", "dotwatch-pi-agent", "-n", "20", "--no-pager"],
        timeout=8,
    )

    return {
        "active": active["output"] or "unknown",
        "enabled": enabled["output"] or "unknown",
        "logs": logs["output"] or "No logs yet",
    }


def test_ingest(config):
    api_url = config.get("DOTWATCH_API_URL", "").rstrip("/")
    device_code = config.get("DEVICE_CODE", "")
    device_secret = config.get("DEVICE_SECRET", "")
    firmware_version = config.get("FIRMWARE_VERSION", "rpi-agent-0.1.0")

    if not api_url or not device_code or not device_secret:
        return False, "Missing API URL, Device Code, or Device Secret."

    url = f"{api_url}/api/ingest"

    metrics = {
        "metric_1": 26.55,
        "metric_2": 61.25,
        "metric_3": 220.10,
    }

    payload = {
        "device_code": device_code,
        "device_secret": device_secret,
        "deviceCode": device_code,
        "deviceSecret": device_secret,
        "secret": device_secret,
        "firmware_version": firmware_version,
        "firmwareVersion": firmware_version,
        "metrics": metrics,
        **metrics,
    }

    data = json.dumps(payload).encode("utf-8")

    request = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "x-device-code": device_code,
            "x-device-secret": device_secret,
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            body = response.read().decode("utf-8")
            return True, body or '{"ok": true}'

    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8")
        return False, f"HTTP {error.code}: {body}"

    except urllib.error.URLError as error:
        return False, f"Network error: {error.reason}"

    except Exception as error:
        return False, str(error)


def esc(value):
    return html.escape(str(value or ""), quote=True)


def render_page(message="", message_type="info"):
    config = read_env()
    status = get_agent_status()

    active_class = "online" if status["active"] == "active" else "offline"
    secret_mask = mask_secret(config.get("DEVICE_SECRET", ""))

    message_html = ""
    if message:
        message_html = f'<div class="notice {esc(message_type)}">{esc(message)}</div>'

    password_warning = ""
    if config.get("CONFIG_UI_PASSWORD") == "change-this-config-password":
        password_warning = """
        <div class="notice danger">
          <strong>Security warning:</strong>
          CONFIG_UI_PASSWORD ยังเป็นค่าเริ่มต้น กรุณาเปลี่ยนรหัสผ่านหน้านี้ทันที
        </div>
        """

    return f"""<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>dotWatch Pi Config</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #080b12;
      --panel: #101622;
      --panel-soft: #151d2b;
      --card: #111827;
      --card-2: #0f172a;
      --border: rgba(148, 163, 184, 0.16);
      --text: #e5e7eb;
      --muted: #94a3b8;
      --muted-2: #64748b;
      --accent: #ef4444;
      --accent-2: #f97316;
      --green: #22c55e;
      --yellow: #f59e0b;
      --red: #ef4444;
      --shadow: 0 18px 60px rgba(0, 0, 0, 0.38);
      --radius-xl: 26px;
      --radius-lg: 18px;
      --radius-md: 14px;
    }}

    * {{
      box-sizing: border-box;
    }}

    body {{
      margin: 0;
      min-height: 100vh;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(239, 68, 68, 0.20), transparent 34rem),
        radial-gradient(circle at top right, rgba(59, 130, 246, 0.12), transparent 30rem),
        linear-gradient(135deg, #080b12 0%, #0b1020 50%, #080b12 100%);
    }}

    .shell {{
      width: min(1180px, calc(100% - 32px));
      margin: 0 auto;
      padding: 30px 0 44px;
    }}

    .topbar {{
      display: flex;
      justify-content: space-between;
      gap: 18px;
      align-items: flex-start;
      margin-bottom: 22px;
    }}

    .brand {{
      display: flex;
      gap: 14px;
      align-items: center;
    }}

    .logo {{
      width: 48px;
      height: 48px;
      border-radius: 16px;
      background:
        linear-gradient(135deg, rgba(239, 68, 68, 1), rgba(249, 115, 22, 0.85)),
        #ef4444;
      display: grid;
      place-items: center;
      box-shadow: 0 16px 38px rgba(239, 68, 68, 0.26);
      font-weight: 900;
      letter-spacing: -0.08em;
    }}

    .brand h1 {{
      margin: 0;
      font-size: clamp(1.45rem, 2.2vw, 2.15rem);
      line-height: 1.05;
      letter-spacing: -0.045em;
    }}

    .brand p {{
      margin: 6px 0 0;
      color: var(--muted);
      font-size: 0.94rem;
    }}

    .pill {{
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border: 1px solid var(--border);
      background: rgba(15, 23, 42, 0.72);
      color: var(--muted);
      border-radius: 999px;
      padding: 10px 14px;
      font-size: 0.86rem;
      white-space: nowrap;
    }}

    .dot {{
      width: 9px;
      height: 9px;
      border-radius: 999px;
      background: var(--green);
      box-shadow: 0 0 0 5px rgba(34, 197, 94, 0.12);
    }}

    .dot.offline {{
      background: var(--red);
      box-shadow: 0 0 0 5px rgba(239, 68, 68, 0.12);
    }}

    .grid {{
      display: grid;
      grid-template-columns: 1.45fr 0.9fr;
      gap: 18px;
      align-items: start;
    }}

    .panel {{
      background: linear-gradient(180deg, rgba(17, 24, 39, 0.92), rgba(15, 23, 42, 0.88));
      border: 1px solid var(--border);
      border-radius: var(--radius-xl);
      box-shadow: var(--shadow);
      overflow: hidden;
    }}

    .panel-header {{
      padding: 22px 24px 18px;
      border-bottom: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.02);
    }}

    .panel-header h2 {{
      margin: 0;
      font-size: 1.05rem;
      letter-spacing: -0.02em;
    }}

    .panel-header p {{
      margin: 8px 0 0;
      color: var(--muted);
      font-size: 0.9rem;
      line-height: 1.55;
    }}

    .panel-body {{
      padding: 22px 24px 24px;
    }}

    .form-grid {{
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }}

    .field {{
      display: flex;
      flex-direction: column;
      gap: 8px;
    }}

    .field.full {{
      grid-column: 1 / -1;
    }}

    label {{
      color: #cbd5e1;
      font-size: 0.82rem;
      font-weight: 700;
      letter-spacing: 0.01em;
    }}

    input {{
      width: 100%;
      border: 1px solid rgba(148, 163, 184, 0.18);
      background: rgba(2, 6, 23, 0.45);
      color: var(--text);
      border-radius: 14px;
      padding: 13px 14px;
      font-size: 0.95rem;
      outline: none;
      transition: border 160ms ease, box-shadow 160ms ease, background 160ms ease;
    }}

    input:focus {{
      border-color: rgba(239, 68, 68, 0.72);
      box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.12);
      background: rgba(2, 6, 23, 0.72);
    }}

    .hint {{
      color: var(--muted-2);
      font-size: 0.78rem;
      line-height: 1.45;
    }}

    .actions {{
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 18px;
    }}

    button {{
      border: 0;
      border-radius: 14px;
      padding: 12px 16px;
      color: white;
      cursor: pointer;
      font-weight: 800;
      letter-spacing: -0.01em;
      background: linear-gradient(135deg, var(--accent), var(--accent-2));
      box-shadow: 0 14px 30px rgba(239, 68, 68, 0.20);
    }}

    button.secondary {{
      background: rgba(148, 163, 184, 0.10);
      color: var(--text);
      border: 1px solid var(--border);
      box-shadow: none;
    }}

    button.warning {{
      background: rgba(245, 158, 11, 0.14);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.25);
      box-shadow: none;
    }}

    .status-grid {{
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }}

    .stat {{
      background: rgba(2, 6, 23, 0.36);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 15px;
    }}

    .stat span {{
      color: var(--muted);
      font-size: 0.78rem;
    }}

    .stat strong {{
      display: block;
      margin-top: 8px;
      font-size: 1.05rem;
      letter-spacing: -0.02em;
      overflow-wrap: anywhere;
    }}

    .secret {{
      color: #fca5a5;
    }}

    .notice {{
      border-radius: 16px;
      padding: 14px 16px;
      margin-bottom: 16px;
      border: 1px solid var(--border);
      background: rgba(59, 130, 246, 0.10);
      color: #bfdbfe;
      line-height: 1.5;
    }}

    .notice.success {{
      background: rgba(34, 197, 94, 0.10);
      border-color: rgba(34, 197, 94, 0.22);
      color: #bbf7d0;
    }}

    .notice.danger {{
      background: rgba(239, 68, 68, 0.10);
      border-color: rgba(239, 68, 68, 0.22);
      color: #fecaca;
    }}

    .notice.warning {{
      background: rgba(245, 158, 11, 0.10);
      border-color: rgba(245, 158, 11, 0.22);
      color: #fde68a;
    }}

    pre {{
      margin: 0;
      padding: 16px;
      border-radius: 18px;
      border: 1px solid var(--border);
      background: rgba(2, 6, 23, 0.50);
      color: #cbd5e1;
      overflow: auto;
      max-height: 360px;
      font-size: 0.78rem;
      line-height: 1.55;
    }}

    .footer {{
      margin-top: 18px;
      color: var(--muted-2);
      font-size: 0.8rem;
      text-align: center;
    }}

    @media (max-width: 900px) {{
      .topbar {{
        flex-direction: column;
      }}

      .grid {{
        grid-template-columns: 1fr;
      }}

      .form-grid {{
        grid-template-columns: 1fr;
      }}
    }}
  </style>
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <div class="brand">
        <div class="logo">d</div>
        <div>
          <h1>dotWatch Pi Config</h1>
          <p>Raspberry Pi Gateway configuration panel</p>
        </div>
      </div>

      <div class="pill">
        <span class="dot {'' if active_class == 'online' else 'offline'}"></span>
        Agent: {esc(status["active"])}
      </div>
    </header>

    {message_html}
    {password_warning}

    <section class="grid">
      <form class="panel" method="POST" action="/save">
        <div class="panel-header">
          <h2>Device & Backend Settings</h2>
          <p>ตั้งค่า Raspberry Pi Agent ให้ส่งข้อมูลเข้า dotWatch Backend และบันทึกลงไฟล์ <strong>{esc(str(ENV_PATH))}</strong></p>
        </div>

        <div class="panel-body">
          <div class="form-grid">
            <div class="field full">
              <label>Backend API URL</label>
              <input name="DOTWATCH_API_URL" value="{esc(config.get("DOTWATCH_API_URL"))}" placeholder="https://dotwatch-backend.onrender.com">
              <div class="hint">ถ้า backend อยู่ใน LAN ให้ใช้ IP เครื่อง backend ห้ามใช้ localhost</div>
            </div>

            <div class="field">
              <label>Device Code</label>
              <input name="DEVICE_CODE" value="{esc(config.get("DEVICE_CODE"))}" placeholder="DW-261103731">
            </div>

            <div class="field">
              <label>Device Secret</label>
              <input name="DEVICE_SECRET" type="password" value="{esc(config.get("DEVICE_SECRET"))}" placeholder="Device secret">
              <div class="hint">Current: <span class="secret">{esc(secret_mask)}</span></div>
            </div>

            <div class="field">
              <label>Send Interval Seconds</label>
              <input name="SEND_INTERVAL_SECONDS" type="number" min="1" value="{esc(config.get("SEND_INTERVAL_SECONDS"))}">
            </div>

            <div class="field">
              <label>Firmware Version</label>
              <input name="FIRMWARE_VERSION" value="{esc(config.get("FIRMWARE_VERSION"))}">
            </div>

            <div class="field">
              <label>Config UI Username</label>
              <input name="CONFIG_UI_USERNAME" value="{esc(config.get("CONFIG_UI_USERNAME"))}">
            </div>

            <div class="field">
              <label>Config UI Password</label>
              <input name="CONFIG_UI_PASSWORD" type="password" value="{esc(config.get("CONFIG_UI_PASSWORD"))}">
            </div>
          </div>

          <div class="actions">
            <button type="submit">Save Settings</button>
          </div>
        </div>
      </form>

      <aside class="panel">
        <div class="panel-header">
          <h2>Agent Control</h2>
          <p>ดูสถานะ dotWatch Pi Agent และทดสอบส่งค่าจำลองเข้า backend</p>
        </div>

        <div class="panel-body">
          <div class="status-grid">
            <div class="stat">
              <span>Status</span>
              <strong>{esc(status["active"])}</strong>
            </div>
            <div class="stat">
              <span>Enabled</span>
              <strong>{esc(status["enabled"])}</strong>
            </div>
            <div class="stat">
              <span>Device</span>
              <strong>{esc(config.get("DEVICE_CODE") or "Not set")}</strong>
            </div>
            <div class="stat">
              <span>Interval</span>
              <strong>{esc(config.get("SEND_INTERVAL_SECONDS"))}s</strong>
            </div>
          </div>

          <form class="actions" method="POST" action="/test-ingest">
            <button class="secondary" type="submit">Test Ingest</button>
          </form>

          <form class="actions" method="POST" action="/restart-agent">
            <button class="warning" type="submit">Restart Agent</button>
          </form>
        </div>
      </aside>
    </section>

    <section class="panel" style="margin-top:18px;">
      <div class="panel-header">
        <h2>Latest Agent Logs</h2>
        <p>ดู log ล่าสุดจาก systemd service: dotwatch-pi-agent</p>
      </div>
      <div class="panel-body">
        <pre>{esc(status["logs"])}</pre>
      </div>
    </section>

    <div class="footer">
      dotWatch Raspberry Pi Config UI · Local network only
    </div>
  </main>
</body>
</html>
""".encode("utf-8")


class Handler(BaseHTTPRequestHandler):
    server_version = "dotWatchPiConfig/0.1"

    def log_message(self, fmt, *args):
        print(f"[{datetime.now().isoformat(timespec='seconds')}] {self.address_string()} {fmt % args}")

    def is_authorized(self):
        config = read_env()
        username = config.get("CONFIG_UI_USERNAME", "admin")
        password = config.get("CONFIG_UI_PASSWORD", "change-this-config-password")

        header = self.headers.get("Authorization", "")
        if not header.startswith("Basic "):
            return False

        try:
            token = header.split(" ", 1)[1].strip()
            decoded = base64.b64decode(token).decode("utf-8")
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

    def send_html(self, message="", message_type="info"):
        if not self.is_authorized():
            self.require_auth()
            return

        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(render_page(message, message_type))

    def read_form(self):
        length = int(self.headers.get("Content-Length", "0") or "0")
        body = self.rfile.read(length).decode("utf-8")
        parsed = parse_qs(body)

        return {
            key: values[0] if values else ""
            for key, values in parsed.items()
        }

    def do_GET(self):
        if self.path == "/" or self.path.startswith("/?"):
            self.send_html()
            return

        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        if not self.is_authorized():
            self.require_auth()
            return

        if self.path == "/save":
            form = self.read_form()
            current = read_env()
            current.update(form)

            try:
                interval = int(current.get("SEND_INTERVAL_SECONDS", "5"))
                if interval < 1:
                    raise ValueError
                current["SEND_INTERVAL_SECONDS"] = str(interval)
            except ValueError:
                self.send_html("Send interval must be a number greater than 0.", "danger")
                return

            write_env(current)
            self.send_html("Saved settings successfully. Restart agent to apply changes.", "success")
            return

        if self.path == "/restart-agent":
            result = run_cmd(["sudo", "-n", "systemctl", "restart", "dotwatch-pi-agent"], timeout=12)

            if result["ok"]:
                self.send_html("Agent restarted successfully.", "success")
            else:
                self.send_html(
                    "Restart failed. Run manually: sudo systemctl restart dotwatch-pi-agent. Detail: "
                    + result["output"],
                    "warning",
                )
            return

        if self.path == "/test-ingest":
            ok, output = test_ingest(read_env())
            if ok:
                self.send_html("Test ingest success: " + output[:600], "success")
            else:
                self.send_html("Test ingest failed: " + output[:600], "danger")
            return

        self.send_response(404)
        self.end_headers()


def main():
    print(f"dotWatch Pi Config UI started on http://{HOST}:{PORT}")
    print(f"Project dir: {PROJECT_DIR}")
    print(f"Env path: {ENV_PATH}")

    server = ThreadingHTTPServer((HOST, PORT), Handler)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Stopped by user")


if __name__ == "__main__":
    main()
