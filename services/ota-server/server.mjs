import { timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { FixedWindowLimiter } from "./lib/fixed-window-limiter.mjs";

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

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parsePositiveInteger(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < min || numberValue > max) return fallback;
  return numberValue;
}

function parseJsonObject(name, rawValue) {
  try {
    const value = JSON.parse(rawValue || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("must be a JSON object");
    }
    return value;
  } catch (error) {
    throw new Error(`${name} is invalid: ${error.message}`);
  }
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))];
}

loadEnvFile(path.join(serviceDir, ".env"));

const releasesDir = path.join(serviceDir, "releases");
const manifestPath = path.join(releasesDir, "manifest.json");
const nodeEnv = String(process.env.NODE_ENV || "development").trim().toLowerCase();
const isProduction = nodeEnv === "production";
const port = parsePositiveInteger(process.env.PORT, 4100, { min: 1, max: 65535 });
const publicBaseUrl = String(process.env.PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
const allowUnregistered = parseBoolean(process.env.OTA_ALLOW_UNREGISTERED_DEVICES, false);
const requireDeviceScope = parseBoolean(process.env.OTA_REQUIRE_DEVICE_SCOPE, isProduction);
const maxBodyBytes = parsePositiveInteger(process.env.OTA_MAX_BODY_BYTES, 16 * 1024, {
  min: 1024,
  max: 1024 * 1024
});
const rateLimitWindowMs = parsePositiveInteger(process.env.OTA_RATE_LIMIT_WINDOW_MS, 60_000, {
  min: 1000,
  max: 60 * 60 * 1000
});
const rateLimitPerIp = parsePositiveInteger(process.env.OTA_RATE_LIMIT_PER_IP, 120, {
  min: 10,
  max: 100_000
});
const rateLimitPerDevice = parsePositiveInteger(process.env.OTA_RATE_LIMIT_PER_DEVICE, 60, {
  min: 5,
  max: 100_000
});
const authFailureLimitPerIp = parsePositiveInteger(process.env.OTA_AUTH_FAILURE_LIMIT_PER_IP, 20, {
  min: 3,
  max: 10_000
});
const authFailureLimitPerDevice = parsePositiveInteger(process.env.OTA_AUTH_FAILURE_LIMIT_PER_DEVICE, 10, {
  min: 3,
  max: 10_000
});
const limiterMaxEntries = parsePositiveInteger(process.env.OTA_RATE_LIMIT_MAX_ENTRIES, 10_000, {
  min: 100,
  max: 1_000_000
});

function parseDeviceRegistry() {
  const registryValue = parseJsonObject(
    "OTA_DEVICE_REGISTRY_JSON",
    process.env.OTA_DEVICE_REGISTRY_JSON || "{}"
  );
  const legacySecrets = parseJsonObject(
    "OTA_DEVICE_SECRETS_JSON",
    process.env.OTA_DEVICE_SECRETS_JSON || "{}"
  );
  const registry = new Map();

  for (const [rawCode, rawRegistration] of Object.entries(registryValue)) {
    const deviceCode = String(rawCode || "").trim();
    if (!deviceCode) continue;

    const registration = typeof rawRegistration === "string"
      ? { secret: rawRegistration }
      : rawRegistration;

    if (!registration || typeof registration !== "object" || Array.isArray(registration)) {
      throw new Error(`OTA_DEVICE_REGISTRY_JSON entry ${deviceCode} must be a string or object`);
    }

    const secret = String(registration.secret || "").trim();
    if (!secret) throw new Error(`OTA device ${deviceCode} is missing secret`);

    registry.set(deviceCode, {
      secret,
      modelKeys: normalizeStringList(registration.modelKeys),
      channels: normalizeStringList(registration.channels),
      source: "registry"
    });
  }

  for (const [rawCode, rawSecret] of Object.entries(legacySecrets)) {
    const deviceCode = String(rawCode || "").trim();
    const secret = String(rawSecret || "").trim();
    if (!deviceCode || !secret || registry.has(deviceCode)) continue;

    registry.set(deviceCode, {
      secret,
      modelKeys: [],
      channels: [],
      source: "legacy"
    });
  }

  return registry;
}

const deviceRegistry = parseDeviceRegistry();

function validateConfiguration() {
  if (isProduction && allowUnregistered) {
    throw new Error("OTA_ALLOW_UNREGISTERED_DEVICES must be false in production");
  }

  if (isProduction && (!publicBaseUrl || !publicBaseUrl.startsWith("https://"))) {
    throw new Error("PUBLIC_BASE_URL must use https:// in production");
  }

  if (isProduction && deviceRegistry.size === 0) {
    throw new Error("At least one OTA device registration is required in production");
  }

  if (requireDeviceScope) {
    for (const [deviceCode, registration] of deviceRegistry.entries()) {
      if (registration.modelKeys.length === 0 || registration.channels.length === 0) {
        throw new Error(
          `OTA device ${deviceCode} must define modelKeys and channels when OTA_REQUIRE_DEVICE_SCOPE=true`
        );
      }
    }
  }
}

validateConfiguration();

const requestByIpLimiter = new FixedWindowLimiter({
  windowMs: rateLimitWindowMs,
  limit: rateLimitPerIp,
  maxEntries: limiterMaxEntries
});
const requestByDeviceLimiter = new FixedWindowLimiter({
  windowMs: rateLimitWindowMs,
  limit: rateLimitPerDevice,
  maxEntries: limiterMaxEntries
});
const authFailureByIpLimiter = new FixedWindowLimiter({
  windowMs: rateLimitWindowMs,
  limit: authFailureLimitPerIp,
  maxEntries: limiterMaxEntries
});
const authFailureByDeviceLimiter = new FixedWindowLimiter({
  windowMs: rateLimitWindowMs,
  limit: authFailureLimitPerDevice,
  maxEntries: limiterMaxEntries
});

function json(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
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

function getRequestIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const connecting = String(req.headers["cf-connecting-ip"] || "").trim();
  return String(connecting || forwarded || req.socket.remoteAddress || "unknown").slice(0, 128);
}

function rateLimitResponse(res, state, message) {
  const retryAfterSeconds = Math.max(1, Math.ceil(state.retryAfterMs / 1000));
  json(res, 429, { ok: false, message, retryAfterSeconds }, {
    "Retry-After": String(retryAfterSeconds)
  });
}

function authenticate(req, ip) {
  const deviceCode = String(req.headers["x-device-code"] || "").trim().slice(0, 128);
  const deviceSecret = String(req.headers["x-device-secret"] || "").trim();
  const ipKey = `ip:${ip}`;
  const deviceKey = `device:${deviceCode.toLowerCase() || "unknown"}`;

  const ipLock = authFailureByIpLimiter.check(ipKey);
  if (!ipLock.allowed) return { ok: false, rateLimited: true, state: ipLock };

  const deviceLock = authFailureByDeviceLimiter.check(deviceKey);
  if (!deviceLock.allowed) return { ok: false, rateLimited: true, state: deviceLock };

  if (!deviceCode || !deviceSecret) {
    authFailureByIpLimiter.consume(ipKey);
    authFailureByDeviceLimiter.consume(deviceKey);
    return { ok: false, status: 401, message: "Missing device credentials" };
  }

  const registration = deviceRegistry.get(deviceCode);
  if (registration && safeEqual(deviceSecret, registration.secret)) {
    return { ok: true, deviceCode, registration, unregistered: false };
  }

  if (allowUnregistered) {
    return {
      ok: true,
      deviceCode,
      registration: { modelKeys: [], channels: [], source: "unregistered" },
      unregistered: true
    };
  }

  authFailureByIpLimiter.consume(ipKey);
  authFailureByDeviceLimiter.consume(deviceKey);
  return { ok: false, status: 403, message: "Invalid device credentials" };
}

function authorizeScope(auth, modelKey, channel) {
  if (auth.unregistered && allowUnregistered) return true;

  const { modelKeys, channels } = auth.registration;
  if (modelKeys.length > 0 && !modelKeys.includes(modelKey)) return false;
  if (channels.length > 0 && !channels.includes(channel)) return false;
  return !requireDeviceScope || (modelKeys.length > 0 && channels.length > 0);
}

function authorizeModel(auth, modelKey) {
  if (auth.unregistered && allowUnregistered) return true;

  const { modelKeys } = auth.registration;
  if (modelKeys.length > 0 && !modelKeys.includes(modelKey)) return false;
  return !requireDeviceScope || modelKeys.length > 0;
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

async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBodyBytes) {
      const error = new Error("Request body too large");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};

  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("JSON body must be an object");
    }
    return value;
  } catch (error) {
    error.status = 400;
    throw error;
  }
}

