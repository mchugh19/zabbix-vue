# Test Plan: background.js

This document outlines the testing strategy for `src/background.js` — the service worker that drives the zabbix-vue browser extension.

## Mocking Requirements

### Browser Extension APIs (`webextension-polyfill`)

Mock the `browser` object globally before importing `background.js`:

```js
vi.mock('webextension-polyfill', () => ({
  default: {
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
  },
}));
```

### Other Imports

```js
vi.mock('virtual:render-svg', () => ({
  manifest: {
    '1': {
      'sev_-1': 'images/sev_-1.png',
      'sev_0': 'images/sev_0.png',
      // ... etc
      'unconfigured': 'images/unconfigured.png',
    },
  },
}));

vi.mock('./lib/crypto.js', () => ({
  encryptSettingKeys: vi.fn((s) => s),
  decryptSettings: vi.fn((s) => s),
}));
```

### Zabbix Class

Mock `./lib/zabbix-promise.js` to control API responses without real network calls:

```js
vi.mock('./lib/zabbix-promise.js', () => ({
  Zabbix: vi.fn().mockImplementation(() => ({
    login: vi.fn().mockResolvedValue(),
    call: vi.fn().mockResolvedValue({ result: [] }),
    logout: vi.fn().mockResolvedValue(),
  })),
}));
```

### `__BROWSER__` Global

The code uses `__BROWSER__` (injected by Vite at build time). Define it in tests:

```js
vi.stubGlobal('__BROWSER__', 'chrome');
```

---

## Export Strategy

`background.js` currently does not export its functions — they're all module-scoped. To test, either:

1. **Refactor for testability** (recommended): Export key functions (`getSettings`, `getServerTriggers`, `getAllTriggers`, `setAlarmState`, `setActiveTriggersTable`, `migrateOldSettings`) from the module and test them directly.

2. **Integration-style**: Import the module as a side-effect, let the lifecycle listeners register, then invoke them via the mocked `browser.runtime.onInstalled.addListener` callback. More fragile but doesn't require code changes.

**Recommendation**: Option 1. Add `export { getSettings, getServerTriggers, getAllTriggers, ... }` at the bottom of `background.js` — this doesn't affect the extension runtime.

---

## Functions to Test

### 1. `getSettings()`

| Test Case | Description |
|-----------|-------------|
| returns parsed settings | `browser.storage.local.get` returns valid JSON |
| returns null when empty | No `ZabbixServers` key in storage |

### 2. `setAlarmState(interval)`

| Test Case | Description |
|-----------|-------------|
| creates alarm when none exists | `browser.alarms.get` returns null → `create` called |
| skips creation when alarm exists | `browser.alarms.get` returns an alarm → `create` NOT called |
| calculates correct period | `interval=120` → `periodInMinutes: 2` |

### 3. `migrateOldSettings()`

| Test Case | Description |
|-----------|-------------|
| migrates encrypted settings | Settings with `iv` key → decrypts → re-encrypts per-key → saves |
| no-op for already migrated settings | Settings without `iv` key → no writes |
| no-op for empty settings | No settings → no writes |

### 4. `getServerTriggers(server, user, pass, apiToken, version, groups, hideAck, hideMaintenance, minPriority)`

| Test Case | Description |
|-----------|-------------|
| successful trigger fetch | Returns array of triggers from `trigger.get` |
| handles Zabbix API error | Returns error object with `error`, `errorMessage`, `errorDetails` |
| handles network failure | Catches thrown error → returns error object |
| respects hideAck option | `hideAck=true` → sets `withLastEventUnacknowledged: 1` |
| respects hideMaintenance | `hideMaintenance=true` → sets `maintenance: false` |
| respects group filter | `groups=['1','2']` → sets `groupids` |
| clears existing error in popupTable | Removes stale `error` key from session storage |
| passes onVersionChange callback | Callback persists auto-detected version to storage |

### 5. `getAllTriggers()`

| Test Case | Description |
|-----------|-------------|
| processes multiple servers | Iterates all servers in settings, calls `getServerTriggers` for each |
| detects new triggers (diff) | Compares new vs old trigger lists by `triggerid` |
| sends notifications for new triggers | Calls `sendNotify` for each new trigger when `global.notify` is true |
| updates badge count | Sets badge text to total trigger count |
| clears badge when no triggers | `triggerCount === 0` → badge text is `""` |
| handles server error gracefully | Server error doesn't increment trigger count |
| removes stale server data | Servers no longer in config are removed from `triggerResults` |
| returns null when no servers configured | Settings empty or no servers |

### 6. `setActiveTriggersTable(triggerResults)`

| Test Case | Description |
|-----------|-------------|
| builds popup table from triggers | Maps trigger data into popup-friendly rows |
| sets browser icon to highest severity | `topSeverity` drives `setBrowserIcon` |
| sets unconfigured icon on error | Any server error → `unconfigured` icon |
| handles empty trigger results | Returns null when no data |
| looks up server URL from settings | Matches by alias |

### 7. `handleMessage(request, sender, sendResponse)`

| Test Case | Description |
|-----------|-------------|
| reinitalize method | Calls `initalize()` |
| submitPagination method | Updates sort config in storage |

### 8. `sendNotify(message, displayName)`

| Test Case | Description |
|-----------|-------------|
| creates Firefox notification | When `__BROWSER__` is `firefox` |
| creates Chrome notification | When `__BROWSER__` is `chrome`, calls `showNotification` |

### 9. `initalize()`

| Test Case | Description |
|-----------|-------------|
| sets alarm interval from settings | Reads `global.interval` |
| uses default 60s on missing interval | Falls back gracefully |
| calls getAllTriggers | Triggers a full poll cycle |

---

## Suggested File Structure

```
src/
├── lib/
│   ├── __tests__/
│   │   └── zabbix-promise.test.js   ← (already written)
│   └── zabbix-promise.js
├── __tests__/
│   └── background.test.js           ← new
└── background.js
```

---

## Priority Order

1. **`getServerTriggers`** — Most critical: covers the Zabbix API interaction, error handling, and the new version auto-detect callback
2. **`getAllTriggers`** — Core polling loop: trigger diff, notifications, badge updates
3. **`setActiveTriggersTable`** — Popup data generation and icon management
4. **`getSettings` / `setAlarmState`** — Simple but good for coverage
5. **`migrateOldSettings`** — Migration path for older extension versions
6. **`handleMessage`** — Message routing
7. **`sendNotify` / `playSounds`** — Browser-specific notification code
