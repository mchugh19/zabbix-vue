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

  return {
    mockBrowser: {
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
    },
    mockZabbixInstance: _mockZabbixInstance,
    MockZabbix: _MockZabbix,
  };
});

vi.mock('webextension-polyfill', () => ({
  default: mockBrowser,
}));

// Mock crypto.js
vi.mock('../lib/crypto.js', () => ({
  encryptSettingKeys: vi.fn((s) => s),
  decryptSettings: vi.fn((s) => s),
}));

// Mock Zabbix class — reference hoisted MockZabbix constructor
vi.mock('../lib/zabbix-promise.js', () => ({
  Zabbix: MockZabbix,
}));

// ── Now import the module under test ────────────────────────────────────────

import {
  getSettings,
  migrateOldSettings,
  setAlarmState,
  initalize,
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
import { encryptSettingKeys, decryptSettings } from '../lib/crypto.js';

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
  mockZabbixInstance.call.mockResolvedValue({ result: [] });
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

  // ── getServerTriggers ─────────────────────────────────────────────────

  describe('getServerTriggers()', () => {
    beforeEach(() => {
      stubPopupTable({});
    });

    it('returns triggers on successful API call', async () => {
      const triggers = [
        { triggerid: '1', description: 'CPU high', priority: '3' },
        { triggerid: '2', description: 'Disk full', priority: '4' },
      ];
      mockZabbixInstance.call.mockResolvedValue({ result: triggers });

      const result = await getServerTriggers(
        'https://zabbix.example.com', 'admin', 'pass', '', '7.0.0',
        [], false, false, 0
      );

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

    it('constructs Zabbix client with correct parameters', async () => {
      mockZabbixInstance.call.mockResolvedValue({ result: [] });

      await getServerTriggers(
        'https://zbx.local', 'user1', 'pass1', 'api-token-1', '6.4.0',
        [], false, false, 2
      );

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

      const result = await getServerTriggers(
        'https://zabbix.example.com', 'admin', 'pass', '', '7.0.0',
        [], false, false, 0
      );

      expect(result).toHaveProperty('error', true);
      expect(result).toHaveProperty('errorMessage');
      expect(result).toHaveProperty('errorDetails', 'Invalid params No permissions');
    });

    it('returns error object on network failure', async () => {
      mockZabbixInstance.login.mockRejectedValue(new Error('Network timeout'));

      const result = await getServerTriggers(
        'https://zabbix.example.com', 'admin', 'pass', '', '7.0.0',
        [], false, false, 0
      );

      expect(result).toHaveProperty('error', true);
      expect(result.errorDetails).toBe('Network timeout');
    });

    it('sets withLastEventUnacknowledged when hideAck is true', async () => {
      mockZabbixInstance.call.mockResolvedValue({ result: [] });

      await getServerTriggers(
        'https://zabbix.example.com', 'admin', 'pass', '', '7.0.0',
        [], true, false, 0
      );

      expect(mockZabbixInstance.call).toHaveBeenCalledWith(
        'trigger.get',
        expect.objectContaining({ withLastEventUnacknowledged: 1 })
      );
    });

    it('sets maintenance=false when hideMaintenance is true', async () => {
      mockZabbixInstance.call.mockResolvedValue({ result: [] });

      await getServerTriggers(
        'https://zabbix.example.com', 'admin', 'pass', '', '7.0.0',
        [], false, true, 0
      );

      expect(mockZabbixInstance.call).toHaveBeenCalledWith(
        'trigger.get',
        expect.objectContaining({ maintenance: false })
      );
    });

    it('sets groupids when groups are provided', async () => {
      mockZabbixInstance.call.mockResolvedValue({ result: [] });

      await getServerTriggers(
        'https://zabbix.example.com', 'admin', 'pass', '', '7.0.0',
        ['1', '5', '10'], false, false, 0
      );

      expect(mockZabbixInstance.call).toHaveBeenCalledWith(
        'trigger.get',
        expect.objectContaining({ groupids: ['1', '5', '10'] })
      );
    });

    it('does not set groupids when groups is empty', async () => {
      mockZabbixInstance.call.mockResolvedValue({ result: [] });

      await getServerTriggers(
        'https://zabbix.example.com', 'admin', 'pass', '', '7.0.0',
        [], false, false, 0
      );

      const callArgs = mockZabbixInstance.call.mock.calls[0][1];
      expect(callArgs).not.toHaveProperty('groupids');
    });

    it('passes min_severity from minPriority parameter', async () => {
      mockZabbixInstance.call.mockResolvedValue({ result: [] });

      await getServerTriggers(
        'https://zabbix.example.com', 'admin', 'pass', '', '7.0.0',
        [], false, false, 3
      );

      expect(mockZabbixInstance.call).toHaveBeenCalledWith(
        'trigger.get',
        expect.objectContaining({ min_severity: 3 })
      );
    });

    it('clears existing error in popupTable', async () => {
      stubPopupTable({ error: true, errorMessage: 'old error', servers: [] });
      mockZabbixInstance.call.mockResolvedValue({ result: [] });

      await getServerTriggers(
        'https://zabbix.example.com', 'admin', 'pass', '', '7.0.0',
        [], false, false, 0
      );

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
      mockZabbixInstance.call.mockResolvedValue({ result: triggers });

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

      mockZabbixInstance.call.mockResolvedValue({ result: newTriggers });

      await getAllTriggers();

      // Should notify for the new trigger (triggerid 2 is new)
      // In chrome mode, uses registration.showNotification
      expect(registration.showNotification).toHaveBeenCalledTimes(1);
      expect(registration.showNotification).toHaveBeenCalledWith(
        'Srv 2',
        expect.objectContaining({ body: 'New trigger' })
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
      mockZabbixInstance.call.mockResolvedValue({ result: triggers });

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
      mockZabbixInstance.call.mockResolvedValue({
        result: [
          {
            triggerid: '1', description: 'Test', priority: '3',
            lastchange: '1717100000',
            hosts: [{ host: 'srv', name: 'Srv', hostid: '10', maintenance_status: '0' }],
            lastEvent: { eventid: '100', acknowledged: '0' },
          },
        ],
      });

      await getAllTriggers();

      // Badge should show 1 (only from the successful server)
      expect(mockBrowser.action.setBadgeText).toHaveBeenCalledWith({ text: '1' });
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

  // ── initalize ─────────────────────────────────────────────────────────

  describe('initalize()', () => {
    it('sets alarm interval from settings and calls getAllTriggers', async () => {
      const settings = makeSettings({ global: { interval: 180 } });

      // initalize calls getSettings, then setAlarmState, then getAllTriggers
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

      await initalize();

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
            // First call from initalize() — no global to trigger catch
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

      await initalize();

      // Should fall back to 60 seconds = 1 minute
      expect(mockBrowser.alarms.create).toHaveBeenCalledWith('default-alarm', {
        delayInMinutes: 1,
        periodInMinutes: 1,
      });
    });

    it('does nothing when settings are null', async () => {
      stubSettings(null);

      await initalize();

      expect(mockBrowser.alarms.create).not.toHaveBeenCalled();
    });
  });
});
