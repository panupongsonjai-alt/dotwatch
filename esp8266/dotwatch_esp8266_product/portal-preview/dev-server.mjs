import http from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildWebApp } from "./scripts/build-web.mjs";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 5174);
const deviceTarget = String(process.env.ESP8266_TARGET || "http://192.168.1.103").replace(/\/$/, "");
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
        `<meta name="esp8266-target" content="${deviceTarget.replaceAll('"', "&quot;")}">\n  </head>`
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

async function readRequestBody(req, limitBytes = 16 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limitBytes) throw new Error("Preview request body too large");
    chunks.push(chunk);
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

async function proxyDevice(req, res) {
  const incoming = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const targetPath = incoming.pathname.replace(/^\/device-api/, "") || "/";
  const targetUrl = `${deviceTarget}${targetPath}${incoming.search}`;

  try {
    const requestBody = ["GET", "HEAD"].includes(req.method || "GET")
      ? undefined
      : await readRequestBody(req);
    const headers = {
      Accept: req.headers.accept || "*/*",
      "User-Agent": "dotTH-Portal-Preview/1.1"
    };
    if (req.headers["content-type"]) headers["Content-Type"] = req.headers["content-type"];
    if (req.headers.cookie) headers.Cookie = req.headers.cookie;

    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: requestBody,
      redirect: "manual",
      signal: AbortSignal.timeout(7000)
    });

    const payload = Buffer.from(await response.arrayBuffer());
    const responseHeaders = { "X-ESP8266-Target": deviceTarget };
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) responseHeaders["Set-Cookie"] = setCookie;

    // Device login/logout uses 303. Keep the cookie but avoid redirecting fetch()
    // away from the preview application.
    if ((targetPath === "/login" || targetPath === "/logout") && response.status === 303) {
      send(res, 204, "", "text/plain; charset=utf-8", responseHeaders);
      return;
    }

    const location = response.headers.get("location");
    if (location) responseHeaders.Location = location.startsWith("/")
      ? `/device-api${location}`
      : location;

    send(
      res,
      response.status,
      payload,
      response.headers.get("content-type") || "application/octet-stream",
      responseHeaders
    );
  } catch (error) {
    const message = error?.name === "TimeoutError"
      ? `Device request timed out: ${deviceTarget}`
      : error?.message || `Cannot connect to device: ${deviceTarget}`;
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
  console.log("dotTH ESP8266 Portal Live Preview");
  console.log("============================================================");
  console.log(`Preview URL : http://localhost:${port}`);
  console.log(`ESP8266 target: ${deviceTarget}`);
  console.log("Live reload : enabled");
  console.log("Device poll : every 2 seconds");
  console.log("Quit        : Ctrl+C");
  console.log("============================================================");
});