function safeReleaseFile(filename) {
  const basename = path.basename(String(filename || ""));
  if (!basename || basename !== filename || !basename.endsWith(".bin")) return null;
  const resolved = path.resolve(releasesDir, basename);
  const relative = path.relative(releasesDir, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return resolved;
}

function safeText(value, maxLength = 512) {
  return String(value ?? "").replace(/[\r\n\t]/g, " ").slice(0, maxLength);
}

function safeInteger(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return null;
  return Math.min(max, Math.max(min, Math.trunc(numberValue)));
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

  if (!authorizeScope(auth, modelKey, channel)) {
    json(res, 403, { ok: false, message: "Device is not authorized for this firmware scope" });
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

async function handleDownload(req, res, url, auth) {
  const filename = decodeURIComponent(url.pathname.split("/").pop() || "");
  const filePath = safeReleaseFile(filename);
  if (!filePath) {
    json(res, 400, { ok: false, message: "Invalid firmware filename" });
    return;
  }

  const manifest = await loadManifest();
  const release = manifest.releases.find((item) => item?.file === filename);
  if (!release) {
    json(res, 404, { ok: false, message: "Firmware release not found" });
    return;
  }

  if (!authorizeScope(auth, String(release.modelKey || ""), String(release.channel || ""))) {
    json(res, 403, { ok: false, message: "Device is not authorized for this firmware scope" });
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

async function handleReport(req, res, auth, ip) {
  const payload = await readJsonBody(req);
  const modelKey = safeText(payload.modelKey, 128);

  if (modelKey && !authorizeModel(auth, modelKey)) {
    json(res, 403, { ok: false, message: "Device is not authorized for this firmware scope" });
    return;
  }

  const event = {
    receivedAt: new Date().toISOString(),
    deviceCode: auth.deviceCode,
    remoteAddress: ip,
    event: safeText(payload.event, 64),
    message: safeText(payload.message, 512),
    modelKey,
    firmwareVersion: safeText(payload.firmwareVersion, 128),
    firmwareBuild: safeInteger(payload.firmwareBuild),
    availableVersion: safeText(payload.availableVersion, 128),
    availableBuild: safeInteger(payload.availableBuild),
    httpStatus: safeInteger(payload.httpStatus, -1, 999),
    freeHeap: safeInteger(payload.freeHeap),
    uptimeMs: safeInteger(payload.uptimeMs)
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
        registeredDeviceCount: deviceRegistry.size,
        allowUnregistered,
        requireDeviceScope
      });
      return;
    }

    const isFirmwareRoute = url.pathname.startsWith("/api/device-firmware/");
    if (!isFirmwareRoute) {
      json(res, 404, { ok: false, message: "Not found" });
      return;
    }

    const ip = getRequestIp(req);
    const ipRate = requestByIpLimiter.consume(`ip:${ip}`);
    if (!ipRate.allowed) {
      rateLimitResponse(res, ipRate, "OTA request rate limit exceeded");
      return;
    }

    const auth = authenticate(req, ip);
    if (!auth.ok) {
      if (auth.rateLimited) {
        rateLimitResponse(res, auth.state, "Too many invalid OTA authentication attempts");
      } else {
        json(res, auth.status, { ok: false, message: auth.message });
      }
      return;
    }

    const deviceRate = requestByDeviceLimiter.consume(`device:${auth.deviceCode.toLowerCase()}`);
    if (!deviceRate.allowed) {
      rateLimitResponse(res, deviceRate, "OTA device request rate limit exceeded");
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/device-firmware/check") {
      await handleCheck(req, res, url, auth);
      return;
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/device-firmware/download/")) {
      await handleDownload(req, res, url, auth);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/device-firmware/report") {
      await handleReport(req, res, auth, ip);
      return;
    }

    json(res, 404, { ok: false, message: "Firmware route not found" });
  } catch (error) {
    console.error("OTA server error:", error);
    if (!res.headersSent) {
      json(res, error.status || 500, {
        ok: false,
        message: error.status ? error.message : "Internal OTA server error"
      });
    } else {
      res.destroy();
    }
  }
});

server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
server.keepAliveTimeout = 5_000;
server.maxRequestsPerSocket = 100;

server.listen(port, "0.0.0.0", () => {
  console.log("============================================================");
  console.log("dotWatch OTA Server");
  console.log("============================================================");
  console.log(`Environment         : ${nodeEnv}`);
  console.log(`Port                : ${port}`);
  console.log(`Public Base URL     : ${publicBaseUrl || "derived from request"}`);
  console.log(`Registered devices  : ${deviceRegistry.size}`);
  console.log(`Allow unregistered  : ${allowUnregistered}`);
  console.log(`Require device scope: ${requireDeviceScope}`);
  console.log("============================================================");
});
