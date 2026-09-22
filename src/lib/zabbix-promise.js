/**
 * Zabbix API client.
 *
 * Native ES2015+ class (previously Babel-transpiled ES5 output).
 * Behavior is unchanged: promise-based JSON-RPC with capability-based
 * auth handling. Server capabilities (auth transport, login parameter
 * name) are probed on first use, cached, and re-probed when a cached
 * capability stops working — no version-string parsing for behavior
 * decisions. The version string is informational only.
 */
export class Zabbix {
  /**
   * Create Zabbix API client.
   * @param {string} url - Zabbix API url e.g. http://localhost/zabbix/api_jsonrpc.php
   * @param {string} user - Zabbix API username
   * @param {string} password - Zabbix API password
   * @param {string} apiToken - Zabbix API token (skips login/logout when set)
   * @param {string} version - server version e.g. "7.0.19" (informational only)
   * @param {function} onVersionChange - called with the detected version
   *   when the client detects the server version changed
   */
  constructor(url, user, password, apiToken, version, onVersionChange) {
    this.url = url;
    this.user = user;
    this.password = password;
    this.apiToken = apiToken;
    this.version = version;
    this.onVersionChange = onVersionChange;
    this.auth = undefined;
    // Capability cache: probed on first use, re-probed on failure.
    // Never keyed by version — a stale cache entry fails fast and
    // the probe recovers, whatever the server actually runs.
    this._authMode = null; // 'header' | 'body'
    this._loginParam = null; // 'username' | 'user'
  }

  /**
   * Perform user.login with capability-detected parameter name.
   * Tries 'username' (5.4+) first, falls back to 'user' (pre-5.4) when
   * the server rejects the parameter. The working param name is cached;
   * if a cached param later fails, the cache is cleared and both are
   * retried.
   * @return {Promise<object>} login reply
   */
  async _loginWithProbedParam() {
    const tryLogin = (paramName) =>
      this._postJsonRpc(
        this.url,
        JSON.stringify({
          jsonrpc: "2.0",
          method: "user.login",
          params: { [paramName]: this.user, password: this.password },
          id: "1",
        }),
        false // do not send auth header: user.login is public
      );
    // Use cached param if we have it, else try modern first
    const firstTry = this._loginParam || "username";
    let reply = await tryLogin(firstTry);
    if (reply.error && this._isUnexpectedParam(reply.error, firstTry)) {
      // Cached param stopped working (or first probe failed) — clear cache
      // and try the other one.
      this._loginParam = null;
      const fallback = firstTry === "username" ? "user" : "username";
      reply = await tryLogin(fallback);
      if (!reply.error) {
        this._loginParam = fallback;
      }
      return reply;
    }
    if (!reply.error) {
      this._loginParam = firstTry;
    }
    return reply;
  }

  /**
   * Whether a JSON-RPC error is an "unexpected parameter" rejection for
   * the given parameter name.
   */
  _isUnexpectedParam(error, paramName) {
    return error.data && error.data.includes(`unexpected parameter "${paramName}"`);
  }

