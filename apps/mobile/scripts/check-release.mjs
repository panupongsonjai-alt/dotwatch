import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const failures = [];
const warnings = [];

function requireFile(relativePath) {
  const absolutePath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(absolutePath)) failures.push(`Missing file: ${relativePath}`);
  return absolutePath;
}

function readTextWithoutBom(absolutePath) {
  return fs.readFileSync(absolutePath, 'utf8').replace(/^\uFEFF/, '');
}

function readJson(relativePath) {
  const absolutePath = requireFile(relativePath);
  if (!fs.existsSync(absolutePath)) return null;
  try {
    return JSON.parse(readTextWithoutBom(absolutePath));
  } catch (error) {
    failures.push(`Invalid JSON: ${relativePath} (${error.message})`);
    return null;
  }
}

function requireBuildProfile(easJson, profileName) {
  const profile = easJson?.build?.[profileName];
  if (!profile) {
    failures.push(`Missing ${profileName} build profile in eas.json`);
    return null;
  }
  if (profile.environment !== profileName) {
    failures.push(`Build profile ${profileName} must set environment to "${profileName}"`);
  }
  return profile;
}

const packageJson = readJson('package.json');
const appJson = readJson('app.json');
const easJson = readJson('eas.json');
const envExamplePath = requireFile('.env.example');

requireFile('src/config/firebase.ts');
requireFile('src/config/validateEnv.ts');
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

const requiredPublicEnvKeys = [
  'EXPO_PUBLIC_API_URL',
  'EXPO_PUBLIC_WS_URL',
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID'
];

if (fs.existsSync(envExamplePath)) {
  const envExample = readTextWithoutBom(envExamplePath);
  for (const key of requiredPublicEnvKeys) {
    if (!new RegExp(`^${key}=`, 'm').test(envExample)) {
      failures.push(`Missing ${key} in .env.example`);
    }
  }
}

if (appJson) {
  const expo = appJson.expo || {};
  if (!expo.android?.package) failures.push('Missing expo.android.package in app.json');
  if (!expo.scheme) failures.push('Missing expo.scheme in app.json');
  if (!expo.owner) failures.push('Missing expo.owner in app.json');
  if (!expo.extra?.eas?.projectId) {
    failures.push('Missing expo.extra.eas.projectId. EAS linkage and push token generation will fail.');
  }
  if (packageJson?.version && expo.version && packageJson.version !== expo.version) {
    failures.push(`Version mismatch: package.json=${packageJson.version}, app.json=${expo.version}`);
  }

  const plugins = Array.isArray(expo.plugins) ? expo.plugins : [];
  const pluginNames = plugins.map((plugin) => Array.isArray(plugin) ? plugin[0] : plugin);
  for (const requiredPlugin of ['expo-router', 'expo-secure-store', 'expo-notifications']) {
    if (!pluginNames.includes(requiredPlugin)) failures.push(`Missing Expo plugin: ${requiredPlugin}`);
  }
}

if (easJson) {
  const development = requireBuildProfile(easJson, 'development');
  const preview = requireBuildProfile(easJson, 'preview');
  const production = requireBuildProfile(easJson, 'production');

  if (development) {
    if (development.developmentClient !== true) failures.push('Development profile must set developmentClient to true');
    if (development.distribution !== 'internal') failures.push('Development profile must use internal distribution');
    if (development.android?.buildType !== 'apk') failures.push('Development Android build must produce an APK');
  }

  if (preview) {
    if (preview.distribution !== 'internal') failures.push('Preview profile must use internal distribution');
    if (preview.android?.buildType !== 'apk') failures.push('Preview Android build must produce an APK');
  }

  if (production) {
    if (production.autoIncrement !== true) warnings.push('Production profile should set autoIncrement to true');
    if (production.android?.buildType !== 'app-bundle') failures.push('Production Android build must produce an app bundle');
  }
}

console.log('dotWatch Mobile Release Check');
console.log('================================');
for (const warning of warnings) console.warn(`WARN: ${warning}`);
for (const failure of failures) console.error(`FAIL: ${failure}`);
if (failures.length > 0) process.exitCode = 1;
else console.log('OK: release structure check passed');
