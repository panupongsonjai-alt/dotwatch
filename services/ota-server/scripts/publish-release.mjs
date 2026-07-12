import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const serviceDir = path.resolve(scriptsDir, "..");
const releasesDir = path.join(serviceDir, "releases");
const manifestPath = path.join(releasesDir, "manifest.json");

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      values[key] = true;
    } else {
      values[key] = next;
      index += 1;
    }
  }
  return values;
}

function required(args, name) {
  const value = String(args[name] || "").trim();
  if (!value) throw new Error(`Missing --${name}`);
  return value;
}

async function sha256File(filePath) {
  const body = await readFile(filePath);
  return createHash("sha256").update(body).digest("hex");
}

const args = parseArgs(process.argv.slice(2));
const source = path.resolve(required(args, "file"));
const version = required(args, "version");
const buildNumber = Number(required(args, "build"));
const modelKey = String(args.model || "esp32_dht3").trim();
const channel = String(args.channel || "stable").trim();
const mandatory = args.mandatory === true || String(args.mandatory || "").toLowerCase() === "true";
const autoInstall = args.auto === true || String(args.auto || "").toLowerCase() === "true";
const releaseNotes = String(args.notes || "").trim();
const maxFirmwareBytes = 0x180000;

if (!Number.isInteger(buildNumber) || buildNumber <= 0) {
  throw new Error("--build must be a positive integer");
}
if (!source.endsWith(".bin")) throw new Error("--file must point to firmware.bin");
if (!/^[a-z0-9][a-z0-9_.-]*$/i.test(modelKey)) throw new Error("--model contains invalid characters");
if (!/^(stable|beta)$/.test(channel)) throw new Error("--channel must be stable or beta");

await mkdir(releasesDir, { recursive: true });
const filename = `${modelKey}-${channel}-build-${buildNumber}.bin`;
const destination = path.join(releasesDir, filename);
await copyFile(source, destination);

const info = await stat(destination);
if (info.size <= 0 || info.size > maxFirmwareBytes) {
  throw new Error(`Firmware size ${info.size} exceeds OTA slot limit ${maxFirmwareBytes}`);
}
const sha256 = await sha256File(destination);
let manifest = { schemaVersion: 1, releases: [] };
try {
  manifest = JSON.parse(await readFile(manifestPath, "utf8"));
} catch {}
if (!Array.isArray(manifest.releases)) manifest.releases = [];

const release = {
  modelKey,
  channel,
  version,
  buildNumber,
  file: filename,
  size: info.size,
  sha256,
  mandatory,
  autoInstall,
  releaseNotes,
  publishedAt: new Date().toISOString()
};

manifest.schemaVersion = 1;
manifest.releases = manifest.releases.filter(
  (item) => !(item.modelKey === modelKey && item.channel === channel && Number(item.buildNumber) === buildNumber)
);
manifest.releases.push(release);
manifest.releases.sort((a, b) => Number(b.buildNumber) - Number(a.buildNumber));
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log("Firmware release published locally");
console.log(`File       : ${destination}`);
console.log(`Version    : ${version}`);
console.log(`Build      : ${buildNumber}`);
console.log(`Size       : ${info.size}`);
console.log(`SHA-256    : ${sha256}`);
console.log(`Mandatory  : ${mandatory}`);
console.log(`AutoInstall: ${autoInstall}`);
console.log("Commit releases/manifest.json and the generated .bin, then deploy the OTA server.");
