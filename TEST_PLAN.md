# Test Plan: background.js

This document outlines the testing strategy for `src/background.js` — the service worker that drives the zabbix-vue browser extension.

## Status

- ✅ **Export refactoring**: Key functions exported from `background.js` for testability
- ✅ **Test file**: `src/__tests__/background.test.js` — 45 test cases across 12 describe blocks
- ✅ **zabbix-promise.js tests**: `src/lib/__tests__/zabbix-promise.test.js` — 25 tests (6 skipped pending PR #91)

## Mocking Requirements

### Browser Extension APIs (`webextension-polyfill`)

Mock the `browser` object globally before importing `background.js`:

```js
const mockBrowser = {
  storage: {
    local: { get: vi.fn(), set: vi.fn() },
    session: { get: vi.fn(), set: vi.fn() },
  },
  alarms: {
    get: vi.fn(),
    create: vi.fn(),
    onAlarm: { addListener: vi.fn() },
  },
  runtime: {
    onMessage: { addListener: vi.fn() },
    onInstalled: { addListener: vi.fn() },
    onStartup: { addListener: vi.fn() },
    getURL: vi.fn((path) => `chrome-extension://id/${path}`),
  },
  action: {
    setBadgeBackgroundColor: vi.fn(),
    setBadgeText: vi.fn(),
    setIcon: vi.fn(),
  },
  notifications: { create: vi.fn() },
  i18n: { getMessage: vi.fn((key) => key) },
  offscreen: { createDocument: vi.fn() },
};
```

### virtual:render-svg

> **Note:** This import is still present in `background.js` on `master` but was removed
> in the `fix/code-quality-improvements` branch (PR #89) in favor of a prebuild script
> using `@resvg/resvg-js`. The test mock maps icon names to `images/<name>.png` paths
> to match the prebuild output. Once PR #89 is merged, the mock and the import can be
> removed entirely.

```js
vi.mock('virtual:render-svg', () => ({
  manifest: {
    '1': {
      'sev_-1': 'images/sev_-1.png',
      'sev_0': 'images/sev_0.png',
      // ...
      'unconfigured': 'images/unconfigured.png',
    },
  },
}));
```

### Other Mocks

```js
// Crypto — identity pass-through
vi.mock('./lib/crypto.js', () => ({
  encryptSettingKeys: vi.fn((s) => s),
  decryptSettings: vi.fn((s) => s),
}));

// Zabbix class — controlled API responses
vi.mock('./lib/zabbix-promise.js', () => ({
  Zabbix: vi.fn().mockImplementation(() => ({
    login: vi.fn().mockResolvedValue(),
    call: vi.fn().mockResolvedValue({ result: [] }),
    logout: vi.fn().mockResolvedValue(),
  })),
}));

// Browser globals
vi.stubGlobal('__BROWSER__', 'chrome');
vi.stubGlobal('self', { addEventListener: vi.fn() });
vi.stubGlobal('registration', { showNotification: vi.fn() });
```

---

## Export Strategy

✅ **Implemented**: Named exports added at the bottom of `background.js`:

```js
export {
  getSettings, migrateOldSettings, setAlarmState, initalize,
  getServerTriggers, getAllTriggers, sendNotify, playSounds,
  setBrowserIcon, setActiveTriggersTable, handleMessage,
  ZABBIX_SERVERS_KEY,
};
```

This is additive — the extension runtime behavior is unchanged. The exports simply make the functions importable in test files.

---

## Functions Tested

### 1. `getSettings()` ✅
| Test | Description |
|------|-------------|
| returns parsed settings | `browser.storage.local.get` returns valid JSON |
| returns null when empty | No `ZabbixServers` key in storage |
| reads correct key | Verifies `ZABBIX_SERVERS_KEY` is used |

### 2. `setAlarmState(interval)` ✅
| Test | Description |
|------|-------------|
| creates alarm when none exists | `browser.alarms.get` → null → `create` called |
| skips when alarm exists | `browser.alarms.get` → alarm → `create` NOT called |
| correct period from seconds | `300s → 5 min` |
| handles small intervals | `30s → 0.5 min` |

### 3. `migrateOldSettings()` ✅
| Test | Description |
|------|-------------|
| migrates iv-format settings | Decrypts → re-encrypts per-key → saves |
| no-op for migrated settings | No `iv` key → no writes |
| no-op for empty settings | Null → no writes |

### 4. `getServerTriggers(...)` ✅
| Test | Description |
|------|-------------|
| successful trigger fetch | Returns array, verifies login/call/logout chain |
| correct Zabbix client params | URL, user, pass, apiToken, version passed correctly |
| API error handling | Returns `{ error, errorMessage, errorDetails }` |
| network failure | Catches thrown errors → error object |
| hideAck option | Sets `withLastEventUnacknowledged: 1` |
| hideMaintenance option | Sets `maintenance: false` |
| group filter | Sets `groupids` when non-empty |
| empty groups | No `groupids` when groups is `[]` |
| min_severity | Passes `minPriority` as `min_severity` |
| clears popupTable error | Removes stale error from session storage |

### 5. `getAllTriggers()` ✅
| Test | Description |
|------|-------------|
| null when no settings | Returns null |
| null when no servers | Returns null |
| single server + badge | Processes server, sets badge count |
| clears badge | Badge text `""` when no triggers |
| new trigger notifications | Detects diff, calls `sendNotify` for new triggers |
| notify disabled | No notifications when `global.notify` is false |
| removes stale servers | Deletes trigger data for unconfigured servers |
| server error handling | Error doesn't increment trigger count |

### 6. `sendNotify(message, displayName)` ✅
| Test | Description |
|------|-------------|
| Chrome notification | Uses `registration.showNotification` |
| severity icon | Maps priority to correct `sev_N.png` |
| displayName field | Uses the right host field (`name` vs `host`) |

### 7. `playSounds(settings)` ✅
| Test | Description |
|------|-------------|
| Chrome sound | Creates offscreen document for audio |
| sound disabled | No offscreen document when sound is off |

### 8. `setBrowserIcon(severity)` ✅
| Test | Description |
|------|-------------|
| severity icon | Sets icon path to `images/sev_N.png` |
| unconfigured icon | Sets icon path to `images/unconfigured.png` |

### 9. `setActiveTriggersTable(triggerResults)` ✅
| Test | Description |
|------|-------------|
| empty results | Returns null |
| builds popup table | Correct structure with servers, triggers, headers |
| highest severity icon | Sets browser icon to max priority |
| error → unconfigured | Server error sets unconfigured icon |
| server URL/version | Looks up and includes URL and version from settings |

### 10. `handleMessage(request, sender, sendResponse)` ✅
| Test | Description |
|------|-------------|
| always returns true | Required for async messaging |
| submitPagination | Updates sort config in storage |

### 11. `initalize()` ✅
| Test | Description |
|------|-------------|
| sets alarm from settings | Reads interval, creates alarm |
| default 60s fallback | Missing interval → 60s |
| null settings | No alarm created |

---

## File Structure

```
src/
├── lib/
│   ├── __tests__/
│   │   └── zabbix-promise.test.js   ← Zabbix API client tests (25 tests)
│   └── zabbix-promise.js
├── __tests__/
│   └── background.test.js           ← Service worker tests (45 tests)
└── background.js                     ← Exports added for testability
```

---

## Running Tests

```bash
npm install
npm test          # vitest run (single run)
npm run test:watch  # vitest (watch mode)
```
