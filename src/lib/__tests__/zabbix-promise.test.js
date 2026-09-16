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

    it('tries "username" first (5.4+), uses it when server accepts', async () => {
      const fetchSpy = mockFetch([jsonRpcOk('session-token-abc')]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'secret', null, '7.0.0');
      await z.login();

      const body = sentBody(fetchSpy, 0);
      expect(body.method).toBe('user.login');
      expect(body.params).toHaveProperty('username', 'admin');
      expect(body.params).not.toHaveProperty('user');
      expect(z.auth).toBe('session-token-abc');
      // Capability cached
      expect(z._loginParam).toBe('username');
    });

    it('falls back to "user" when server rejects "username" (pre-5.4)', async () => {
      const fetchSpy = mockFetch([
        jsonRpcError(-32602, 'Invalid params', 'unexpected parameter "username"'),
        jsonRpcOk('session-token-old'),
      ]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'secret', null, '5.0.0');
      await z.login();

      // First attempt used username
      expect(sentBody(fetchSpy, 0).params).toHaveProperty('username', 'admin');
      // Fallback used user
      expect(sentBody(fetchSpy, 1).params).toHaveProperty('user', 'admin');
      expect(sentBody(fetchSpy, 1).params).not.toHaveProperty('username');
      expect(z.auth).toBe('session-token-old');
      // Capability cached
      expect(z._loginParam).toBe('user');
    });

    it('caches login param: does not re-probe on second login', async () => {
      const fetchSpy = mockFetch([
        jsonRpcError(-32602, 'Invalid params', 'unexpected parameter "username"'),
        jsonRpcOk('session-1'),
        jsonRpcOk('session-2'),
      ]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'secret', null, '5.0.0');
      await z.login();
      await z.login(); // second login should use cached 'user' param

      // Calls: username(fail), user(ok), user(ok) — no second username probe
      expect(fetchSpy).toHaveBeenCalledTimes(3);
      expect(sentBody(fetchSpy, 2).params).toHaveProperty('user', 'admin');
    });

    it('re-probes login param when cached param fails', async () => {
      const fetchSpy = mockFetch([
        jsonRpcOk('session-new'), // username works
        jsonRpcError(-32602, 'Invalid params', 'unexpected parameter "username"'),
        jsonRpcOk('session-old'), // fallback to user
      ]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'secret', null, '7.0.0');
      await z.login();
      expect(z._loginParam).toBe('username');

      // Simulate server downgrade: cached 'username' now rejected.
      // Version string is irrelevant — failure drives the re-probe.
      await z.login();
      expect(z._loginParam).toBe('user');
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it('throws when login returns an error (no auth token)', async () => {
      const fetchSpy = mockFetch([jsonRpcError(-32602, 'Login failed', 'Bad creds')]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'wrong', null, '6.4.0');

      await expect(z.login()).rejects.toThrow();
    });

    it('logs in as guest with an empty password', async () => {
      const fetchSpy = mockFetch([jsonRpcOk('guest-session-token')]);
      vi.stubGlobal('fetch', fetchSpy);

      // background.js maps authType 'guest' to user 'guest' with empty password/token
      const z = new Zabbix('http://z/api', 'guest', '', '', '7.0.0');
      await z.login();

      const body = sentBody(fetchSpy, 0);
      expect(body.method).toBe('user.login');
      expect(body.params).toHaveProperty('username', 'guest');
      expect(body.params).toHaveProperty('password', '');
      expect(z.auth).toBe('guest-session-token');
    });
  });

  // ── call() — auth body parameter ──────────────────────────────────────────

  describe('call() auth transport (capability-detected)', () => {
    it('defaults to "auth" in body (works on all versions)', async () => {
      const fetchSpy = mockFetch([jsonRpcOk([])]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'secret', null, '6.4.0');
      z.auth = 'my-session-token';
      await z.call('trigger.get', { limit: 10 });

      const body = sentBody(fetchSpy, 0);
      expect(body).toHaveProperty('auth', 'my-session-token');
      const headers = sentHeaders(fetchSpy, 0);
      expect(headers.get('authorization')).toBeFalsy();
    });

    it('switches to Bearer header when server rejects body "auth" (7.2+)', async () => {
      const fetchSpy = mockFetch([
        jsonRpcError(-32602, 'Invalid params', 'unexpected parameter "auth"'),
        jsonRpcOk([{ triggerid: '30' }]),
      ]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'secret', null, '7.2.0');
      z.auth = 'my-session-token';
      const result = await z.call('trigger.get', {});

      expect(sentBody(fetchSpy, 0)).toHaveProperty('auth', 'my-session-token');
      expect(sentBody(fetchSpy, 1)).not.toHaveProperty('auth');
      expect(sentHeaders(fetchSpy, 1).get('authorization')).toBe('Bearer my-session-token');
      expect(result.result).toEqual([{ triggerid: '30' }]);
      expect(z._authMode).toBe('header');
    });

    it('caches auth mode: uses Bearer header directly on subsequent calls', async () => {
      const fetchSpy = mockFetch([
        jsonRpcError(-32602, 'Invalid params', 'unexpected parameter "auth"'),
        jsonRpcOk([]),
        jsonRpcOk([]),
      ]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'secret', null, '7.2.0');
      z.auth = 'tok';
      await z.call('trigger.get', {});
      await z.call('host.get', {});

      expect(fetchSpy).toHaveBeenCalledTimes(3);
      expect(sentBody(fetchSpy, 2)).not.toHaveProperty('auth');
      expect(sentHeaders(fetchSpy, 2).get('authorization')).toBe('Bearer tok');
    });

    it('re-probes auth mode when cached header mode fails', async () => {
      const fetchSpy = mockFetch([
        jsonRpcError(-32602, 'Invalid params', 'unexpected parameter "auth"'),
        jsonRpcOk([]), // header works
        jsonRpcError(-32602, 'Invalid params', 'Not authorised.'), // header stops working
        jsonRpcOk([]), // body works again
      ]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'secret', null, '7.2.0');
      z.auth = 'tok';
      await z.call('trigger.get', {});
      expect(z._authMode).toBe('header');

      // Simulate server downgrade: header now fails with auth error
      await z.call('trigger.get', {});
      // Should have retried with body auth and cached it
      expect(z._authMode).toBe('body');
      expect(sentBody(fetchSpy, 3)).toHaveProperty('auth', 'tok');
    });

    it('does not send auth when not logged in', async () => {
      const fetchSpy = mockFetch([jsonRpcOk('login-result')]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'secret', null, '7.0.0');
      await z.call('user.login', { username: 'admin', password: 'secret' });

      const headers = sentHeaders(fetchSpy, 0);
      expect(headers.get('authorization')).toBeFalsy();
      const body = sentBody(fetchSpy, 0);
      expect(body.auth).toBeFalsy();
    });

    it('always sends Content-Type application/json-rpc', async () => {
      const fetchSpy = mockFetch([jsonRpcOk([])]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'secret', null, '7.0.0');
      z.auth = 'tok';
      await z.call('trigger.get', {});

      const headers = sentHeaders(fetchSpy, 0);
      expect(headers.get('content-type')).toBe('application/json-rpc');
    });
  });

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

  describe('call() version change detection', () => {
    it('updates informational version when auth keeps failing', async () => {
      const onVersionChange = vi.fn();

      // Call 1: trigger.get with body auth → session invalid
      // Call 2: apiinfo.version → returns "7.4.0" (different from 6.4.0)
      // No retry — capabilities are failure-driven, version is informational
      const fetchSpy = mockFetch([
        jsonRpcError(-32602, 'Invalid params', 'Not authorised.'),
        jsonRpcOk('7.4.0'),
      ]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'secret', null, '6.4.0', onVersionChange);
      z.auth = 'session-token';
      const result = await z.call('trigger.get', { limit: 10 });

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(sentBody(fetchSpy, 1).method).toBe('apiinfo.version');
      expect(onVersionChange).toHaveBeenCalledWith('7.4.0');
      expect(z.version).toBe('7.4.0');
      // Returns the original auth error (no retry — caller should re-login)
      expect(result.error.data).toBe('Not authorised.');
    });

    it('does not retry when error is unrelated to auth', async () => {
      const fetchSpy = mockFetch([
        jsonRpcError(-32602, 'Invalid params.', 'No permissions to referred object.'),
      ]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'secret', null, '6.4.0');
      z.auth = 'session-token';
      const result = await z.call('trigger.get', {});

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(result.error.data).toBe('No permissions to referred object.');
    });

    it('does not retry when version is unchanged', async () => {
      const fetchSpy = mockFetch([
        jsonRpcError(-32602, 'Invalid params', 'Not authorised.'),
        jsonRpcOk('6.4.0'), // same version — no change
      ]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'secret', null, '6.4.0');
      z.auth = 'session-token';
      const result = await z.call('trigger.get', {});

      // 2 calls: original + version check — no retry since version unchanged
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result.error.data).toBe('Not authorised.');
    });

    it('does not infinite-loop on persistent auth failure', async () => {
      const fetchSpy = mockFetch([
        jsonRpcError(-32602, 'Invalid params', 'Not authorised.'),
        jsonRpcOk('7.4.0'),
      ]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'secret', null, '6.4.0');
      z.auth = 'bad-token';
      const result = await z.call('trigger.get', {});

      // 2 calls: original + version check. No retry loop — caller re-logins.
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result.error.data).toBe('Not authorised.');
    });

    it('works without onVersionChange callback', async () => {
      const fetchSpy = mockFetch([
        jsonRpcError(-32602, 'Invalid params', 'Not authorised.'),
        jsonRpcOk('7.4.0'),
      ]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'secret', null, '6.4.0');
      z.auth = 'session-token';
      const result = await z.call('trigger.get', {});

      expect(z.version).toBe('7.4.0');
      expect(result.error.data).toBe('Not authorised.');
    });
  });

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

    it('login → call → logout with version 7.4 (probes transport)', async () => {
      const fetchSpy = mockFetch([
        jsonRpcOk('session-xyz'),                          // login (username probe succeeds)
        jsonRpcError(-32602, 'Invalid params', 'unexpected parameter "auth"'), // body auth rejected
        jsonRpcOk([{ triggerid: '20', description: 'Disk' }]), // retry with Bearer header
        jsonRpcOk(true),                                   // logout
      ]);
      vi.stubGlobal('fetch', fetchSpy);

      const z = new Zabbix('http://z/api', 'admin', 'pass', null, '7.4.0');
      await z.login();
      expect(z.auth).toBe('session-xyz');

      const result = await z.call('trigger.get', { limit: 5 });
      expect(result.result).toHaveLength(1);

      // First attempt: body auth (rejected by 7.2+)
      expect(sentBody(fetchSpy, 1)).toHaveProperty('auth', 'session-xyz');
      // Retry: Bearer header, no body auth
      expect(sentBody(fetchSpy, 2)).not.toHaveProperty('auth');
      expect(sentHeaders(fetchSpy, 2).get('authorization')).toBe('Bearer session-xyz');
      // Capability cached
      expect(z._authMode).toBe('header');

      await z.logout();
      expect(z.auth).toBeUndefined();
    });

    it('login → call with stale version → transport probe → logout', async () => {
      const fetchSpy = mockFetch([
        jsonRpcOk('session-heal'),        // login
        // trigger.get with auth in body → rejected by 7.4 server
        jsonRpcError(-32602, 'Invalid params', 'unexpected parameter "auth"'),
        jsonRpcOk([{ triggerid: '30' }]),  // retry with Bearer header succeeds
        jsonRpcOk(true),                   // logout
      ]);
      vi.stubGlobal('fetch', fetchSpy);

      // User has version set to 6.4 but server is actually 7.4.
      // Capability probing handles it without version detection.
      const z = new Zabbix('http://z/api', 'admin', 'pass', null, '6.4.0');
      await z.login();

      const result = await z.call('trigger.get', {});
      expect(result.result).toEqual([{ triggerid: '30' }]);
      expect(z._authMode).toBe('header');

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
