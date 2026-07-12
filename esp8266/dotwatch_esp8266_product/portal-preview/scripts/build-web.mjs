import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const previewDir = path.resolve(scriptsDir, "..");
const srcDir = path.join(previewDir, "src");
const generatedDir = path.join(previewDir, "generated");

const componentFiles = {
  PREVIEW_TOOLBAR: "components/PreviewToolbar.html",
  SIDEBAR: "components/Sidebar.html",
  PORTAL_OVERLAY: "components/PortalOverlay.html",
  MOBILE_HEADER: "components/MobileHeader.html",
  FOOTER: "components/Footer.html",
  PREVIEW_FEEDBACK: "components/PreviewFeedback.html"
};

const pageFiles = [
  "pages/OverviewPage.html",
  "pages/WifiPage.html",
  "pages/DevicePage.html",
  "pages/SensorPage.html",
  "pages/SecurityPage.html",
  "pages/SystemPage.html"
];

const styleFiles = [
  "styles/01-tokens.css",
  "styles/02-base.css",
  "styles/03-layout.css",
  "styles/04-components.css",
  "styles/05-pages.css",
  "styles/06-responsive.css"
];

const firmwareScriptFiles = [
  "shared/dom.js",
  "app/navigation.js",
  "features/wifi/wifi.js",
  "features/status/status.js",
  "app/bootstrap.js"
];

async function readSource(relativePath) {
  return readFile(path.join(srcDir, relativePath), "utf8");
}

function replaceToken(template, token, value) {
  const marker = `{{${token}}}`;
  if (!template.includes(marker)) {
    throw new Error(`Missing template marker: ${marker}`);
  }
  return template.replace(marker, value.trim());
}

export async function buildWebApp({ quiet = false } = {}) {
  await mkdir(generatedDir, { recursive: true });

  let html = await readSource("app/index.template.html");
  for (const [token, file] of Object.entries(componentFiles)) {
    html = replaceToken(html, token, await readSource(file));
  }

  const pages = await Promise.all(pageFiles.map(readSource));
  html = replaceToken(html, "PAGES", pages.map((value) => value.trim()).join("\n\n"));
  if (/{{[A-Z0-9_]+}}/.test(html)) {
    throw new Error("Unresolved template marker remains in index.html");
  }

  const styles = await Promise.all(styleFiles.map(readSource));
  const portalCss = [
    "/* GENERATED FILE — edit src/styles/*.css, then run npm run build. */",
    ...styles.map((value) => value.trim())
  ].join("\n\n") + "\n";

  const scripts = await Promise.all(firmwareScriptFiles.map(readSource));
  const firmwareJs = [
    "// GENERATED FILE — edit modular files under src/, then run npm run build.",
    ...scripts.map((value) => value.trim())
  ].join("\n\n") + "\n";

  await Promise.all([
    writeFile(path.join(previewDir, "index.html"), html, "utf8"),
    writeFile(path.join(generatedDir, "portal.css"), portalCss, "utf8"),
    writeFile(path.join(generatedDir, "firmware.js"), firmwareJs, "utf8")
  ]);

  if (!quiet) {
    console.log("Built modular ESP8266 web app");
    console.log(`HTML : ${Buffer.byteLength(html, "utf8")} bytes`);
    console.log(`CSS  : ${Buffer.byteLength(portalCss, "utf8")} bytes`);
    console.log(`JS   : ${Buffer.byteLength(firmwareJs, "utf8")} bytes`);
  }

  return { html, portalCss, firmwareJs };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildWebApp();
}
