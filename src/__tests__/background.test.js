import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks — vi.hoisted ensures these are available when vi.mock runs ────────

const { mockBrowser, mockZabbixInstance, MockZabbix } = vi.hoisted(() => {
  // Globals used by background.js top-level code — must exist before module loads
  globalThis.__BROWSER__ = 'chrome';
  globalThis.self = { addEventListener: vi.fn() };
  globalThis.registration = { showNotification: vi.fn() };

  const _mockZabbixInstance = {
    login: vi.fn().mockResolvedValue(),
    call: vi.fn().mockResolvedValue({ result: [] }),
    logout: vi.fn().mockResolvedValue(),
  };

  // Constructor mock must use `function` (not arrow) so it's valid with `new`.
  // Vitest 4+ enforces this; arrow functions are not constructors in JS.
  const _MockZabbix = vi.fn(function () {
    return {
      login: _mockZabbixInstance.login,
      call: _mockZabbixInstance.call,
      logout: _mockZabbixInstance.logout,
    };
  });

  // Expose browser globally — background.js uses the native global, not an import
  const _mockBrowser = {
      storage: {
        local: { get: vi.fn(), set: vi.fn() },
        session: { get: vi.fn(), set: vi.fn() },
      },
      alarms: {
        get: vi.fn(),
        create: vi.fn(),
        onAlarm: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      runtime: {
        onMessage: { addListener: vi.fn() },
        onInstalled: { addListener: vi.fn() },
        onStartup: { addListener: vi.fn() },
        getURL: vi.fn((path) => `chrome-extension://ext-id/${path}`),
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

  globalThis.browser = _mockBrowser;

  return {
    mockBrowser: _mockBrowser,
    mockZabbixInstance: _mockZabbixInstance,
    MockZabbix: _MockZabbix,
  };
});


// Mock crypto.js
vi.mock('../lib/crypto.js', () => ({
  encryptSettingKeys: vi.fn((s) => s),
  decryptSettings: vi.fn((s) => s),
  isLegacyFormat: vi.fn((data) => {
    if (!data) return false;
    try {
      const parsed = JSON.parse(data);
      return parsed.cipher === 'aes' && parsed.mode === 'ccm';
    } catch { return false; }
  }),
}));

// Mock Zabbix class — reference hoisted MockZabbix constructor
vi.mock('../lib/zabbix-promise.js', () => ({
  Zabbix: MockZabbix,
}));

// ── Now import the module under test ────────────────────────────────────────

import {
  getSettings,
  migrateOldSettings,
  migrateCryptoFormat,
  setAlarmState,
  initialize,
  clearPopupTableError,
  buildTriggerRequest,
  makeVersionPersister,
  getEffectiveSeverity,
  getSuppressedTriggerIds,
  filterSuppressedTriggers,
  getServerTriggers,
  getAllTriggers,
  sendNotify,
  playSounds,
  setBrowserIcon,
  setActiveTriggersTable,
  handleMessage,
  ZABBIX_SERVERS_KEY,
} from '../background.js';

import { Zabbix } from '../lib/zabbix-promise.js';
import { encryptSettingKeys, decryptSettings, isLegacyFormat } from '../lib/crypto.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Build a typical settings object with one server */
function makeSettings(overrides = {}) {
  return {
    global: {
      interval: 120,
      notify: true,
      displayName: 'name',
      sound: false,
      ...overrides.global,
    },
    servers: overrides.servers || [
      {
        alias: 'Zabbix Prod',
        url: 'https://zabbix.example.com',
        user: 'admin',
        pass: 'encrypted-pass',
        version: '7.0.0',
        apiToken: '',
        hostGroups: [],
        hide: false,
        maintenance: false,
        minSeverity: 0,
        sortBy: [{ key: 'priority', order: 'DESC' }],
      },
    ],
  };
}

/** Configure mockBrowser.storage.local.get to return settings */
function stubSettings(settings) {
  mockBrowser.storage.local.get.mockResolvedValue({
    [ZABBIX_SERVERS_KEY]: settings ? JSON.stringify(settings) : undefined,
  });
}

/** Configure mockBrowser.storage.session.get for popupTable */
function stubPopupTable(popupTable) {
  mockBrowser.storage.session.get.mockResolvedValue({
    popupTable: popupTable || {},
  });
}

/**
 * Configure mockZabbixInstance.call to handle trigger.get and event.get.
 * triggers: array returned for trigger.get
 * suppressedTriggerIds: trigger IDs to exclude from event.get results (suppressed)
 */
function stubZabbixCalls(triggers, suppressedTriggerIds = []) {
  const events = triggers
    .filter(t => !suppressedTriggerIds.includes(t.triggerid))
    .map(t => ({ eventid: `e${t.triggerid}`, objectid: t.triggerid }));
  mockZabbixInstance.call.mockImplementation(async (method) => {
    if (method === 'trigger.get') {
      return { result: triggers };
    }
    if (method === 'event.get') {
      return { result: events };
    }
    return { result: [] };
  });
}

/** Configure mockBrowser.storage.local.get to return triggerResults */
function stubTriggerResults(triggerResults) {
  // local.get is also used for settings, so we need a smarter mock
  mockBrowser.storage.local.get.mockImplementation(async (key) => {
    if (key === ZABBIX_SERVERS_KEY) {
      return { [ZABBIX_SERVERS_KEY]: undefined };
    }
    if (key === 'triggerResults') {
      return { triggerResults: triggerResults || {} };
    }
    return {};
  });
}

// ── Setup / Teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Restore default mock implementations
  mockZabbixInstance.login.mockResolvedValue();
  // Default: trigger.get returns [], event.get returns events for requested objectids
  // (i.e. nothing suppressed). Tests can override with stubZabbixCalls().
  mockZabbixInstance.call.mockImplementation(async (method, params) => {
    if (method === 'event.get' && params && params.objectids) {
      return { result: params.objectids.map(id => ({ eventid: `e${id}`, objectid: id })) };
    }
    return { result: [] };
  });
  mockZabbixInstance.logout.mockResolvedValue();
  // Default: empty popupTable in session storage
  stubPopupTable({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('background.js', () => {

  // ── getSettings ─────────────────────────────────────────────────────────

  describe('getSettings()', () => {
    it('returns parsed settings when ZabbixServers key exists', async () => {
      const settings = makeSettings();
      stubSettings(settings);

      const result = await getSettings();
      expect(result).toEqual(settings);
    });

    it('returns null when ZabbixServers key is empty', async () => {
      stubSettings(null);

      const result = await getSettings();
      expect(result).toBeNull();
    });

    it('reads from browser.storage.local with correct key', async () => {
      stubSettings(null);
      await getSettings();

      expect(mockBrowser.storage.local.get).toHaveBeenCalledWith(ZABBIX_SERVERS_KEY);
    });
  });

  // ── setAlarmState ───────────────────────────────────────────────────────

  describe('setAlarmState()', () => {
    it('creates alarm when none exists', async () => {
      mockBrowser.alarms.get.mockResolvedValue(null);

      await setAlarmState(120);

      expect(mockBrowser.alarms.create).toHaveBeenCalledWith('default-alarm', {
        delayInMinutes: 2,
        periodInMinutes: 2,
      });
    });

    it('skips creation when alarm already exists', async () => {
      mockBrowser.alarms.get.mockResolvedValue({ name: 'default-alarm' });

      await setAlarmState(120);

      expect(mockBrowser.alarms.create).not.toHaveBeenCalled();
    });

    it('calculates correct period from seconds', async () => {
      mockBrowser.alarms.get.mockResolvedValue(null);

      await setAlarmState(300); // 5 minutes

      expect(mockBrowser.alarms.create).toHaveBeenCalledWith('default-alarm', {
        delayInMinutes: 5,
        periodInMinutes: 5,
      });
    });

    it('handles small intervals', async () => {
      mockBrowser.alarms.get.mockResolvedValue(null);

      await setAlarmState(30); // 30 seconds = 0.5 min

      expect(mockBrowser.alarms.create).toHaveBeenCalledWith('default-alarm', {
        delayInMinutes: 0.5,
        periodInMinutes: 0.5,
      });
    });
  });

  // ── migrateOldSettings ────────────────────────────────────────────────

  describe('migrateOldSettings()', () => {
    it('migrates settings with iv key (old encrypted format)', async () => {
      const oldSettings = { iv: 'some-iv-data', data: 'encrypted-blob' };
      stubSettings(oldSettings);

      // decryptSettings returns a JSON string
      decryptSettings.mockReturnValue(JSON.stringify({ servers: [] }));
      // encryptSettingKeys returns the settings object
      encryptSettingKeys.mockReturnValue({ servers: [] });

      await migrateOldSettings();

      expect(decryptSettings).toHaveBeenCalled();
      expect(encryptSettingKeys).toHaveBeenCalled();
      expect(mockBrowser.storage.local.set).toHaveBeenCalledWith({
        ZabbixServers: JSON.stringify({ servers: [] }),
      });
    });

    it('does nothing when settings have no iv key (already migrated)', async () => {
      stubSettings(makeSettings());

      await migrateOldSettings();

      expect(decryptSettings).not.toHaveBeenCalled();
      expect(encryptSettingKeys).not.toHaveBeenCalled();
      // set is not called because no migration needed
      expect(mockBrowser.storage.local.set).not.toHaveBeenCalled();
    });

    it('does nothing when no settings exist', async () => {
      stubSettings(null);

      await migrateOldSettings();

      expect(decryptSettings).not.toHaveBeenCalled();
    });
  });

  // ── migrateCryptoFormat ─────────────────────────────────────────────────

  describe('migrateCryptoFormat()', () => {
    it('re-encrypts servers with legacy sjcl-formatted fields', async () => {
      const legacyEncrypted = JSON.stringify({ iv: 'abc', cipher: 'aes', mode: 'ccm', ct: 'xyz' });
      stubSettings({
        global: { interval: 60 },
        servers: [
          { alias: 'Test', url: 'https://z.example.com', apiToken: legacyEncrypted, pass: legacyEncrypted },
        ],
      });

      await migrateCryptoFormat();

      // decryptSettings called for both apiToken and pass
      expect(decryptSettings).toHaveBeenCalledTimes(2);
      // encryptSettingKeys called to re-encrypt the whole settings
      expect(encryptSettingKeys).toHaveBeenCalledTimes(1);
      // saved back to storage
      expect(mockBrowser.storage.local.set).toHaveBeenCalled();
    });

    it('does nothing when fields are already in v2 format', async () => {
      const v2Encrypted = JSON.stringify({ v: 2, alg: 'AES-GCM', iv: 'abc', ct: 'xyz' });
      stubSettings({
        global: { interval: 60 },
        servers: [
          { alias: 'Test', url: 'https://z.example.com', apiToken: v2Encrypted, pass: v2Encrypted },
        ],
      });

      await migrateCryptoFormat();

      expect(decryptSettings).not.toHaveBeenCalled();
      expect(encryptSettingKeys).not.toHaveBeenCalled();
      expect(mockBrowser.storage.local.set).not.toHaveBeenCalled();
    });

    it('does nothing when no settings exist', async () => {
      stubSettings(null);

      await migrateCryptoFormat();

      expect(decryptSettings).not.toHaveBeenCalled();
      expect(mockBrowser.storage.local.set).not.toHaveBeenCalled();
    });

    it('handles mixed servers — only migrates legacy ones', async () => {
      const legacyEncrypted = JSON.stringify({ iv: 'abc', cipher: 'aes', mode: 'ccm', ct: 'xyz' });
      const v2Encrypted = JSON.stringify({ v: 2, alg: 'AES-GCM', iv: 'abc', ct: 'xyz' });
      stubSettings({
        global: { interval: 60 },
        servers: [
          { alias: 'Old', apiToken: '', pass: legacyEncrypted },
          { alias: 'New', apiToken: v2Encrypted, pass: v2Encrypted },
        ],
      });

      await migrateCryptoFormat();

      // Only the legacy pass field triggers decryption
      expect(decryptSettings).toHaveBeenCalledTimes(1);
      expect(encryptSettingKeys).toHaveBeenCalledTimes(1);
      expect(mockBrowser.storage.local.set).toHaveBeenCalled();
    });
  });

  // ── clearPopupTableError ─────────────────────────────────────────────

  describe('clearPopupTableError()', () => {
    it('clears error fields from popupTable', async () => {
      stubPopupTable({ error: true, errorMessage: 'old error', errorDetails: 'details', servers: [] });

      await clearPopupTableError();

      expect(mockBrowser.storage.session.set).toHaveBeenCalledWith({
        popupTable: expect.not.objectContaining({ error: true }),
      });
    });

    it('does nothing when popupTable has no error', async () => {
      stubPopupTable({ servers: [] });

      await clearPopupTableError();

      expect(mockBrowser.storage.session.set).not.toHaveBeenCalled();
    });
  });

  // ── buildTriggerRequest ─────────────────────────────────────────────

  describe('buildTriggerRequest()', () => {
    it('builds base request with minSeverity', () => {
      const req = buildTriggerRequest({
        hostGroups: [], hide: false, maintenance: false, minSeverity: 3,
      });

      expect(req.min_severity).toBe(3);
      expect(req.expandDescription).toBe(1);
      expect(req).not.toHaveProperty('withLastEventUnacknowledged');
      expect(req).not.toHaveProperty('groupids');
    });

    it('requests severity in selectLastEvent', () => {
      const req = buildTriggerRequest({
        hostGroups: [], hide: false, maintenance: false, minSeverity: 0,
      });

      expect(req.selectLastEvent).toContain('severity');
    });

    it('sets withLastEventUnacknowledged when hide is true', () => {
      const req = buildTriggerRequest({
        hostGroups: [], hide: true, maintenance: false, minSeverity: 0,
      });

      expect(req.withLastEventUnacknowledged).toBe(1);
    });

    it('sets maintenance=false when maintenance is true', () => {
      const req = buildTriggerRequest({
        hostGroups: [], hide: false, maintenance: true, minSeverity: 0,
      });

      expect(req.maintenance).toBe(false);
    });

    it('sets groupids when hostGroups are provided', () => {
      const req = buildTriggerRequest({
        hostGroups: ['1', '5', '10'], hide: false, maintenance: false, minSeverity: 0,
      });

      expect(req.groupids).toEqual(['1', '5', '10']);
    });
  });

  // ── getSuppressedTriggerIds ─────────────────────────────────────────

  describe('getSuppressedTriggerIds()', () => {
    it('returns IDs of suppressed triggers', async () => {
      const triggers = [
        { triggerid: '1', description: 'T1' },
        { triggerid: '2', description: 'T2' },
      ];
      mockZabbixInstance.call.mockResolvedValue({
        result: [{ eventid: 'e1', objectid: '1' }],  // trigger 2 suppressed
      });

      const result = await getSuppressedTriggerIds(mockZabbixInstance, triggers);

      expect(result).toEqual(new Set(['2']));
      expect(mockZabbixInstance.call).toHaveBeenCalledWith(
        'event.get',
        expect.objectContaining({
          suppressed: false,
          objectids: ['1', '2'],
        })
      );
    });

    it('returns empty set when nothing is suppressed', async () => {
      const triggers = [
        { triggerid: '1', description: 'T1' },
        { triggerid: '2', description: 'T2' },
      ];
      mockZabbixInstance.call.mockResolvedValue({
        result: [
          { eventid: 'e1', objectid: '1' },
          { eventid: 'e2', objectid: '2' },
        ],
      });

      const result = await getSuppressedTriggerIds(mockZabbixInstance, triggers);

      expect(result).toEqual(new Set());
    });

    it('returns empty set when event.get fails', async () => {
      const triggers = [{ triggerid: '1', description: 'T1' }];
      mockZabbixInstance.call.mockResolvedValue({
        error: { message: 'API error', data: '' },
      });

      const result = await getSuppressedTriggerIds(mockZabbixInstance, triggers);

      expect(result).toEqual(new Set());
    });
  });

  // ── filterSuppressedTriggers ──────────────────────────────────────────

  describe('filterSuppressedTriggers()', () => {
    it('removes triggers with suppressed events', async () => {
      const triggers = [
        { triggerid: '1', description: 'T1' },
        { triggerid: '2', description: 'T2' },
      ];
      mockZabbixInstance.call.mockResolvedValue({
        result: [{ eventid: 'e1', objectid: '1' }],  // trigger 2 suppressed
      });

      const result = await filterSuppressedTriggers(mockZabbixInstance, triggers);

      expect(result).toEqual([triggers[0]]);
    });

    it('keeps all triggers when none are suppressed', async () => {
      const triggers = [
        { triggerid: '1', description: 'T1' },
        { triggerid: '2', description: 'T2' },
      ];
      mockZabbixInstance.call.mockResolvedValue({
        result: [
          { eventid: 'e1', objectid: '1' },
          { eventid: 'e2', objectid: '2' },
        ],
      });

      const result = await filterSuppressedTriggers(mockZabbixInstance, triggers);

      expect(result).toEqual(triggers);
    });
  });

  // ── getEffectiveSeverity ──────────────────────────────────────────────

  describe('getEffectiveSeverity()', () => {
    it('prefers event severity over trigger priority', () => {
      const trigger = {
        priority: '2',
        lastEvent: { eventid: '100', acknowledged: '0', severity: '4' },
      };

      expect(getEffectiveSeverity(trigger)).toBe(4);
    });

    it('falls back to trigger priority when event severity is missing', () => {
      const trigger = {
        priority: '3',
        lastEvent: { eventid: '100', acknowledged: '0' },
      };

      expect(getEffectiveSeverity(trigger)).toBe('3');
    });

    it('falls back to trigger priority when lastEvent is missing', () => {
      const trigger = { priority: '5' };

      expect(getEffectiveSeverity(trigger)).toBe('5');
    });

    it('handles null event severity', () => {
      const trigger = {
        priority: '2',
        lastEvent: { eventid: '100', acknowledged: '0', severity: null },
      };

      expect(getEffectiveSeverity(trigger)).toBe('2');
    });
  });

  // ── getServerTriggers ─────────────────────────────────────────────────

  describe('getServerTriggers()', () => {
    const defaultConfig = {
      url: 'https://zabbix.example.com',
      user: 'admin',
      pass: 'pass',
      apiToken: '',
      version: '7.0.0',
      hostGroups: [],
      hide: false,
      maintenance: false,
      minSeverity: 0,
    };

    beforeEach(() => {
      stubPopupTable({});
    });

    it('returns triggers on successful API call', async () => {
      const triggers = [
        { triggerid: '1', description: 'CPU high', priority: '3' },
        { triggerid: '2', description: 'Disk full', priority: '4' },
      ];
      stubZabbixCalls(triggers);

      const result = await getServerTriggers(defaultConfig);

      expect(result).toEqual(triggers);
      expect(mockZabbixInstance.login).toHaveBeenCalled();
      expect(mockZabbixInstance.call).toHaveBeenCalledWith(
        'trigger.get',
        expect.objectContaining({
          expandDescription: 1,
          skipDependent: 1,
          active: 1,
          min_severity: 0,
        })
      );
      expect(mockZabbixInstance.logout).toHaveBeenCalled();
    });

    it('filters out suppressed triggers by default', async () => {
      const triggers = [
        { triggerid: '1', description: 'CPU high', priority: '3' },
        { triggerid: '2', description: 'Disk full', priority: '4' },
      ];
      stubZabbixCalls(triggers, ['2']);  // trigger 2 is suppressed

      const result = await getServerTriggers(defaultConfig);

      expect(result).toEqual([triggers[0]]);
      expect(mockZabbixInstance.call).toHaveBeenCalledWith(
        'event.get',
        expect.objectContaining({
          suppressed: false,
          objectids: ['1', '2'],
        })
      );
    });

    it('marks suppressed triggers when showSuppressed is true', async () => {
      const triggers = [
        { triggerid: '1', description: 'CPU high', priority: '3' },
        { triggerid: '2', description: 'Disk full', priority: '4' },
      ];
      stubZabbixCalls(triggers, ['2']);  // trigger 2 is suppressed

      const result = await getServerTriggers({ ...defaultConfig, showSuppressed: true });

      expect(result).toHaveLength(2);
      expect(result[0].suppressed).toBe(false);
      expect(result[1].suppressed).toBe(true);
      expect(mockZabbixInstance.call).toHaveBeenCalledWith(
        'event.get',
        expect.objectContaining({ suppressed: false })
      );
    });

    it('returns unfiltered triggers when event.get fails', async () => {
      const triggers = [
        { triggerid: '1', description: 'CPU high', priority: '3' },
      ];
      mockZabbixInstance.call.mockImplementation(async (method) => {
        if (method === 'trigger.get') {
          return { result: triggers };
        }
        return { error: { message: 'API error', data: '' } };
      });

      const result = await getServerTriggers(defaultConfig);

      expect(result).toEqual(triggers);
    });

    it('constructs Zabbix client with correct parameters', async () => {
      mockZabbixInstance.call.mockResolvedValue({ result: [] });

      await getServerTriggers({
        ...defaultConfig,
        url: 'https://zbx.local',
        user: 'user1',
        pass: 'pass1',
        apiToken: 'api-token-1',
        version: '6.4.0',
        minSeverity: 2,
      });

      expect(Zabbix).toHaveBeenCalledWith(
        'https://zbx.local/api_jsonrpc.php',
        'user1',
        'pass1',
        'api-token-1',
        '6.4.0',
        expect.any(Function)
      );
    });

    it('returns error object when API returns error', async () => {
      mockZabbixInstance.call.mockResolvedValue({
        error: { message: 'Invalid params', data: 'No permissions' },
      });

      const result = await getServerTriggers(defaultConfig);

      expect(result).toHaveProperty('error', true);
      expect(result).toHaveProperty('errorMessage');
      expect(result).toHaveProperty('errorDetails', 'Invalid params No permissions');
    });

    it('returns error object on network failure', async () => {
      mockZabbixInstance.login.mockRejectedValue(new Error('Network timeout'));

      const result = await getServerTriggers(defaultConfig);

      expect(result).toHaveProperty('error', true);
      expect(result.errorDetails).toBe('Network timeout');
    });

    it('sets withLastEventUnacknowledged when hide is true', async () => {
      mockZabbixInstance.call.mockResolvedValue({ result: [] });

      await getServerTriggers({ ...defaultConfig, hide: true });

      expect(mockZabbixInstance.call).toHaveBeenCalledWith(
        'trigger.get',
        expect.objectContaining({ withLastEventUnacknowledged: 1 })
      );
    });

    it('sets maintenance=false when maintenance is true', async () => {
      mockZabbixInstance.call.mockResolvedValue({ result: [] });

      await getServerTriggers({ ...defaultConfig, maintenance: true });

      expect(mockZabbixInstance.call).toHaveBeenCalledWith(
        'trigger.get',
        expect.objectContaining({ maintenance: false })
      );
    });

    it('sets groupids when hostGroups are provided', async () => {
      mockZabbixInstance.call.mockResolvedValue({ result: [] });

      await getServerTriggers({ ...defaultConfig, hostGroups: ['1', '5', '10'] });

      expect(mockZabbixInstance.call).toHaveBeenCalledWith(
        'trigger.get',
        expect.objectContaining({ groupids: ['1', '5', '10'] })
      );
    });

    it('does not set groupids when hostGroups is empty', async () => {
      mockZabbixInstance.call.mockResolvedValue({ result: [] });

      await getServerTriggers(defaultConfig);

      const callArgs = mockZabbixInstance.call.mock.calls[0][1];
      expect(callArgs).not.toHaveProperty('groupids');
    });

    it('passes min_severity from minSeverity', async () => {
      mockZabbixInstance.call.mockResolvedValue({ result: [] });

      await getServerTriggers({ ...defaultConfig, minSeverity: 3 });

      expect(mockZabbixInstance.call).toHaveBeenCalledWith(
        'trigger.get',
        expect.objectContaining({ min_severity: 3 })
      );
    });

    it('clears existing error in popupTable', async () => {
      stubPopupTable({ error: true, errorMessage: 'old error', servers: [] });
      mockZabbixInstance.call.mockResolvedValue({ result: [] });

      await getServerTriggers(defaultConfig);

      // Should have called session.set to clear the error
      expect(mockBrowser.storage.session.set).toHaveBeenCalledWith({
        popupTable: expect.not.objectContaining({ error: true }),
      });
    });
  });

  // ── getAllTriggers ─────────────────────────────────────────────────────

  describe('getAllTriggers()', () => {
    it('returns null when no settings exist', async () => {
      stubSettings(null);

      const result = await getAllTriggers();
      expect(result).toBeNull();
    });

    it('returns null when no servers are defined', async () => {
      stubSettings({ global: { interval: 60 }, servers: [] });

      const result = await getAllTriggers();
      expect(result).toBeNull();
    });

    it('processes a single server and updates badge', async () => {
      const settings = makeSettings();
      // Need local.get to handle both settings and triggerResults
      mockBrowser.storage.local.get.mockImplementation(async (key) => {
        if (key === ZABBIX_SERVERS_KEY) {
          return { [ZABBIX_SERVERS_KEY]: JSON.stringify(settings) };
        }
        if (key === 'triggerResults') {
          return { triggerResults: {} };
        }
        return {};
      });

      const triggers = [
        {
          triggerid: '1', description: 'CPU high', priority: '4',
          lastchange: '1717100000',
          hosts: [{ host: 'server1', name: 'Server 1', hostid: '10', maintenance_status: '0' }],
          lastEvent: { eventid: '100', acknowledged: '0' },
        },
      ];
      stubZabbixCalls(triggers);

      await getAllTriggers();

      // Badge should show count of 1
      expect(mockBrowser.action.setBadgeText).toHaveBeenCalledWith({ text: '1' });
      expect(mockBrowser.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#888888' });
    });

    it('clears badge when no triggers found', async () => {
      const settings = makeSettings();
      mockBrowser.storage.local.get.mockImplementation(async (key) => {
        if (key === ZABBIX_SERVERS_KEY) {
          return { [ZABBIX_SERVERS_KEY]: JSON.stringify(settings) };
        }
        if (key === 'triggerResults') {
          return { triggerResults: {} };
        }
        return {};
      });

      mockZabbixInstance.call.mockResolvedValue({ result: [] });

      await getAllTriggers();

      expect(mockBrowser.action.setBadgeText).toHaveBeenCalledWith({ text: '' });
    });

    it('detects new triggers and sends notifications', async () => {
      const settings = makeSettings();
      const oldTriggers = [
        {
          triggerid: '1', description: 'Old trigger', priority: '3',
          hosts: [{ host: 'srv', name: 'Srv', hostid: '10', maintenance_status: '0' }],
          lastEvent: { eventid: '100', acknowledged: '0' },
        },
      ];
      const newTriggers = [
        ...oldTriggers,
        {
          triggerid: '2', description: 'New trigger', priority: '4',
          lastchange: '1717200000',
          hosts: [{ host: 'srv2', name: 'Srv 2', hostid: '11', maintenance_status: '0' }],
          lastEvent: { eventid: '101', acknowledged: '0' },
        },
      ];

      mockBrowser.storage.local.get.mockImplementation(async (key) => {
        if (key === ZABBIX_SERVERS_KEY) {
          return { [ZABBIX_SERVERS_KEY]: JSON.stringify(settings) };
        }
        if (key === 'triggerResults') {
          return { triggerResults: { 'Zabbix Prod': oldTriggers } };
        }
        return {};
      });

      stubZabbixCalls(newTriggers);

      await getAllTriggers();

      // Should notify for the new trigger (triggerid 2 is new)
      // In chrome mode, uses registration.showNotification
      expect(registration.showNotification).toHaveBeenCalledTimes(1);
      expect(registration.showNotification).toHaveBeenCalledWith(
        'Srv 2',
        expect.objectContaining({ body: 'New trigger' })
      );
    });

    it('batches notification when multiple new triggers arrive on one server', async () => {
      const settings = makeSettings();
      const oldTriggers = [
        {
          triggerid: '1', description: 'Existing', priority: '3',
          hosts: [{ host: 'srv', name: 'Srv', hostid: '10', maintenance_status: '0' }],
          lastEvent: { eventid: '100', acknowledged: '0' },
        },
      ];
      const newTriggers = [
        ...oldTriggers,
        {
          triggerid: '2', description: 'New one', priority: '4',
          lastchange: '1717200000',
          hosts: [{ host: 'web1', name: 'Web 1', hostid: '11', maintenance_status: '0' }],
          lastEvent: { eventid: '101', acknowledged: '0' },
        },
        {
          triggerid: '3', description: 'Another new', priority: '5',
          lastchange: '1717200001',
          hosts: [{ host: 'web2', name: 'Web 2', hostid: '12', maintenance_status: '0' }],
          lastEvent: { eventid: '102', acknowledged: '0' },
        },
      ];

      mockBrowser.storage.local.get.mockImplementation(async (key) => {
        if (key === ZABBIX_SERVERS_KEY) {
          return { [ZABBIX_SERVERS_KEY]: JSON.stringify(settings) };
        }
        if (key === 'triggerResults') {
          return { triggerResults: { 'Zabbix Prod': oldTriggers } };
        }
        return {};
      });

      stubZabbixCalls(newTriggers);

      await getAllTriggers();

      // Should use batched notification (2 new triggers), not individual
      expect(registration.showNotification).toHaveBeenCalledTimes(1);
      expect(registration.showNotification).toHaveBeenCalledWith(
        expect.stringContaining('2 new problems'),
        expect.objectContaining({
          icon: 'images/sev_5.png', // highest severity among new triggers
        })
      );
    });

    it('sends separate batch notifications per server', async () => {
      const settings = makeSettings({
        servers: [
          {
            alias: 'Prod', url: 'https://zbx1.local',
            user: 'a', pass: 'b', version: '7.0.0', apiToken: '',
            hostGroups: [], hide: false, maintenance: false, minSeverity: 0,
            sortBy: [],
          },
          {
            alias: 'Staging', url: 'https://zbx2.local',
            user: 'a', pass: 'b', version: '7.0.0', apiToken: '',
            hostGroups: [], hide: false, maintenance: false, minSeverity: 0,
            sortBy: [],
          },
        ],
      });

      mockBrowser.storage.local.get.mockImplementation(async (key) => {
        if (key === ZABBIX_SERVERS_KEY) {
          return { [ZABBIX_SERVERS_KEY]: JSON.stringify(settings) };
        }
        if (key === 'triggerResults') {
          return { triggerResults: {} }; // no previous triggers — all are new
        }
        return {};
      });

      let triggerGetCount = 0;
      mockZabbixInstance.call.mockImplementation(async (method, params) => {
        if (method === 'event.get') {
          // Nothing suppressed — return events for all requested triggers
          return { result: params.objectids.map(id => ({ eventid: `e${id}`, objectid: id })) };
        }
        triggerGetCount++;
        if (triggerGetCount === 1) {
          // Prod: 3 new triggers → batch
          return {
            result: [
              {
                triggerid: '1', description: 'T1', priority: '3', lastchange: '1',
                hosts: [{ host: 'h1', name: 'H1', hostid: '1', maintenance_status: '0' }],
                lastEvent: { eventid: '1', acknowledged: '0' },
              },
              {
                triggerid: '2', description: 'T2', priority: '4', lastchange: '2',
                hosts: [{ host: 'h2', name: 'H2', hostid: '2', maintenance_status: '0' }],
                lastEvent: { eventid: '2', acknowledged: '0' },
              },
              {
                triggerid: '3', description: 'T3', priority: '2', lastchange: '3',
                hosts: [{ host: 'h3', name: 'H3', hostid: '3', maintenance_status: '0' }],
                lastEvent: { eventid: '3', acknowledged: '0' },
              },
            ],
          };
        }
        // Staging: 1 new trigger → individual notify
        return {
          result: [
            {
              triggerid: '10', description: 'Stg alert', priority: '5', lastchange: '4',
              hosts: [{ host: 's1', name: 'Stg 1', hostid: '10', maintenance_status: '0' }],
              lastEvent: { eventid: '10', acknowledged: '0' },
            },
          ],
        };
      });

      await getAllTriggers();

      // 2 notifications total: one batch (Prod, 3 triggers) + one individual (Staging)
      expect(registration.showNotification).toHaveBeenCalledTimes(2);
      expect(registration.showNotification).toHaveBeenCalledWith(
        expect.stringContaining('3 new problems on Prod'),
        expect.any(Object)
      );
      expect(registration.showNotification).toHaveBeenCalledWith(
        'Stg 1',
        expect.objectContaining({ body: 'Stg alert' })
      );
    });

    it('does not send notifications when notify is disabled', async () => {
      const settings = makeSettings({ global: { notify: false } });

      mockBrowser.storage.local.get.mockImplementation(async (key) => {
        if (key === ZABBIX_SERVERS_KEY) {
          return { [ZABBIX_SERVERS_KEY]: JSON.stringify(settings) };
        }
        if (key === 'triggerResults') {
          return { triggerResults: {} };
        }
        return {};
      });

      const triggers = [
        {
          triggerid: '1', description: 'New trigger', priority: '3',
          lastchange: '1717100000',
          hosts: [{ host: 'srv', name: 'Srv', hostid: '10', maintenance_status: '0' }],
          lastEvent: { eventid: '100', acknowledged: '0' },
        },
      ];
      stubZabbixCalls(triggers);

      await getAllTriggers();

      expect(registration.showNotification).not.toHaveBeenCalled();
    });

    it('removes stale server data not in current config', async () => {
      const settings = makeSettings();

      mockBrowser.storage.local.get.mockImplementation(async (key) => {
        if (key === ZABBIX_SERVERS_KEY) {
          return { [ZABBIX_SERVERS_KEY]: JSON.stringify(settings) };
        }
        if (key === 'triggerResults') {
          return {
            triggerResults: {
              'Zabbix Prod': [],
              'Old Server': [{ triggerid: '99' }], // no longer in config
            },
          };
        }
        return {};
      });

      mockZabbixInstance.call.mockResolvedValue({ result: [] });

      await getAllTriggers();

      // Check that storage.local.set was called with triggerResults
      // that does NOT include 'Old Server'
      const setCall = mockBrowser.storage.local.set.mock.calls.find(
        (c) => c[0].triggerResults !== undefined
      );
      expect(setCall).toBeDefined();
      expect(setCall[0].triggerResults).not.toHaveProperty('Old Server');
    });

    it('handles server error without incrementing trigger count', async () => {
      const settings = makeSettings({
        servers: [
          {
            alias: 'Server OK', url: 'https://zbx1.local',
            user: 'a', pass: 'b', version: '7.0.0', apiToken: '',
            hostGroups: [], hide: false, maintenance: false, minSeverity: 0,
            sortBy: [],
          },
          {
            alias: 'Server Fail', url: 'https://zbx2.local',
            user: 'a', pass: 'b', version: '7.0.0', apiToken: '',
            hostGroups: [], hide: false, maintenance: false, minSeverity: 0,
            sortBy: [],
          },
        ],
      });

      mockBrowser.storage.local.get.mockImplementation(async (key) => {
        if (key === ZABBIX_SERVERS_KEY) {
          return { [ZABBIX_SERVERS_KEY]: JSON.stringify(settings) };
        }
        if (key === 'triggerResults') {
          return { triggerResults: {} };
        }
        return {};
      });

      // First server succeeds with 2 triggers, second fails
      let callCount = 0;
      mockZabbixInstance.login.mockImplementation(async () => {
        callCount++;
        if (callCount === 2) throw new Error('Connection refused');
      });
      stubZabbixCalls([
        {
          triggerid: '1', description: 'Test', priority: '3',
          lastchange: '1717100000',
          hosts: [{ host: 'srv', name: 'Srv', hostid: '10', maintenance_status: '0' }],
          lastEvent: { eventid: '100', acknowledged: '0' },
        },
      ]);

      await getAllTriggers();

      // Badge should show 1 (only from the successful server)
      expect(mockBrowser.action.setBadgeText).toHaveBeenCalledWith({ text: '1' });
    });

    it('aggregates trigger count across multiple successful servers', async () => {
      const settings = makeSettings({
        servers: [
          {
            alias: 'Prod', url: 'https://zbx1.local',
            user: 'a', pass: 'b', version: '7.0.0', apiToken: '',
            hostGroups: [], hide: false, maintenance: false, minSeverity: 0,
            sortBy: [],
          },
          {
            alias: 'Staging', url: 'https://zbx2.local',
            user: 'a', pass: 'b', version: '7.0.0', apiToken: '',
            hostGroups: [], hide: false, maintenance: false, minSeverity: 0,
            sortBy: [],
          },
        ],
      });

      mockBrowser.storage.local.get.mockImplementation(async (key) => {
        if (key === ZABBIX_SERVERS_KEY) {
          return { [ZABBIX_SERVERS_KEY]: JSON.stringify(settings) };
        }
        if (key === 'triggerResults') {
          return { triggerResults: {} };
        }
        return {};
      });

      // Both servers succeed — first returns 2 triggers, second returns 1
      let triggerGetCount = 0;
      mockZabbixInstance.call.mockImplementation(async (method, params) => {
        if (method === 'event.get') {
          return { result: params.objectids.map(id => ({ eventid: `e${id}`, objectid: id })) };
        }
        triggerGetCount++;
        if (triggerGetCount === 1) {
          return {
            result: [
              {
                triggerid: '1', description: 'CPU high', priority: '4',
                lastchange: '1717100000',
                hosts: [{ host: 'web1', name: 'Web 1', hostid: '10', maintenance_status: '0' }],
                lastEvent: { eventid: '100', acknowledged: '0' },
              },
              {
                triggerid: '2', description: 'Disk full', priority: '3',
                lastchange: '1717100001',
                hosts: [{ host: 'web2', name: 'Web 2', hostid: '11', maintenance_status: '0' }],
                lastEvent: { eventid: '101', acknowledged: '0' },
              },
            ],
          };
        }
        return {
          result: [
            {
              triggerid: '10', description: 'Memory low', priority: '2',
              lastchange: '1717100002',
              hosts: [{ host: 'stg1', name: 'Staging 1', hostid: '20', maintenance_status: '0' }],
              lastEvent: { eventid: '200', acknowledged: '0' },
            },
          ],
        };
      });

      await getAllTriggers();

      // Badge should show 3 (2 from Prod + 1 from Staging)
      expect(mockBrowser.action.setBadgeText).toHaveBeenCalledWith({ text: '3' });
      expect(mockBrowser.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#888888' });
    });

    it('first server fails, second succeeds — only counts successful triggers', async () => {
      const settings = makeSettings({
        servers: [
          {
            alias: 'Server Fail', url: 'https://zbx1.local',
            user: 'a', pass: 'b', version: '7.0.0', apiToken: '',
            hostGroups: [], hide: false, maintenance: false, minSeverity: 0,
            sortBy: [],
          },
          {
            alias: 'Server OK', url: 'https://zbx2.local',
            user: 'a', pass: 'b', version: '7.0.0', apiToken: '',
            hostGroups: [], hide: false, maintenance: false, minSeverity: 0,
            sortBy: [],
          },
        ],
      });

      mockBrowser.storage.local.get.mockImplementation(async (key) => {
        if (key === ZABBIX_SERVERS_KEY) {
          return { [ZABBIX_SERVERS_KEY]: JSON.stringify(settings) };
        }
        if (key === 'triggerResults') {
          return { triggerResults: {} };
        }
        return {};
      });

      // First server fails on login, second succeeds with 2 triggers
      let loginCount = 0;
      mockZabbixInstance.login.mockImplementation(async () => {
        loginCount++;
        if (loginCount === 1) throw new Error('Auth failed');
      });
      stubZabbixCalls([
        {
          triggerid: '5', description: 'Latency spike', priority: '4',
          lastchange: '1717100000',
          hosts: [{ host: 'app1', name: 'App 1', hostid: '30', maintenance_status: '0' }],
          lastEvent: { eventid: '300', acknowledged: '0' },
        },
        {
          triggerid: '6', description: 'Queue backlog', priority: '3',
          lastchange: '1717100001',
          hosts: [{ host: 'app2', name: 'App 2', hostid: '31', maintenance_status: '0' }],
          lastEvent: { eventid: '301', acknowledged: '0' },
        },
      ]);

      await getAllTriggers();

      // Badge should show 2 (only from the second server)
      expect(mockBrowser.action.setBadgeText).toHaveBeenCalledWith({ text: '2' });

      // triggerResults should include error for first server and data for second
      const setCall = mockBrowser.storage.local.set.mock.calls.find(
        (c) => c[0].triggerResults !== undefined
      );
      expect(setCall).toBeDefined();
      // Error servers are stripped from persisted triggerResults
      expect(setCall[0].triggerResults).not.toHaveProperty('Server Fail');
      expect(setCall[0].triggerResults).toHaveProperty('Server OK');
    });
  });

  // ── sendNotify ────────────────────────────────────────────────────────

  describe('sendNotify()', () => {
    it('creates Chrome notification via registration.showNotification', async () => {
      const message = {
        description: 'Disk usage critical',
        priority: '4',
        hosts: [{ name: 'web-server-01', host: 'web01' }],
      };

      await sendNotify(message, 'name');

      expect(registration.showNotification).toHaveBeenCalledWith(
        'web-server-01',
        expect.objectContaining({
          body: 'Disk usage critical',
          icon: 'images/sev_4.png',
        })
      );
    });

    it('uses correct severity icon based on priority', async () => {
      const message = {
        description: 'Info event',
        priority: '1',
        hosts: [{ name: 'test-host', host: 'test' }],
      };

      await sendNotify(message, 'name');

      expect(registration.showNotification).toHaveBeenCalledWith(
        'test-host',
        expect.objectContaining({ icon: 'images/sev_1.png' })
      );
    });

    it('uses displayName field from host', async () => {
      const message = {
        description: 'Alert',
        priority: '3',
        hosts: [{ name: 'Display Name', host: 'hostname' }],
      };

      await sendNotify(message, 'host');

      expect(registration.showNotification).toHaveBeenCalledWith(
        'hostname',
        expect.any(Object)
      );
    });

    it('uses event severity for notification icon when manually changed', async () => {
      const message = {
        description: 'Disk usage critical',
        priority: '2',
        hosts: [{ name: 'web-server-01', host: 'web01' }],
        lastEvent: { eventid: '100', acknowledged: '0', severity: '4' },
      };

      await sendNotify(message, 'name');

      expect(registration.showNotification).toHaveBeenCalledWith(
        'web-server-01',
        expect.objectContaining({
          icon: 'images/sev_4.png',
        })
      );
    });
  });

  // ── playSounds ────────────────────────────────────────────────────────

  describe('playSounds()', () => {
    it('creates offscreen document for Chrome when sound enabled', () => {
      const settings = makeSettings({ global: { sound: true } });
      playSounds(settings);

      expect(mockBrowser.offscreen.createDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          reasons: ['AUDIO_PLAYBACK'],
          justification: 'notification',
        })
      );
    });

    it('does nothing when sound is disabled', () => {
      const settings = makeSettings({ global: { sound: false } });
      playSounds(settings);

      expect(mockBrowser.offscreen.createDocument).not.toHaveBeenCalled();
    });
  });

  // ── setBrowserIcon ────────────────────────────────────────────────────

  describe('setBrowserIcon()', () => {
    it('sets icon for severity level', async () => {
      await setBrowserIcon('sev_3');

      expect(mockBrowser.action.setIcon).toHaveBeenCalledWith({
        path: 'images/sev_3.png',
      });
    });

    it('sets unconfigured icon', async () => {
      await setBrowserIcon('unconfigured');

      expect(mockBrowser.action.setIcon).toHaveBeenCalledWith({
        path: 'images/unconfigured.png',
      });
    });
  });

  // ── setActiveTriggersTable ────────────────────────────────────────────

  describe('setActiveTriggersTable()', () => {
    it('returns null for empty trigger results', async () => {
      stubSettings(makeSettings());
      const result = await setActiveTriggersTable({});
      expect(result).toBeNull();
    });

    it('builds popup table from trigger data', async () => {
      const settings = makeSettings();
      stubSettings(settings);

      const triggerResults = {
        'Zabbix Prod': [
          {
            triggerid: '1',
            description: 'CPU high on web server',
            priority: '4',
            lastchange: '1717100000',
            hosts: [{ host: 'web01', name: 'Web Server 01', hostid: '10', maintenance_status: '0' }],
            lastEvent: { eventid: '200', acknowledged: '1' },
          },
        ],
      };

      await setActiveTriggersTable(triggerResults);

      // Should have stored popupTable in session storage
      expect(mockBrowser.storage.session.set).toHaveBeenCalledWith({
        popupTable: expect.objectContaining({
          servers: expect.arrayContaining([
            expect.objectContaining({
              server: 'Zabbix Prod',
              triggers: expect.arrayContaining([
                expect.objectContaining({
                  system: 'Web Server 01',
                  description: 'CPU high on web server',
                  priority: '4',
                  triggerid: '1',
                  hostid: '10',
                  acknowledged: 1,
                }),
              ]),
            }),
          ]),
          headers: expect.any(Array),
        }),
      });
    });

    it('passes suppressed flag through to popup table', async () => {
      const settings = makeSettings();
      stubSettings(settings);

      const triggerResults = {
        'Zabbix Prod': [
          {
            triggerid: '1', description: 'Normal', priority: '3', lastchange: '1',
            hosts: [{ host: 'h', name: 'H', hostid: '1', maintenance_status: '0' }],
            lastEvent: { eventid: '1', acknowledged: '0' },
            suppressed: false,
          },
          {
            triggerid: '2', description: 'Suppressed', priority: '4', lastchange: '2',
            hosts: [{ host: 'h2', name: 'H2', hostid: '2', maintenance_status: '0' }],
            lastEvent: { eventid: '2', acknowledged: '0' },
            suppressed: true,
          },
        ],
      };

      await setActiveTriggersTable(triggerResults);

      expect(mockBrowser.storage.session.set).toHaveBeenCalledWith({
        popupTable: expect.objectContaining({
          servers: expect.arrayContaining([
            expect.objectContaining({
              triggers: expect.arrayContaining([
                expect.objectContaining({ triggerid: '1', suppressed: false }),
                expect.objectContaining({ triggerid: '2', suppressed: true }),
              ]),
            }),
          ]),
        }),
      });
    });

    it('uses event severity over trigger priority when manually changed', async () => {
      const settings = makeSettings();
      stubSettings(settings);

      const triggerResults = {
        'Zabbix Prod': [
          {
            triggerid: '1',
            description: 'CPU high on web server',
            priority: '2',  // trigger configured as Warning
            lastchange: '1717100000',
            hosts: [{ host: 'web01', name: 'Web Server 01', hostid: '10', maintenance_status: '0' }],
            lastEvent: { eventid: '200', acknowledged: '0', severity: '4' },  // event changed to High
          },
        ],
      };

      await setActiveTriggersTable(triggerResults);

      expect(mockBrowser.storage.session.set).toHaveBeenCalledWith({
        popupTable: expect.objectContaining({
          servers: expect.arrayContaining([
            expect.objectContaining({
              triggers: expect.arrayContaining([
                expect.objectContaining({
                  triggerid: '1',
                  priority: 4,
                }),
              ]),
            }),
          ]),
        }),
      });
    });

    it('falls back to trigger priority when event severity is missing', async () => {
      const settings = makeSettings();
      stubSettings(settings);

      const triggerResults = {
        'Zabbix Prod': [
          {
            triggerid: '1',
            description: 'CPU high on web server',
            priority: '3',
            lastchange: '1717100000',
            hosts: [{ host: 'web01', name: 'Web Server 01', hostid: '10', maintenance_status: '0' }],
            lastEvent: { eventid: '200', acknowledged: '0' },  // no severity (older Zabbix)
          },
        ],
      };

      await setActiveTriggersTable(triggerResults);

      expect(mockBrowser.storage.session.set).toHaveBeenCalledWith({
        popupTable: expect.objectContaining({
          servers: expect.arrayContaining([
            expect.objectContaining({
              triggers: expect.arrayContaining([
                expect.objectContaining({
                  triggerid: '1',
                  priority: '3',
                }),
              ]),
            }),
          ]),
        }),
      });
    });

    it('sets browser icon to highest severity', async () => {
      const settings = makeSettings();
      stubSettings(settings);

      const triggerResults = {
        'Zabbix Prod': [
          {
            triggerid: '1', description: 'Low', priority: '2', lastchange: '1',
            hosts: [{ host: 'h', name: 'H', hostid: '1', maintenance_status: '0' }],
            lastEvent: { eventid: '1', acknowledged: '0' },
          },
          {
            triggerid: '2', description: 'High', priority: '5', lastchange: '2',
            hosts: [{ host: 'h2', name: 'H2', hostid: '2', maintenance_status: '0' }],
            lastEvent: { eventid: '2', acknowledged: '0' },
          },
        ],
      };

      await setActiveTriggersTable(triggerResults);

      // Should set icon to highest severity (5 = disaster)
      expect(mockBrowser.action.setIcon).toHaveBeenCalledWith({
        path: 'images/sev_5.png',
      });
    });

    it('sets unconfigured icon when server has error', async () => {
      const settings = makeSettings();
      stubSettings(settings);

      const triggerResults = {
        'Zabbix Prod': {
          error: true,
          errorMessage: 'Connection failed',
          errorDetails: 'Timeout',
        },
      };

      await setActiveTriggersTable(triggerResults);

      expect(mockBrowser.action.setIcon).toHaveBeenCalledWith({
        path: 'images/unconfigured.png',
      });
    });

    it('includes server URL and version from settings', async () => {
      const settings = makeSettings();
      stubSettings(settings);

      const triggerResults = {
        'Zabbix Prod': [
          {
            triggerid: '1', description: 'Test', priority: '3', lastchange: '1',
            hosts: [{ host: 'h', name: 'H', hostid: '1', maintenance_status: '0' }],
            lastEvent: { eventid: '1', acknowledged: '0' },
          },
        ],
      };

      await setActiveTriggersTable(triggerResults);

      const popupTableCall = mockBrowser.storage.session.set.mock.calls[0][0].popupTable;
      const serverEntry = popupTableCall.servers[0];
      expect(serverEntry.url).toBe('https://zabbix.example.com');
      expect(serverEntry.version).toBe('7.0.0');
    });
  });

  // ── handleMessage ─────────────────────────────────────────────────────

  describe('handleMessage()', () => {
    it('returns true for any message', async () => {
      stubSettings(null);
      const result = await handleMessage({ method: 'unknown' }, {}, vi.fn());
      expect(result).toBe(true);
    });

    it('handles submitPagination by updating sort config', async () => {
      const settings = makeSettings();
      // submitPagination calls setActiveTriggersTable() without args.
      // The function now falls back to reading triggerResults from storage.
      mockBrowser.storage.local.get.mockImplementation(async (key) => {
        if (key === ZABBIX_SERVERS_KEY) {
          return { [ZABBIX_SERVERS_KEY]: JSON.stringify(settings) };
        }
        if (key === 'triggerResults') {
          return { triggerResults: {} };
        }
        return {};
      });

      await handleMessage(
        { method: 'submitPagination', sortBy: 'description', descending: 'ASC', index: 0 },
        {},
        vi.fn()
      );

      // Verify the sort config was saved to storage
      const setCallArgs = mockBrowser.storage.local.set.mock.calls;
      const settingsCall = setCallArgs.find((c) => c[0].ZabbixServers !== undefined);
      expect(settingsCall).toBeDefined();

      // Parse the saved settings to verify sort was updated
      const savedSettings = JSON.parse(settingsCall[0].ZabbixServers);
      expect(savedSettings.servers[0].sortBy).toEqual([
        { key: 'description', order: 'ASC' },
      ]);
    });
  });

  // ── initialize ─────────────────────────────────────────────────────────

  describe('initialize()', () => {
    it('sets alarm interval from settings and calls getAllTriggers', async () => {
      const settings = makeSettings({ global: { interval: 180 } });

      // initialize calls getSettings, then setAlarmState, then getAllTriggers
      // getAllTriggers also calls getSettings and storage.local.get('triggerResults')
      mockBrowser.storage.local.get.mockImplementation(async (key) => {
        if (key === ZABBIX_SERVERS_KEY) {
          return { [ZABBIX_SERVERS_KEY]: JSON.stringify(settings) };
        }
        if (key === 'triggerResults') {
          return { triggerResults: {} };
        }
        return {};
      });
      mockBrowser.alarms.get.mockResolvedValue(null);
      mockZabbixInstance.call.mockResolvedValue({ result: [] });

      await initialize();

      expect(mockBrowser.alarms.create).toHaveBeenCalledWith('default-alarm', {
        delayInMinutes: 3,
        periodInMinutes: 3,
      });
    });

    it('uses default 60s interval when global config is missing', async () => {
      // settings.global must be absent so settings["global"]["interval"] throws
      // and the catch block calls setAlarmState(60).
      // But getAllTriggers() re-reads settings and accesses settings.global.notify,
      // so we return proper settings there.
      let callCount = 0;
      mockBrowser.storage.local.get.mockImplementation(async (key) => {
        if (key === ZABBIX_SERVERS_KEY) {
          callCount++;
          if (callCount === 1) {
            // First call from initialize() — no global to trigger catch
            return { [ZABBIX_SERVERS_KEY]: JSON.stringify({ servers: [makeSettings().servers[0]] }) };
          }
          // Subsequent calls from getAllTriggers — full settings
          return { [ZABBIX_SERVERS_KEY]: JSON.stringify(makeSettings()) };
        }
        if (key === 'triggerResults') {
          return { triggerResults: {} };
        }
        return {};
      });
      mockBrowser.alarms.get.mockResolvedValue(null);
      mockZabbixInstance.call.mockResolvedValue({ result: [] });

      await initialize();

      // Should fall back to 60 seconds = 1 minute
      expect(mockBrowser.alarms.create).toHaveBeenCalledWith('default-alarm', {
        delayInMinutes: 1,
        periodInMinutes: 1,
      });
    });

    it('does nothing when settings are null', async () => {
      stubSettings(null);

      await initialize();

      expect(mockBrowser.alarms.create).not.toHaveBeenCalled();
    });
  });
});
