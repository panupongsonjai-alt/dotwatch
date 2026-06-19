import { auth } from "./firebase";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

async function getToken() {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("User not logged in");
  }

  return user.getIdToken();
}

async function apiFetch(path, options = {}) {
  const token = await getToken();

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  const text = await response.text();

  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }

  if (!response.ok) {
    console.error("API ERROR:", {
      path,
      status: response.status,
      data,
    });

    throw new Error(
      data?.message || data?.error || `API request failed: ${response.status}`,
    );
  }

  return data;
}

export function getDevices() {
  return apiFetch("/api/devices");
}

export function getDevice(id) {
  return apiFetch(`/api/devices/${id}`);
}

export function addDevice({ deviceCode, name, deviceSecret }) {
  return apiFetch("/api/devices", {
    method: "POST",
    body: JSON.stringify({
      deviceCode,
      name,
      deviceSecret,
    }),
  });
}

export function updateDeviceName(id, name) {
  return apiFetch(`/api/devices/${id}`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  });
}

export function updateDeviceGroup(id, groupName) {
  return apiFetch(`/api/devices/${id}`, {
    method: "PUT",
    body: JSON.stringify({ groupName }),
  });
}

export function deleteDevice(id) {
  return apiFetch(`/api/devices/${id}`, {
    method: "DELETE",
  });
}

export function resetDeviceSecret(id) {
  return apiFetch(`/api/devices/${id}/reset-secret`, {
    method: "POST",
  });
}

export function getHistory(deviceId, from, to) {
  const params = new URLSearchParams();

  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const query = params.toString();

  return apiFetch(
    `/api/devices/${deviceId}/history${query ? `?${query}` : ""}`,
  );
}

export function getDeviceHistory(deviceId, from, to) {
  return getHistory(deviceId, from, to);
}

export function getAlarms() {
  return apiFetch("/api/alarms");
}

export function acknowledgeAlarm(id) {
  return apiFetch(`/api/alarms/${id}/acknowledge`, {
    method: "POST",
  });
}

export function getAlarmRules() {
  return apiFetch("/api/alarm-rules");
}

export function createAlarmRule(data) {
  return apiFetch("/api/alarm-rules", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateAlarmRule(id, data) {
  return apiFetch(`/api/alarm-rules/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteAlarmRule(id) {
  return apiFetch(`/api/alarm-rules/${id}`, {
    method: "DELETE",
  });
}

export function getDemoTemplates() {
  return apiFetch("/api/demo/templates");
}

export function createDemoTemplate(templateKey) {
  return apiFetch(`/api/demo/templates/${templateKey}`, {
    method: "POST",
  });
}

export function deleteDemoData() {
  return apiFetch("/api/demo/data", {
    method: "DELETE",
  });
}

export function getDemoStatistics() {
  return apiFetch("/api/demo/statistics");
}

export function getDemoGeneratorConfig() {
  return apiFetch("/api/demo-generator");
}

export function saveDemoGeneratorConfig(data) {
  return apiFetch("/api/demo-generator", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function generateDemoAlarmNow() {
  return apiFetch("/api/demo/actions/alarm-now", {
    method: "POST",
  });
}

export function generateDemoOfflineNow() {
  return apiFetch("/api/demo/actions/offline-now", {
    method: "POST",
  });
}

export function generateDemoHistoryNow() {
  return apiFetch("/api/demo/actions/history-now", {
    method: "POST",
  });
}

export function updateDeviceLocation(id, data) {
  return apiFetch(`/api/devices/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      latitude: data.latitude,
      longitude: data.longitude,
      mapUrl: data.mapUrl,
    }),
  });
}
