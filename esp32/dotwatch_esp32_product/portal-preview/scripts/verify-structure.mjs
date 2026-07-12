import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const previewDir = path.resolve(scriptsDir, "..");
const productDir = path.resolve(previewDir, "..");

const requiredFiles = [
  "src/app/index.template.html",
  "src/components/Sidebar.html",
  "src/components/MobileHeader.html",
  "src/components/Footer.html",
  "src/pages/OverviewPage.html",
  "src/pages/WifiPage.html",
  "src/pages/DevicePage.html",
  "src/pages/SensorPage.html",
  "src/pages/SecurityPage.html",
  "src/pages/FirmwarePage.html",
  "src/pages/SystemPage.html",
  "../src/portal/views/CommonPages.cpp",
  "src/styles/01-tokens.css",
  "src/styles/02-base.css",
  "src/styles/03-layout.css",
  "src/styles/04-components.css",
  "src/styles/05-pages.css",
  "src/styles/06-responsive.css",
  "src/shared/dom.js",
  "src/app/navigation.js",
  "src/features/wifi/wifi.js",
  "src/features/status/status.js",
  "src/features/ota/ota.js",
  "src/app/bootstrap.js",
  "generated/portal.css",
  "generated/firmware.js",
  "index.html"
];

for (const file of requiredFiles) {
  await access(path.join(previewDir, file));
}

const html = await readFile(path.join(previewDir, "index.html"), "utf8");
for (const pageId of ["overview", "wifi", "device", "sensor", "security", "firmware", "system"]) {
  if (!html.includes(`id=\"${pageId}\"`)) {
    throw new Error(`Generated index.html is missing page: ${pageId}`);
  }
}
if (html.includes("{{")) throw new Error("Generated index.html contains unresolved template markers");
if (!html.includes("TEMPERATURE AND HUMIDITY MODEL")) throw new Error("Overview title is missing");

const portalServer = await readFile(path.join(productDir, "src/portal/PortalServer.cpp"), "utf8");
const portalHeader = await readFile(path.join(productDir, "src/portal/PortalServer.h"), "utf8");
if (portalServer.includes("<section id='overview'")) {
  throw new Error("PortalServer.cpp still contains page markup; move it to src/portal/views");
}
if (!portalServer.includes("view_.dashboardPage()")) {
  throw new Error("PortalServer.cpp is not using PortalView dashboard renderer");
}
if (!portalHeader.includes("PortalView view_")) {
  throw new Error("PortalServer.h is missing the PortalView member");
}

const assets = await readFile(path.join(productDir, "src/portal/PortalAssets.h"), "utf8");
if (!assets.includes("Generated from the modular source")) {
  throw new Error("PortalAssets.h was not synchronized from the modular source");
}

console.log("ESP32 modular web structure verify: OK");
