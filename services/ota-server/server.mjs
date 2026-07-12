import { createReadStream, existsSync, readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serviceDir = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const raw = line.trim();
    if (!raw || raw.startsWith("#") || !raw.includes("=")) continue;
    const index = raw.indexOf("=");
    const key = raw.slice(0, index).trim();
    const value = raw.slice(index + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(path.join(serviceDir, ".env"));

const releasesDir = path.join(serviceDir, "releases");
const manifestPath = path.join(releasesDir, "manifest.json");
const port = Number(process.env.PORT || 4100);
const publicBaseUrl = String(process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
const allowUnregistered = String(process.env.OTA_ALLOW_UNREGISTERED_DEVICES || "false").toLowerCase() === "true";

function parseDeviceSecrets() {
  const raw = process.env.OTA_DEVICE_SECRETS_JSON || "{}";
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch (error) {
    console.error("Invalid OTA_DEVICE_SECRETS_JSON:", error.message);
    return {};
  }
}

const deviceSecrets = parseDeviceSecrets();

function json(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(body);
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

function authenticate(req) {
  const deviceCode = String(req.headers["x-device-code"] || "").trim();
  const deviceSecret = String(req.headers["x-device-secret"] || "").trim();
  if (!deviceCode || !deviceSecret) {
    return { ok: false, status: 401, message: "Missing device credentials" };
  }
  const expected = deviceSecrets[deviceCode];
  if (expected && safeEqual(deviceSecret, expected)) {
    return { ok: true, deviceCode };
  }
  if (allowUnregistered) {
    return { ok: true, deviceCode, unregistered: true };
  }
  return { ok: false, status: 403, message: "Invalid device credentials" };
}

async function loadManifest() {
  const raw = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(raw);
  if (!manifest || !Array.isArray(manifest.releases)) {
    throw new Error("releases/manifest.json is invalid");
  }
  return manifest;
}

function requestBaseUrl(req) {
  if (publicBaseUrl) return publicBaseUrl;
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwardedProto || "http";
  return `${protocol}://${req.headers.host}`;
}

function selectRelease(manifest, { modelKey, channel, currentBuild }) {
  return manifest.releases
    .filter((release) =>
      release &&
      release.modelKey === modelKey &&
      release.channel === channel &&
      Number(release.buildNumber) > currentBuild
    )
    .sort((a, b) => Number(b.buildNumber) - Number(a.buildNumber))[0] || null;
}

async function readJsonBody(req, maxBytes = 64 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function safeReleaseFile(filename) {
  const basename = path.basename(String(filename || ""));
  if (!basename || basename !== filename || !basename.endsWith(".bin")) return null;
  const resolved = path.join(releasesDir, basename);
  return resolved.startsWith(releasesDir) ? resolved : null;
}

async function handleCheck(req, res, url, auth) {
  const modelKey = String(url.searchParams.get("modelKey") || req.headers["x-model-key"] || "").trim();
  const channel = String(url.searchParams.get("channel") || "stable").trim();
  const currentBuild = Math.max(0, Number(url.searchParams.get("currentBuild") || 0));
  const currentVersion = String(url.searchParams.get("currentVersion") || req.headers["x-firmware-version"] || "");

  if (!modelKey) {
    json(res, 400, { ok: false, message: "modelKey is required" });
    return;
  }

  const manifest = await loadManifest();
  const release = selectRelease(manifest, { modelKey, channel, currentBuild });
  if (!release) {
    json(res, 200, {
      ok: true,
      updateAvailable: false,
      currentVersion,
      currentBuild,
      modelKey,
      channel
    });
    return;
  }

  const firmwareUrl = `${requestBaseUrl(req)}/api/device-firmware/download/${encodeURIComponent(release.file)}`;
  json(res, 200, {
    ok: true,
    updateAvailable: true,
    deviceCode: auth.deviceCode,
    release: {
      modelKey: release.modelKey,
      channel: release.channel,
      version: release.version,
      buildNumber: Number(release.buildNumber),
      size: Number(release.size),
      sha256: release.sha256,
      mandatory: release.mandatory === true,
      autoInstall: release.autoInstall === true,
      releaseNotes: release.releaseNotes || "",
      publishedAt: release.publishedAt,
      firmwareUrl
    }
  });
}

async function handleDownload(req, res, url) {
  const filename = decodeURIComponent(url.pathname.split("/").pop() || "");
  const filePath = safeReleaseFile(filename);
  if (!filePath) {
    json(res, 400, { ok: false, message: "Invalid firmware filename" });
    return;
  }

  try {
    const info = await stat(filePath);
    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Length": info.size,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff"
    });
    createReadStream(filePath).pipe(res);
  } catch (error) {
    if (error?.code === "ENOENT") {
      json(res, 404, { ok: false, message: "Firmware file not found" });
      return;
    }
    throw error;
  }
}

async function handleReport(req, res, auth) {
  const payload = await readJsonBody(req);
  const event = {
    receivedAt: new Date().toISOString(),
    deviceCode: auth.deviceCode,
    remoteAddress: req.socket.remoteAddress,
    ...payload
  };
  console.log("OTA_REPORT", JSON.stringify(event));
  json(res, 202, { ok: true, accepted: true });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  try {
    if (req.method === "GET" && url.pathname === "/health") {
      const manifest = await loadManifest();
      json(res, 200, {
        ok: true,
        service: "dotwatch-ota-server",
        releaseCount: manifest.releases.length,
        allowUnregistered
      });
      return;
    }

    const isFirmwareRoute = url.pathname.startsWith("/api/device-firmware/");
    if (!isFirmwareRoute) {
      json(res, 404, { ok: false, message: "Not found" });
      return;
    }

    const auth = authenticate(req);
    if (!auth.ok) {
      json(res, auth.status, { ok: false, message: auth.message });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/device-firmware/check") {
      await handleCheck(req, res, url, auth);
      return;
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/device-firmware/download/")) {
      await handleDownload(req, res, url);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/device-firmware/report") {
      await handleReport(req, res, auth);
      return;
    }

    json(res, 404, { ok: false, message: "Firmware route not found" });
  } catch (error) {
    console.error("OTA server error:", error);
    json(res, 500, { ok: false, message: "Internal OTA server error" });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log("============================================================");
  console.log("dotWatch OTA Server");
  console.log("============================================================");
  console.log(`Port               : ${port}`);
  console.log(`Public Base URL    : ${publicBaseUrl || "derived from request"}`);
  console.log(`Registered devices : ${Object.keys(deviceSecrets).length}`);
  console.log(`Allow unregistered : ${allowUnregistered}`);
  console.log("============================================================");
});
