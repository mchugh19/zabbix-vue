// Dist smoke test for zabbix-vue.
// Loads the BUILT background.js from dist/ in a Node VM with mocked browser APIs.
// Catches bundler breakage that unit tests can't see (e.g. the vite-plugin-web-extension
// side-effect import bug that silently dropped the browser shim from dist/).
//
// Run: npm run test:dist (builds first)
// CI: runs after `npm run build` for each TARGET.

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIST_BG = join(ROOT, 'dist', 'background.js');

let pass = 0;
let fail = 0;
function assert(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ FAIL: ' + label); }
}

// ---------- mocked browser APIs ----------
const listeners = { onMessage: [], onInstalled: [], onStartup: [], onAlarm: [], onNotifClicked: [] };
const storageData = {};

const browserMock = {
  runtime: {
    onMessage: { addListener: (fn) => listeners.onMessage.push(fn) },
    onInstalled: { addListener: (fn) => listeners.onInstalled.push(fn) },
    onStartup: { addListener: (fn) => listeners.onStartup.push(fn) },
    sendMessage: async () => ({}),
    getManifest: () => ({ version: '3.2.0' }),
  },
  alarms: {
    onAlarm: {
      addListener: (fn) => listeners.onAlarm.push(fn),
      removeListener: () => {},
    },
    get: async () => null,
    create: async () => {},
    clear: async () => {},
  },
  storage: {
    local: {
      get: async (key) => {
        const k = typeof key === 'string' ? key : Object.keys(key || {})[0];
        return k && storageData[k] !== undefined ? { [k]: storageData[k] } : {};
      },
      set: async (obj) => { Object.assign(storageData, obj); },
      remove: async (key) => { delete storageData[key]; },
    },
    session: {
      get: async () => ({}),
      set: async () => {},
    },
  },
  notifications: {
    onClicked: { addListener: (fn) => listeners.onNotifClicked.push(fn) },
    create: async () => {},
    clear: async () => {},
  },
  action: {
    setBadgeText: () => {},
    setBadgeBackgroundColor: () => {},
  },
  tabs: {
    create: async () => {},
  },
};

// ---------- run ----------
console.log('\n--- dist smoke test ---');

if (!existsSync(DIST_BG)) {
  console.log('  ✗ FAIL: dist/background.js not found. Run `npm run build` first.');
  process.exit(1);
}
assert(true, 'dist/background.js exists');

const bgSrc = readFileSync(DIST_BG, 'utf8');
assert(bgSrc.length > 1000, `bundle has substance (${bgSrc.length} bytes)`);

// The browser shim must survive bundling (regression test for the
// vite-plugin-web-extension side-effect import bug).
assert(
  bgSrc.includes('globalThis.browser') || bgSrc.includes('globalThis.chrome'),
  'browser shim present in bundle (globalThis.browser/chrome)'
);

// Execute the bundle in a VM with mocked globals.
const sandbox = {
  console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  fetch: async () => { throw new Error('fetch not mocked for smoke test'); },
  URL, TextEncoder, TextDecoder, structuredClone,
  crypto: { subtle: {}, getRandomValues: (arr) => arr },
  navigator: { userAgent: 'node-smoke-test' },
  addEventListener: () => {}, // service worker lifecycle (activate, notificationclick)
  // No globalThis.browser/chrome here — the bundle's shim must resolve them.
  // We provide `chrome` so `globalThis.chrome` works; `browser` stays undefined
  // to prove the fallback path functions.
  chrome: browserMock,
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;

let loadError = null;
try {
  vm.createContext(sandbox);
  vm.runInContext(bgSrc, sandbox, { filename: 'background.js' });
} catch (e) {
  loadError = e;
}
assert(!loadError, `bundle executes without throwing${loadError ? ': ' + loadError.message : ''}`);

// The background must wire up its listeners on load.
assert(listeners.onMessage.length > 0, 'runtime.onMessage listener registered');
assert(listeners.onInstalled.length > 0, 'runtime.onInstalled listener registered');
assert(listeners.onStartup.length > 0, 'runtime.onStartup listener registered');
assert(listeners.onAlarm.length > 0, 'alarms.onAlarm listener registered');

// ---------- summary ----------
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
