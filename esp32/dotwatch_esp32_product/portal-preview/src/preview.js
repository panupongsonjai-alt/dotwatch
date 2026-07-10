import { mockNetworks, mockStatus } from "./mock-device.js";

const POLL_INTERVAL_MS = 2000;
const state = {
  useMock: localStorage.getItem("dotwatch.preview.mock") === "true",
  lastStatus: null,
  polling: false,
  timer: null,
  toastTimer: null
};

const byId = (id) => document.getElementById(id);
const setText = (id, value, fallback = "—") => {
  const element = byId(id);
  if (element) element.textContent = value === undefined || value === null || value === "" ? fallback : String(value);
};


function openDashboardPage(pageId, updateHash = true) {
  const target = byId(pageId) || byId("overview");
  if (!target) return;

  document.querySelectorAll(".dashboard-page").forEach((page) => {
    page.classList.toggle("is-active", page === target);
  });

  document.querySelectorAll("[data-page-target]").forEach((item) => {
    const active = item.dataset.pageTarget === target.id;
    item.classList.toggle("is-active", active);
    if (item.classList.contains("portal-nav-item")) item.setAttribute("aria-current", active ? "page" : "false");
  });

  const nav = document.querySelector(`.portal-nav-item[data-page-target="${target.id}"]`);
  setText("portalPageTitle", nav?.dataset.pageTitle || target.dataset.pageTitle || "ESP32 Dashboard");
  setText("portalPageSubtitle", nav?.dataset.pageSubtitle || "Local Device Console");
  document.body.classList.remove("nav-open");
  if (updateHash && window.location.hash !== `#${target.id}`) history.replaceState(null, "", `#${target.id}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function stateClass(appState) {
  const normalized = String(appState || "").toUpperCase();
  if (normalized === "ONLINE") return "ok";
  if (["DEGRADED", "RECOVERY"].includes(normalized)) return "bad";
  return "warn";
}

function pinQuery() {
  const pin = byId("previewPin")?.value.trim() || "";
  return pin ? `?pin=${encodeURIComponent(pin)}` : "";
}

function showToast(message) {
  const toast = byId("previewToast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

function setConnection(mode, text) {
  const element = byId("previewConnection");
  if (!element) return;
  element.className = `preview-connection ${mode}`;
  element.textContent = text;
}

function badgeClassForState(appState) {
  const normalized = String(appState || "").toUpperCase();
  if (normalized === "ONLINE") return "ok";
  if (["DEGRADED", "RECOVERY", "CONNECTING_WIFI", "CONNECTING_BACKEND"].includes(normalized)) return "warn";
  return "bad";
}

function updateBadge(id, text, className) {
  const element = byId(id);
  if (!element) return;
  element.className = `badge ${className}`;
  element.textContent = text;
}

function backendStatusText(data) {
  if (Number(data.lastHttpStatus) >= 200 && Number(data.lastHttpStatus) < 300) return `${data.lastHttpStatus} · ONLINE`;
  if (data.lastSendError) return data.lastSendError;
  if (data.lastSendStatus) return data.lastSendStatus;
  return data.state === "ONLINE" ? "Connected" : "Waiting";
}

function hasSensorNumber(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function applySensorStatus(data) {
  const hasTemperature = hasSensorNumber(data.temperature);
  const hasHumidity = hasSensorNumber(data.humidity);
  const available = data.sensorReadingAvailable !== false && hasTemperature && hasHumidity;

  setText("sensorTemperature", available ? Number(data.temperature).toFixed(1) : "--");
  setText("sensorHumidity", available ? Number(data.humidity).toFixed(1) : "--");

  if (data.lastSensorError) {
    setText("sensorLiveStatus", "ยังอ่านค่า Sensor ไม่สำเร็จ");
    return;
  }

  const age = Number(data.sensorReadingAgeSeconds);
  setText(
    "sensorLiveStatus",
    available && Number.isFinite(age)
      ? `ค่าล่าสุดจาก Sensor · ${Math.max(0, Math.round(age))} วินาทีที่แล้ว`
      : available
        ? "ค่าล่าสุดจาก Sensor · อัปเดตอัตโนมัติ"
        : "กำลังรอค่าจาก Sensor"
  );
}

function applyStatus(data) {
  state.lastStatus = data;

  setText("firmwareVersion", data.firmwareVersion);
  setText("statusReadiness", data.readiness || (data.state === "ONLINE" ? "5/5 พร้อมใช้งาน" : "4/5 พร้อมใช้งาน"));
  setText("statusWifi", data.wifiSsid, data.wifiConnected ? "Connected" : "Disconnected");
  setText("statusIp", data.ip);
  setText("statusSignal", Number.isFinite(Number(data.rssi)) ? `${data.rssi} dBm` : "—");
  setText("statusDeviceCode", data.deviceCode, "ยังไม่ได้ตั้ง");
  setText("statusBackend", backendStatusText(data));
  setText("statusLastSend", data.lastHttpStatus ? `HTTP ${data.lastHttpStatus}` : data.lastSendStatus);
  setText("statusUptime", data.uptime);
  setText("currentWifi", data.wifiSsid, "ยังไม่ได้ตั้ง");
  setText("currentIp", data.ip);
  setText("rememberedWifi", `${Number(data.rememberedWifiProfiles || 0)} networks`);
  setText("sidebarDeviceCode", data.deviceCode, "ยังไม่ได้ตั้ง Device");
  setText("sidebarDeviceIp", data.ip, "ยังไม่มี IP");
  setText("deviceCode", data.deviceCode);
  setText("deviceSecretMasked", `Secret ปัจจุบัน: ${data.deviceSecretMasked || "ยังไม่ได้ตั้ง"}`);
  setText("tlsInfo", `TLS: ${data.tlsMode || "—"} · Source: ${data.tlsCaSource || "—"}`);
  setText("healthWifi", data.wifiConnected ? "Connected" : "Disconnected");
  setText("healthBackend", backendStatusText(data));
  setText("healthSensor", data.sensorReadingAvailable === false ? "Waiting" : "Available");
  setText("healthTls", data.tlsCaSource || "—");

  const apiUrl = byId("apiUrl");
  if (apiUrl && document.activeElement !== apiUrl && data.apiUrl) apiUrl.value = data.apiUrl;

  const wifiSsid = byId("wifiSsid");
  if (wifiSsid && document.activeElement !== wifiSsid && data.wifiSsid) wifiSsid.value = data.wifiSsid;

  applySensorStatus(data);

  const sendInterval = byId("sendInterval");
  if (sendInterval && data.sendIntervalSeconds) {
    [...sendInterval.options].forEach((option) => {
      option.selected = option.textContent.trim() === `${data.sendIntervalSeconds} sec`;
    });
  }

  const appState = data.state || "UNKNOWN";
  const appClass = badgeClassForState(appState);
  updateBadge("appStateBadge", appState, appClass);
  updateBadge("headerStateBadge", appState, appClass);
  updateBadge("wifiBadge", data.wifiConnected ? "Connected" : "Disconnected", data.wifiConnected ? "ok" : "warn");
  updateBadge("deviceBadge", data.deviceCode ? "Configured" : "Required", data.deviceCode ? "ok" : "warn");

  const sidebarDot = byId("sidebarStateDot");
  if (sidebarDot) sidebarDot.className = `sidebar-status-dot ${stateClass(appState)}`;

  const healthRows = {
    healthWifi: data.wifiConnected ? "ok" : "bad",
    healthBackend: Number(data.lastHttpStatus) >= 200 && Number(data.lastHttpStatus) < 300 ? "ok" : "bad",
    healthSensor: data.sensorReadingAvailable === false ? "warn" : "ok",
    healthTls: data.tlsCaSource ? "ok" : "warn"
  };
  Object.entries(healthRows).forEach(([id, className]) => {
    const dot = byId(id)?.closest(".health-row")?.querySelector(".health-dot");
    if (dot) dot.className = `health-dot ${className}`;
  });
}

async function fetchDeviceJson(path) {
  const response = await fetch(`/device-api${path}${pinQuery()}`, {
    cache: "no-store",
    headers: { Accept: "application/json" }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function refreshStatus({ notify = false } = {}) {
  if (state.polling) return;
  state.polling = true;

  try {
    if (state.useMock) {
      const dynamic = {
        ...mockStatus,
        uptime: `${12 + Math.floor((Date.now() / 1000) % 50)}m ${Math.floor((Date.now() / 1000) % 60)}s`,
        rssi: -50 - Math.floor(Math.random() * 9),
        temperature: 32.3 + Math.sin(Date.now() / 9000) * 0.3,
        humidity: 37.0 + Math.cos(Date.now() / 11000) * 0.5,
        sensorReadingAgeSeconds: Math.floor((Date.now() / 1000) % 4)
      };
      applyStatus(dynamic);
      setConnection("is-mock", "Mock data");
    } else {
      const data = await fetchDeviceJson("/json");
      applyStatus(data);

      if (data.localAdminProtected && !data.deviceCode) {
        setConnection("is-loading", "ใส่ PIN เพื่อดูข้อมูลเต็ม");
      } else {
        setConnection("is-online", "เชื่อม ESP32 แล้ว");
      }
    }

    if (notify) showToast("อัปเดตสถานะแล้ว");
  } catch (error) {
    setConnection("is-offline", error.status === 403 ? "PIN ไม่ถูกต้อง" : "เชื่อม ESP32 ไม่ได้");
    if (!state.lastStatus) applyStatus(mockStatus);
    if (notify) showToast(error.message || "ไม่สามารถอ่านสถานะจาก ESP32");
  } finally {
    state.polling = false;
  }
}

function wifiQualityClass(quality) {
  if (quality >= 75) return "q4";
  if (quality >= 50) return "q3";
  if (quality >= 25) return "q2";
  return "q1";
}

function makeTag(text, className = "") {
  const tag = document.createElement("span");
  tag.className = `tag ${className}`;
  tag.textContent = text;
  return tag;
}

function selectWifi(item, button) {
  const input = byId("wifiSsid");
  const password = byId("wifiPassword");
  if (input) input.value = item.ssid;
  document.querySelectorAll(".network").forEach((element) => element.classList.remove("selected"));
  button?.classList.add("selected");
  setText("selectedWifi", `เลือกแล้ว: ${item.ssid}${item.secure ? " · ต้องใช้รหัสผ่าน" : " · เครือข่าย Open"}`);
  password?.focus();
}

function renderNetworks(networks) {
  const list = byId("networkList");
  if (!list) return;
  list.innerHTML = "";

  if (!networks.length) {
    list.innerHTML = '<div class="empty">ไม่พบ Wi-Fi ลองกดสแกนใหม่ หรือกรอกชื่อ SSID เอง</div>';
    return;
  }

  networks.forEach((item) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "network";
    row.addEventListener("click", () => selectWifi(item, row));

    const signal = document.createElement("span");
    signal.className = `signal ${wifiQualityClass(item.quality)}`;
    for (let index = 0; index < 4; index += 1) signal.appendChild(document.createElement("i"));

    const main = document.createElement("span");
    const name = document.createElement("span");
    name.className = "network-name";
    name.textContent = item.ssid;

    const meta = document.createElement("span");
    meta.className = "network-meta";
    meta.appendChild(makeTag(item.secure ? "มีรหัสผ่าน" : "Open"));
    if (item.current) meta.appendChild(makeTag("กำลังใช้", "current"));
    if (item.remembered) meta.appendChild(makeTag("จำไว้แล้ว", "saved"));

    main.append(name, meta);

    const rssi = document.createElement("span");
    rssi.className = "rssi";
    rssi.textContent = `${item.rssi} dBm`;

    row.append(signal, main, rssi);
    list.appendChild(row);
  });
}

async function scanWifi() {
  const button = byId("scanButton");
  if (button) button.disabled = true;
  setText("scanStatus", "กำลังสแกน Wi-Fi รอบตัว ESP32...");

  try {
    const networks = state.useMock ? mockNetworks : (await fetchDeviceJson("/wifi-scan")).networks || [];
    renderNetworks(networks);
    setText("scanStatus", `พบ ${networks.length} เครือข่าย · เลือกชื่อที่ต้องการ`);
  } catch (error) {
    renderNetworks([]);
    setText("scanStatus", error.status === 403 ? "กรอก Local Admin PIN เพื่อสแกน Wi-Fi" : error.message);
  } finally {
    if (button) button.disabled = false;
  }
}

function togglePassword() {
  const input = byId("wifiPassword");
  const button = byId("passwordToggle");
  if (!input || !button) return;
  const isVisible = input.type === "text";
  input.type = isVisible ? "password" : "text";
  button.textContent = isVisible ? "แสดง" : "ซ่อน";
}

function showJson() {
  const dialog = byId("jsonDialog");
  setText("jsonOutput", JSON.stringify(state.lastStatus || mockStatus, null, 2));
  if (dialog?.showModal) dialog.showModal();
}

function handlePreviewAction(action) {
  switch (action) {
    case "refresh":
      refreshStatus({ notify: true });
      break;
    case "json":
      showJson();
      break;
    case "sensor":
      showToast("Preview mode: การอ่าน Sensor จริงยังทำผ่านหน้า ESP32");
      break;
    case "restart":
      showToast("Preview mode: ไม่ส่งคำสั่ง Restart ไปยัง ESP32");
      break;
    case "reset":
      showToast("Preview mode: ปิดการทำงาน Factory Reset เพื่อความปลอดภัย");
      break;
    default:
      break;
  }
}

function bindEvents() {
  document.querySelectorAll("[data-page-target]").forEach((element) => {
    element.addEventListener("click", (event) => {
      event.preventDefault();
      openDashboardPage(element.dataset.pageTarget);
    });
  });
  byId("portalMenuButton")?.addEventListener("click", () => document.body.classList.toggle("nav-open"));
  byId("portalOverlay")?.addEventListener("click", () => document.body.classList.remove("nav-open"));
  window.addEventListener("hashchange", () => openDashboardPage(window.location.hash.replace("#", "") || "overview", false));
  byId("previewRefresh")?.addEventListener("click", () => refreshStatus({ notify: true }));
  byId("previewMockToggle")?.addEventListener("click", (event) => {
    state.useMock = !state.useMock;
    localStorage.setItem("dotwatch.preview.mock", String(state.useMock));
    event.currentTarget.setAttribute("aria-pressed", String(state.useMock));
    event.currentTarget.textContent = state.useMock ? "ใช้ ESP32 จริง" : "ใช้ Mock Data";
    refreshStatus({ notify: true });
    scanWifi();
  });

  byId("previewPin")?.addEventListener("input", (event) => {
    localStorage.setItem("dotwatch.preview.pin", event.currentTarget.value);
  });
  byId("previewPin")?.addEventListener("change", () => {
    refreshStatus({ notify: true });
    scanWifi();
  });

  byId("passwordToggle")?.addEventListener("click", togglePassword);
  byId("scanButton")?.addEventListener("click", scanWifi);
  byId("jsonDialogClose")?.addEventListener("click", () => byId("jsonDialog")?.close());

  document.querySelectorAll("[data-preview-action]").forEach((element) => {
    element.addEventListener("click", () => handlePreviewAction(element.dataset.previewAction));
  });

  document.querySelectorAll("[data-preview-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      showToast("Preview mode: แสดงผลเท่านั้น ยังไม่บันทึกค่าลง ESP32");
    });
  });
}

function setupLiveReload() {
  const source = new EventSource("/__live_reload");
  source.addEventListener("reload", () => window.location.reload());
}

function startPolling() {
  clearInterval(state.timer);
  state.timer = setInterval(refreshStatus, POLL_INTERVAL_MS);
}

function init() {
  const configuredTarget = document.querySelector('meta[name="esp32-target"]')?.content;
  const targetInput = byId("previewDeviceUrl");
  if (targetInput && configuredTarget) targetInput.value = configuredTarget;

  const savedPin = localStorage.getItem("dotwatch.preview.pin") || "";
  if (byId("previewPin")) byId("previewPin").value = savedPin;

  const mockToggle = byId("previewMockToggle");
  if (mockToggle) {
    mockToggle.setAttribute("aria-pressed", String(state.useMock));
    mockToggle.textContent = state.useMock ? "ใช้ ESP32 จริง" : "ใช้ Mock Data";
  }

  bindEvents();
  openDashboardPage(window.location.hash.replace("#", "") || "overview", false);
  setupLiveReload();
  refreshStatus();
  scanWifi();
  startPolling();
}

window.addEventListener("DOMContentLoaded", init);
