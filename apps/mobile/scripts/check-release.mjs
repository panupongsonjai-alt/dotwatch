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
  return fs.readFileSync(absolutePath, 'utf8').replace(/^\uFEFF/, '');
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

function parseDotEnv(relativePath) {
  const absolutePath = path.join(projectRoot, relativePath);

  if (!fs.existsSync(absolutePath)) return {};

  return Object.fromEntries(
    readTextWithoutBom(absolutePath)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        const key = line.slice(0, separator).trim();
        const rawValue = line.slice(separator + 1).trim();
        const value = rawValue.replace(/^(['"])(.*)\1$/, '$2');
        return [key, value];
      })
  );
}

const packageJson = readJson('package.json');
const appJson = readJson('app.json');
const easJson = readJson('eas.json');
const dotEnv = parseDotEnv('.env');
const resolvedEnvironment = {
  ...dotEnv,
  ...Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== undefined)
  )
};

requireFile('src/config/firebase.ts');
requireFile('src/config/validateEnv.ts');
requireFile('src/services/realtime.ts');
requireFile('src/services/notifications.ts');
requireFile('src/services/pushRegistration.ts');
requireFile('src/api/metrics.ts');
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

const requiredEnvironment = [
  'EXPO_PUBLIC_API_URL',
  'EXPO_PUBLIC_WS_URL',
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID'
];

if (packageJson) {
  const dependencies = packageJson.dependencies || {};
  const devDependencies = packageJson.devDependencies || {};

  for (const dependency of requiredDependencies) {
    if (!dependencies[dependency] && !devDependencies[dependency]) {
      failures.push(`Missing dependency: ${dependency}`);
    }
  }

  if (dependencies['eas-cli'] || devDependencies['eas-cli']) {
    failures.push(
      'eas-cli must not be installed locally. Use npx eas or a global EAS CLI.'
    );
  }
}

for (const key of requiredEnvironment) {
  const value = String(resolvedEnvironment[key] || '').trim();

  if (!value) {
    failures.push(`Missing environment variable: ${key}`);
  }
}

const apiUrl = String(resolvedEnvironment.EXPO_PUBLIC_API_URL || '').trim();
const wsUrl = String(resolvedEnvironment.EXPO_PUBLIC_WS_URL || '').trim();

if (apiUrl && !/^https:\/\//i.test(apiUrl)) {
  failures.push('EXPO_PUBLIC_API_URL must use https://');
}

if (wsUrl && !/^wss:\/\//i.test(wsUrl)) {
  failures.push('EXPO_PUBLIC_WS_URL must use wss://');
}

if (!fs.existsSync(path.join(projectRoot, '.env'))) {
  warnings.push(
    'No local .env file found. This is acceptable only when EAS Build Environment provides all EXPO_PUBLIC_* variables.'
  );
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

  if (packageJson?.version && expo.version !== packageJson.version) {
    failures.push(
      `Version mismatch: package.json=${packageJson.version}, app.json=${expo.version || 'missing'}`
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

const firebaseSource = readTextWithoutBom(
  path.join(projectRoot, 'src/config/firebase.ts')
);

if (
  !firebaseSource.includes('initializeAuth') ||
  !firebaseSource.includes('getReactNativePersistence') ||
  !firebaseSource.includes('AsyncStorage')
) {
  failures.push('Firebase React Native persistence is not configured');
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
  console.log('OK: release structure and environment check passed');
}