  /**
   * Call a Zabbix API method.
   * @param {string} method - Zabbix API method like "trigger.get"
   * @param {object} params - params object like {filter: {host: ["Zabbix server"]}}
   * @return {Promise<object>} parsed JSON-RPC response
   */
  async call(method, params) {
    const request = {
      jsonrpc: "2.0",
      id: "1",
      method: method,
      params: params,
    };
    // Auth transport is capability-detected. Default to body 'auth'
    // (works on all versions); switch to Bearer header when the server
    // rejects it, and back again if the header stops working.
    const authMode = this._authMode || "body";
    if (authMode === "body") {
      request["auth"] = this.auth;
    }
    let response = await this._postJsonRpc(this.url, JSON.stringify(request), authMode === "header");

    if (response.error) {
      const data = response.error.data || "";
      if (authMode === "body" && data.includes('unexpected parameter "auth"')) {
        // 7.2+ removed the body 'auth' parameter — try Bearer header.
        console.log("ZABLIB body auth rejected — trying Bearer header");
        this._authMode = "header";
        delete request["auth"];
        response = await this._postJsonRpc(this.url, JSON.stringify(request), true);
        if (response.error) {
          // Header didn't work either — clear cache, caller sees the error.
          console.log("ZABLIB Bearer header also rejected — clearing auth mode cache");
          this._authMode = null;
        }
      } else if (authMode === "header" && this._isAuthError(response.error)) {
        // Cached header mode stopped working (e.g. server downgraded) —
        // clear cache and retry with body auth.
        console.log("ZABLIB Bearer header failed — retrying with body auth");
        this._authMode = null;
        request["auth"] = this.auth;
        response = await this._postJsonRpc(this.url, JSON.stringify(request), false);
        if (!response.error) {
          this._authMode = "body";
        }
      }
    }

    // Keep the informational version string in sync: if auth keeps
    // failing, the server may have been replaced/upgraded. This does not
    // affect behavior — capabilities are failure-driven, not version-gated.
    if (response.error && this._isAuthError(response.error)) {
      const newVersion = await this._detectVersion();
      if (newVersion && newVersion !== this.version) {
        console.log("ZABLIB server version changed: " + this.version + " -> " + newVersion);
        this.version = newVersion;
        if (this.onVersionChange) {
          this.onVersionChange(this.version);
        }
      }
    }

    return response;
  }

  /**
   * Whether a JSON-RPC error looks like an authentication failure.
   */
  _isAuthError(error) {
    const msg = (error.data || error.message || "").toLowerCase();
    return msg.includes("not authorised") || msg.includes("not authorized") || msg.includes("session terminated");
  }

  /**
   * Query the server version via the public apiinfo.version method.
   * @return {Promise<string|null>} version string or null on failure
   */
  async _detectVersion() {
    try {
      const versionResponse = await this._postJsonRpc(
        this.url,
        JSON.stringify({
          jsonrpc: "2.0",
          method: "apiinfo.version",
          params: [],
          id: "1",
        }),
        false // do not send auth header: apiinfo.version is public
      );
      return versionResponse.result || null;
    } catch {
      return null;
    }
  }

  /**
   * Log in to the Zabbix server. Noop when using an API token.
   * @return {Promise<object|undefined>} login reply, or undefined for token auth
   */
  async login() {
    // make login noop if using an api key
    if (this.apiToken) {
      this.auth = this.apiToken;
      return;
    }

    this.auth = undefined;
    // Login parameter name is capability-detected, not version-gated.
    // Tries 'username' (5.4+) first, falls back to 'user' (pre-5.4).
    const reply = await this._loginWithProbedParam();
    this.auth = reply.result;
    if (this.auth === undefined) {
      throw new Error(JSON.stringify(reply.error));
    }
    return reply;
  }

  /**
   * Log out from the Zabbix server. Noop when using an API token.
   * @return {Promise<object|undefined>} logout reply, or undefined for token auth
   */
  async logout() {
    // if using an api Token, ignore logout
    if (this.apiToken) {
      return;
    }
    const reply = await this.call("user.logout", []);
    if (reply.result !== true) {
      throw new Error(JSON.stringify(reply.error));
    }
    this.auth = undefined;
    return reply;
  }

  async _postJsonRpc(url, data, useBearerHeader) {
    const myHeaders = new Headers();
    if (this.auth && useBearerHeader) {
      myHeaders.append("Authorization", "Bearer " + this.auth);
    }
    myHeaders.append("Content-Type", "application/json-rpc");

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const response = await fetch(url, {
        method: "POST",
        body: data,
        headers: myHeaders,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) {
        throw new Error(`Response status: ${response.status}`);
      }
      return await response.json();
    } catch {
      throw new Error("Failed to communicate with server");
    }
  }

}
