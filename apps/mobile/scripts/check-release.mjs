import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const failures = [];
const warnings = [];

function requireFile(relativePath) {
  const absolutePath = path.join(projectRoot, relativePath);

  if (!fs.existsSync(absolutePath)) {
    failures.push(`Missing file: ${relativePath}`);
  }

  return absolutePath;
}

function readTextWithoutBom(absolutePath) {
  return fs
    .readFileSync(absolutePath, 'utf8')
    .replace(/^\uFEFF/, '');
}

function readJson(relativePath) {
  const absolutePath = requireFile(relativePath);

  if (!fs.existsSync(absolutePath)) {
    return null;
  }

  try {
    return JSON.parse(readTextWithoutBom(absolutePath));
  } catch (error) {
    failures.push(`Invalid JSON: ${relativePath} (${error.message})`);
    return null;
  }
}

const packageJson = readJson('package.json');
const appJson = readJson('app.json');
const easJson = readJson('eas.json');

requireFile('.env');
requireFile('src/config/firebase.ts');
requireFile('src/services/realtime.ts');
requireFile('src/services/notifications.ts');
requireFile('app/_layout.tsx');

const requiredDependencies = [
  '@firebase/auth',
  '@react-native-async-storage/async-storage',
  '@tanstack/react-query',
  'expo',
  'expo-dev-client',
  'expo-device',
  'expo-notifications',
  'expo-router',
  'firebase',
  'react',
  'react-native',
  'react-native-svg'
];

if (packageJson) {
  const dependencies = packageJson.dependencies || {};
  const devDependencies = packageJson.devDependencies || {};

  for (const dependency of requiredDependencies) {
    if (!dependencies[dependency] && !devDependencies[dependency]) {
      failures.push(`Missing dependency: ${dependency}`);
    }
  }
}

if (appJson) {
  const expo = appJson.expo || {};

  if (!expo.android?.package) {
    failures.push('Missing expo.android.package in app.json');
  }

  if (!expo.scheme) {
    failures.push('Missing expo.scheme in app.json');
  }

  if (!expo.extra?.eas?.projectId) {
    warnings.push(
      'Missing expo.extra.eas.projectId. Push token generation will fail.'
    );
  }

  const plugins = Array.isArray(expo.plugins) ? expo.plugins : [];
  const pluginNames = plugins.map((plugin) =>
    Array.isArray(plugin) ? plugin[0] : plugin
  );

  for (const requiredPlugin of [
    'expo-router',
    'expo-secure-store',
    'expo-notifications'
  ]) {
    if (!pluginNames.includes(requiredPlugin)) {
      warnings.push(`Missing Expo plugin: ${requiredPlugin}`);
    }
  }
}

if (easJson && !easJson.build?.production) {
  failures.push('Missing production build profile in eas.json');
}

console.log('dotWatch Mobile Release Check');
console.log('================================');

for (const warning of warnings) {
  console.warn(`WARN: ${warning}`);
}

for (const failure of failures) {
  console.error(`FAIL: ${failure}`);
}

if (failures.length > 0) {
  process.exitCode = 1;
} else {
  console.log('OK: release structure check passed');
}
