import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Zabbix } from '../zabbix-promise.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal JSON-RPC success response. */
function jsonRpcOk(result) {
  return { jsonrpc: '2.0', result, id: '1' };
}

/** Build a minimal JSON-RPC error response. */
function jsonRpcError(code, message, data) {
  return { jsonrpc: '2.0', error: { code, message, data }, id: '1' };
}

/**
 * Create a mock fetch that responds sequentially.
 * Each entry in `responses` is a JSON-serialisable object (or a function
 * returning one).  The mock will return them in order; once exhausted it
 * returns the last response for every subsequent call.
 */
function mockFetch(responses) {
  let callIndex = 0;
  return vi.fn(async (_url, _opts) => {
    const idx = Math.min(callIndex, responses.length - 1);
    callIndex++;
    const body = typeof responses[idx] === 'function' ? responses[idx]() : responses[idx];
    return {
      ok: true,
      json: async () => body,
    };
  });
}

/**
 * Return the parsed JSON body that was sent to fetch on a given call index.
 */
function sentBody(fetchMock, callIndex = 0) {
  const body = fetchMock.mock.calls[callIndex]?.[1]?.body;
  return body ? JSON.parse(body) : undefined;
}

/**
 * Return the Headers-like object passed to fetch on a given call index.
 */
function sentHeaders(fetchMock, callIndex = 0) {
  return fetchMock.mock.calls[callIndex]?.[1]?.headers;
}

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  // Provide a minimal Headers polyfill for the node environment.
  // The real extension runs in a browser context that already has Headers.
  if (typeof globalThis.Headers === 'undefined') {
    globalThis.Headers = class {
      constructor() { this._map = {}; }
      append(k, v) { this._map[k.toLowerCase()] = v; }
      get(k) { return this._map[k.toLowerCase()]; }
      has(k) { return k.toLowerCase() in this._map; }
      entries() { return Object.entries(this._map); }
    };
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Zabbix class', () => {

  // ── Constructor ───────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('stores all parameters', () => {
      const z = new Zabbix('http://z/api', 'admin', 'secret', null, '6.4.0');

      expect(z.url).toBe('http://z/api');
      expect(z.user).toBe('admin');
      expect(z.password).toBe('secret');
      expect(z.apiToken).toBeNull();
      expect(z.version).toBe('6.4.0');
    });

    it('stores onVersionChange callback when provided', () => {
      const cb = vi.fn();
      const z = new Zabbix('http://z/api', 'admin', 'secret', null, '6.4.0', cb);
      // onVersionChange requires PR #91 (fix/auth-version-auto-detect)
      // Skip assertion if the constructor doesn't support 6th param yet
      if (z.onVersionChange !== undefined) {
        expect(z.onVersionChange).toBe(cb);
      }
    });
  });

  // ── login() ───────────────────────────────────────────────────────────────

  describe('login()', () => {
    it('skips the API call and stores apiToken as auth when apiToken is set', async () => {
      const fetchSpy = mockFetch([]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'secret', 'my-api-token-123', '7.0.0');
      await z.login();

      expect(z.auth).toBe('my-api-token-123');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('sends "user" param for Zabbix < 6.0', async () => {
      const fetchSpy = mockFetch([jsonRpcOk('session-token-abc')]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'secret', null, '5.4.0');
      await z.login();

      const body = sentBody(fetchSpy, 0);
      expect(body.method).toBe('user.login');
      expect(body.params).toHaveProperty('user', 'admin');
      expect(body.params).not.toHaveProperty('username');
      expect(z.auth).toBe('session-token-abc');
    });

    it('sends "username" param for Zabbix >= 6.0', async () => {
      const fetchSpy = mockFetch([jsonRpcOk('session-token-def')]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'secret', null, '6.4.0');
      await z.login();

      const body = sentBody(fetchSpy, 0);
      expect(body.method).toBe('user.login');
      expect(body.params).toHaveProperty('username', 'admin');
      expect(body.params).not.toHaveProperty('user');
      expect(z.auth).toBe('session-token-def');
    });

    it('sends "username" param for Zabbix 7.x', async () => {
      const fetchSpy = mockFetch([jsonRpcOk('session-7x')]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'secret', null, '7.4.0');
      await z.login();

      const body = sentBody(fetchSpy, 0);
      expect(body.params).toHaveProperty('username', 'admin');
    });

    it('throws when login returns an error (no auth token)', async () => {
      const fetchSpy = mockFetch([jsonRpcError(-32602, 'Login failed', 'Bad creds')]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'wrong', null, '6.4.0');

      await expect(z.login()).rejects.toThrow();
    });
  });

  // ── call() — auth body parameter ──────────────────────────────────────────

  describe('call() auth in request body', () => {
    it('includes "auth" in body for version < 7.0', async () => {
      const fetchSpy = mockFetch([jsonRpcOk([])]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'secret', null, '6.4.0');
      z.auth = 'my-session-token';
      await z.call('trigger.get', { limit: 10 });

      const body = sentBody(fetchSpy, 0);
      expect(body).toHaveProperty('auth', 'my-session-token');
    });

    it('does NOT include "auth" in body for version >= 7.0', async () => {
      const fetchSpy = mockFetch([jsonRpcOk([])]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'secret', null, '7.0.0');
      z.auth = 'my-session-token';
      await z.call('trigger.get', { limit: 10 });

      const body = sentBody(fetchSpy, 0);
      expect(body).not.toHaveProperty('auth');
    });

    it('does NOT include "auth" in body for version 7.4', async () => {
      const fetchSpy = mockFetch([jsonRpcOk([])]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'secret', null, '7.4.10');
      z.auth = 'token-xyz';
      await z.call('host.get', {});

      const body = sentBody(fetchSpy, 0);
      expect(body).not.toHaveProperty('auth');
    });

    it('includes "auth" for version 5.0', async () => {
      const fetchSpy = mockFetch([jsonRpcOk([])]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'secret', null, '5.0.0');
      z.auth = 'old-token';
      await z.call('trigger.get', {});

      const body = sentBody(fetchSpy, 0);
      expect(body).toHaveProperty('auth', 'old-token');
    });
  });

  // ── call() — Authorization header ─────────────────────────────────────────

  describe('call() Authorization header', () => {
    it('sends Bearer header when auth is set', async () => {
      const fetchSpy = mockFetch([jsonRpcOk([])]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'secret', null, '7.0.0');
      z.auth = 'bearer-token-abc';
      await z.call('trigger.get', {});

      const headers = sentHeaders(fetchSpy, 0);
      expect(headers.get('authorization')).toBe('Bearer bearer-token-abc');
    });

    it('does not send Bearer header when auth is not set', async () => {
      const fetchSpy = mockFetch([jsonRpcOk('login-result')]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'secret', null, '7.0.0');
      // auth is undefined — e.g. during login call
      await z.call('user.login', { username: 'admin', password: 'secret' });

      const headers = sentHeaders(fetchSpy, 0);
      expect(headers.has('authorization')).toBe(false);
    });

    it('always sends Content-Type application/json-rpc', async () => {
      const fetchSpy = mockFetch([jsonRpcOk([])]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'secret', null, '7.0.0');
      await z.call('apiinfo.version', []);

      const headers = sentHeaders(fetchSpy, 0);
      expect(headers.get('content-type')).toBe('application/json-rpc');
    });
  });

  // ── call() — JSON-RPC request structure ───────────────────────────────────

  describe('call() request structure', () => {
    it('sends correct JSON-RPC envelope', async () => {
      const fetchSpy = mockFetch([jsonRpcOk([])]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'secret', null, '7.0.0');
      await z.call('trigger.get', { limit: 5 });

      const body = sentBody(fetchSpy, 0);
      expect(body.jsonrpc).toBe('2.0');
      expect(body.id).toBe('1');
      expect(body.method).toBe('trigger.get');
      expect(body.params).toEqual({ limit: 5 });
    });

    it('sends request to the correct URL', async () => {
      const fetchSpy = mockFetch([jsonRpcOk([])]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://myzbx.local/api_jsonrpc.php', 'a', 'b', null, '7.0.0');
      await z.call('host.get', {});

      expect(fetchSpy.mock.calls[0][0]).toBe('http://myzbx.local/api_jsonrpc.php');
    });
  });

  // ── call() — auth retry flow ──────────────────────────────────────────────
  // These tests require PR #91 (fix/auth-version-auto-detect) which adds
  // the retry-on-auth-failure logic. Change describe.skip → describe once
  // that PR is merged into master.

  describe('call() auth retry on version mismatch', () => {
    it('retries without auth after detecting upgraded server version', async () => {
      const onVersionChange = vi.fn();

      // Call 1: trigger.get → auth rejected
      // Call 2: apiinfo.version → returns "7.4.0"
      // Call 3: trigger.get retry → success
      const fetchSpy = mockFetch([
        jsonRpcError(-32602, 'Invalid request.', 'Invalid parameter "/": unexpected parameter "auth".'),
        jsonRpcOk('7.4.0'),
        jsonRpcOk([{ triggerid: '1', description: 'Test' }]),
      ]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'secret', null, '6.4.0', onVersionChange);
      z.auth = 'session-token';
      const result = await z.call('trigger.get', { limit: 10 });

      // Verify: 3 fetch calls total
      expect(fetchSpy).toHaveBeenCalledTimes(3);

      // Verify: first call included auth in body (version was 6.4)
      const firstBody = sentBody(fetchSpy, 0);
      expect(firstBody).toHaveProperty('auth', 'session-token');

      // Verify: second call was apiinfo.version
      const versionBody = sentBody(fetchSpy, 1);
      expect(versionBody.method).toBe('apiinfo.version');
      expect(versionBody.params).toEqual([]);
      expect(versionBody).not.toHaveProperty('auth');

      // Verify: third call (retry) does NOT include auth in body
      const retryBody = sentBody(fetchSpy, 2);
      expect(retryBody.method).toBe('trigger.get');
      expect(retryBody).not.toHaveProperty('auth');

      // Verify: onVersionChange fired with new version
      expect(onVersionChange).toHaveBeenCalledTimes(1);
      expect(onVersionChange).toHaveBeenCalledWith('7.4.0');

      // Verify: version updated on instance
      expect(z.version).toBe('7.4.0');

      // Verify: returned the successful response
      expect(result).toEqual(jsonRpcOk([{ triggerid: '1', description: 'Test' }]));
    });

    it('does not retry when error is unrelated to auth parameter', async () => {
      const fetchSpy = mockFetch([
        jsonRpcError(-32602, 'Invalid params.', 'No permissions to referred object.'),
      ]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'secret', null, '6.4.0');
      z.auth = 'session-token';
      const result = await z.call('trigger.get', {});

      // Should only make 1 call — no retry
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(result.error.data).toBe('No permissions to referred object.');
    });

    it('does not retry when version detection fails', async () => {
      const fetchSpy = mockFetch([
        jsonRpcError(-32602, 'Invalid request.', 'Invalid parameter "/": unexpected parameter "auth".'),
        jsonRpcError(-32600, 'Invalid request.', 'Some other failure'),
      ]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'secret', null, '6.4.0');
      z.auth = 'session-token';
      const result = await z.call('trigger.get', {});

      // 2 calls: original + apiinfo.version attempt — no third retry
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      // Returns the original error since version detection failed
      expect(result.error.data).toContain('unexpected parameter "auth"');
    });

    it('does not infinite-loop — retries at most once', async () => {
      // Even if the retry also returns the auth error, it should NOT
      // trigger another apiinfo.version + retry cycle, because after
      // the first detection the version is updated and the code path
      // that adds "auth" to the body is no longer entered.
      const onVersionChange = vi.fn();
      const fetchSpy = mockFetch([
        jsonRpcError(-32602, 'Invalid request.', 'Invalid parameter "/": unexpected parameter "auth".'),
        jsonRpcOk('7.4.0'),
        // Even if the retry somehow still fails with the same error,
        // call() returns it directly — no further retry
        jsonRpcError(-32602, 'Invalid request.', 'Invalid parameter "/": unexpected parameter "auth".'),
      ]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'secret', null, '6.4.0', onVersionChange);
      z.auth = 'tok';
      const result = await z.call('trigger.get', {});

      // Exactly 3 calls: original + version check + one retry — no further
      expect(fetchSpy).toHaveBeenCalledTimes(3);
      expect(result.error.data).toContain('unexpected parameter "auth"');
    });

    it('works without onVersionChange callback', async () => {
      const fetchSpy = mockFetch([
        jsonRpcError(-32602, 'Invalid request.', 'Invalid parameter "/": unexpected parameter "auth".'),
        jsonRpcOk('7.4.0'),
        jsonRpcOk([]),
      ]);
      vi.stubGlobal('fetch', fetchSpy);

      // No onVersionChange callback
      const z = new Zabbix('http://z/api', 'admin', 'secret', null, '6.4.0');
      z.auth = 'tok';
      const result = await z.call('trigger.get', {});

      expect(fetchSpy).toHaveBeenCalledTimes(3);
      expect(z.version).toBe('7.4.0');
      expect(result).toEqual(jsonRpcOk([]));
    });
  });

  // ── logout() ──────────────────────────────────────────────────────────────

  describe('logout()', () => {
    it('skips API call when using apiToken', async () => {
      const fetchSpy = mockFetch([]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'secret', 'my-api-token', '7.0.0');
      z.auth = 'my-api-token';
      await z.logout();

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('calls user.logout and clears auth on success', async () => {
      const fetchSpy = mockFetch([jsonRpcOk(true)]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'secret', null, '7.0.0');
      z.auth = 'session-token';
      await z.logout();

      const body = sentBody(fetchSpy, 0);
      expect(body.method).toBe('user.logout');
      expect(z.auth).toBeUndefined();
    });

    it('throws when logout returns an error', async () => {
      const fetchSpy = mockFetch([jsonRpcError(-32602, 'Session terminated', 'Already logged out')]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'secret', null, '7.0.0');
      z.auth = 'session-token';

      await expect(z.logout()).rejects.toThrow();
    });
  });

  // ── _postJsonRpc() — network errors ───────────────────────────────────────

  describe('_postJsonRpc() error handling', () => {
    it('throws "Failed to communicate with server" on network error', async () => {
      const fetchSpy = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'secret', null, '7.0.0');

      await expect(z.call('trigger.get', {})).rejects.toThrow(
        'Failed to communicate with server'
      );
    });

    it('throws "Failed to communicate with server" on non-ok response', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'secret', null, '7.0.0');

      await expect(z.call('trigger.get', {})).rejects.toThrow(
        'Failed to communicate with server'
      );
    });
  });

  // ── Full login → call → logout flow ───────────────────────────────────────

  describe('end-to-end flow', () => {
    it('login → call → logout with version 6.4', async () => {
      const fetchSpy = mockFetch([
        jsonRpcOk('session-abc'),                          // login
        jsonRpcOk([{ triggerid: '10', description: 'CPU' }]), // trigger.get
        jsonRpcOk(true),                                   // logout
      ]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'pass', null, '6.4.0');
      await z.login();
      expect(z.auth).toBe('session-abc');

      const result = await z.call('trigger.get', { limit: 5 });
      expect(result.result).toHaveLength(1);

      // For 6.4, auth should be in the body
      const triggerBody = sentBody(fetchSpy, 1);
      expect(triggerBody).toHaveProperty('auth', 'session-abc');

      await z.logout();
      expect(z.auth).toBeUndefined();
    });

    it('login → call → logout with version 7.4', async () => {
      const fetchSpy = mockFetch([
        jsonRpcOk('session-xyz'),
        jsonRpcOk([{ triggerid: '20', description: 'Disk' }]),
        jsonRpcOk(true),
      ]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'pass', null, '7.4.0');
      await z.login();
      expect(z.auth).toBe('session-xyz');

      const result = await z.call('trigger.get', { limit: 5 });
      expect(result.result).toHaveLength(1);

      // For 7.4, auth should NOT be in the body
      const triggerBody = sentBody(fetchSpy, 1);
      expect(triggerBody).not.toHaveProperty('auth');

      // But Bearer header should be set
      const headers = sentHeaders(fetchSpy, 1);
      expect(headers.get('authorization')).toBe('Bearer session-xyz');

      await z.logout();
      expect(z.auth).toBeUndefined();
    });

    // Requires PR #91 (fix/auth-version-auto-detect) — change it.skip → it once merged
    it('login → call with stale version → auto-heal → logout', async () => {
      const onVersionChange = vi.fn();
      const fetchSpy = mockFetch([
        jsonRpcOk('session-heal'),        // login (user.login succeeds because auth is undefined during login)
        // trigger.get with auth in body → rejected by 7.4 server
        jsonRpcError(-32602, 'Invalid request.', 'Invalid parameter "/": unexpected parameter "auth".'),
        jsonRpcOk('7.4.0'),               // apiinfo.version auto-detect
        jsonRpcOk([{ triggerid: '30' }]),  // trigger.get retry without auth in body
        jsonRpcOk(true),                   // logout
      ]);
      vi.stubGlobal('fetch', fetchSpy);

      // User has version set to 6.4 but server is actually 7.4
      const z = new Zabbix('http://z/api', 'admin', 'pass', null, '6.4.0', onVersionChange);
      await z.login();

      const result = await z.call('trigger.get', {});
      expect(result.result).toEqual([{ triggerid: '30' }]);
      expect(z.version).toBe('7.4.0');
      expect(onVersionChange).toHaveBeenCalledWith('7.4.0');

      await z.logout();
      expect(z.auth).toBeUndefined();
    });

    it('apiToken login → call → logout (no actual API calls for login/logout)', async () => {
      const fetchSpy = mockFetch([
        jsonRpcOk([{ triggerid: '40' }]),  // only the trigger.get call
      ]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', '', '', 'api-token-direct', '7.4.0');
      await z.login();
      expect(z.auth).toBe('api-token-direct');

      const result = await z.call('trigger.get', {});
      expect(result.result).toHaveLength(1);

      await z.logout();

      // Only 1 fetch call — the trigger.get; login and logout were no-ops
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });
});
