import http from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildWebApp } from "./scripts/build-web.mjs";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 5174);
const deviceTarget = String(process.env.ESP32_TARGET || "http://192.168.1.100").replace(/\/$/, "");
const clients = new Set();
const watchedExtensions = new Set([".html", ".css", ".js", ".json", ".mjs"]);
const ignoredNames = new Set(["node_modules", ".git", "generated"]);
const ignoredFiles = new Set([path.join(rootDir, "index.html")]);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

function send(res, status, body, contentType = "text/plain; charset=utf-8", extraHeaders = {}) {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store, no-cache, must-revalidate",
    ...extraHeaders
  });
  res.end(body);
}

function safeLocalPath(requestPath) {
  const decoded = decodeURIComponent(requestPath.split("?")[0]);
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const resolved = path.resolve(rootDir, relative);
  return resolved.startsWith(rootDir) ? resolved : null;
}

async function serveStatic(req, res) {
  const localPath = safeLocalPath(req.url || "/");
  if (!localPath) {
    send(res, 403, "Forbidden");
    return;
  }

  try {
    let body = await readFile(localPath);
    const extension = path.extname(localPath).toLowerCase();

    if (extension === ".html") {
      const html = body.toString("utf8").replace(
        "</head>",
        `<meta name="esp32-target" content="${deviceTarget.replaceAll('"', "&quot;")}">\n  </head>`
      );
      body = Buffer.from(html, "utf8");
    }

    send(res, 200, body, mimeTypes[extension] || "application/octet-stream");
  } catch (error) {
    if (error?.code === "ENOENT") {
      send(res, 404, "Not found");
      return;
    }
    console.error("Static file error:", error);
    send(res, 500, "Internal preview server error");
  }
}

async function proxyDevice(req, res) {
  const incoming = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const targetPath = incoming.pathname.replace(/^\/device-api/, "") || "/";
  const targetUrl = `${deviceTarget}${targetPath}${incoming.search}`;

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        Accept: req.headers.accept || "*/*",
        "User-Agent": "dotTH-ESP32-Portal-Preview/1.0"
      },
      signal: AbortSignal.timeout(7000)
    });

    const payload = Buffer.from(await response.arrayBuffer());
    send(
      res,
      response.status,
      payload,
      response.headers.get("content-type") || "application/octet-stream",
      { "X-ESP32-Target": deviceTarget }
    );
  } catch (error) {
    const message = error?.name === "TimeoutError"
      ? `ESP32 request timed out: ${deviceTarget}`
      : `Cannot connect to ESP32: ${deviceTarget}`;
    send(
      res,
      502,
      JSON.stringify({ ok: false, message }),
      "application/json; charset=utf-8"
    );
  }
}

function serveLiveReload(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });
  res.write("retry: 1000\n\n");
  clients.add(res);
  req.on("close", () => clients.delete(res));
}

function broadcastReload() {
  for (const client of clients) {
    client.write("event: reload\ndata: changed\n\n");
  }
}

async function collectFileTimes(directory, result = new Map()) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (ignoredNames.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectFileTimes(fullPath, result);
      continue;
    }
    if (ignoredFiles.has(fullPath)) continue;
    if (!watchedExtensions.has(path.extname(entry.name).toLowerCase())) continue;
    const info = await stat(fullPath);
    result.set(fullPath, info.mtimeMs);
  }
  return result;
}

await buildWebApp({ quiet: true });
let snapshot = await collectFileTimes(rootDir);
setInterval(async () => {
  try {
    const next = await collectFileTimes(rootDir);
    let changed = next.size !== snapshot.size;

    if (!changed) {
      for (const [file, mtime] of next) {
        if (snapshot.get(file) !== mtime) {
          changed = true;
          break;
        }
      }
    }

    if (changed) {
      snapshot = next;
      await buildWebApp({ quiet: true });
      broadcastReload();
      console.log(`[reload] ${new Date().toLocaleTimeString()} modular source rebuilt`);
    }
  } catch (error) {
    console.error("File watcher error:", error);
  }
}, 650);

const server = http.createServer(async (req, res) => {
  if ((req.url || "").startsWith("/__live_reload")) {
    serveLiveReload(req, res);
    return;
  }
  if ((req.url || "").startsWith("/device-api")) {
    await proxyDevice(req, res);
    return;
  }
  await serveStatic(req, res);
});

server.listen(port, "0.0.0.0", () => {
  console.log("============================================================");
  console.log("dotTH ESP32 Portal Live Preview");
  console.log("============================================================");
  console.log(`Preview URL : http://localhost:${port}`);
  console.log(`ESP32 target: ${deviceTarget}`);
  console.log("Live reload : enabled");
  console.log("Device poll : every 2 seconds");
  console.log("Quit        : Ctrl+C");
  console.log("============================================================");
});
