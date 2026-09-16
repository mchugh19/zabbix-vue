/**
 * Zabbix API client.
 *
 * Native ES2015+ class (previously Babel-transpiled ES5 output).
 * Behavior is unchanged: promise-based JSON-RPC with capability-based
 * auth handling. Server capabilities (auth transport, login parameter
 * name) are probed once, cached, and re-probed when the server version
 * changes — no version-string parsing for behavior decisions.
 */
export class Zabbix {
  /**
   * Create Zabbix API client.
   * @param {string} url - Zabbix API url e.g. http://localhost/zabbix/api_jsonrpc.php
   * @param {string} user - Zabbix API username
   * @param {string} password - Zabbix API password
   * @param {string} apiToken - Zabbix API token (skips login/logout when set)
   * @param {string} version - server version e.g. "7.0.19" (used for cache
   *   invalidation; behavior is capability-detected, not version-gated)
   * @param {function} onVersionChange - called with the detected version
   *   when the client self-heals a stale configured version
   */
  constructor(url, user, password, apiToken, version, onVersionChange) {
    this.url = url;
    this.user = user;
    this.password = password;
    this.apiToken = apiToken;
    this.version = version;
    this.onVersionChange = onVersionChange;
    this.auth = undefined;
    // Capability cache: probed once, invalidated when version changes.
    this._authMode = null; // 'header' | 'body'
    this._loginParam = null; // 'username' | 'user'
    this._probedVersion = null;
  }

  /**
   * Invalidate cached capabilities if the server version changed.
   * Called at the start of login() and call().
   */
  _invalidateCapabilitiesIfVersionChanged() {
    if (this._probedVersion !== this.version) {
      this._authMode = null;
      this._loginParam = null;
      this._probedVersion = this.version;
    }
  }

  /**
   * Perform user.login with capability-detected parameter name.
   * Tries 'username' (5.4+) first, falls back to 'user' (pre-5.4) when
   * the server rejects the parameter. The working param name is cached
   * per version so subsequent logins go straight to it.
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
    let param = firstTry;
    if (!this._loginParam && reply.error && reply.error.data &&
        reply.error.data.includes('unexpected parameter "username"')) {
      param = "user";
      reply = await tryLogin(param);
    }
    if (!reply.error) {
      this._loginParam = param;
    }
    return reply;
  }

  /**
   * Call a Zabbix API method.
   * @param {string} method - Zabbix API method like "trigger.get"
   * @param {object} params - params object like {filter: {host: ["Zabbix server"]}}
   * @return {Promise<object>} parsed JSON-RPC response
   */
  async call(method, params) {
    this._invalidateCapabilitiesIfVersionChanged();
    const request = {
      jsonrpc: "2.0",
      id: "1",
      method: method,
      params: params,
    };
    // Auth transport is capability-detected, not version-gated.
    // Default to body 'auth' (works on all versions); the probe upgrades
    // to Bearer header when the server accepts it.
    const authMode = this._authMode || "body";
    if (authMode === "body") {
      request["auth"] = this.auth;
    }
    let response = await this._postJsonRpc(this.url, JSON.stringify(request), authMode === "header");

    // Self-heal: if the server rejects the body 'auth' parameter (7.2+
    // removed it), probe for Bearer header support and retry.
    if (
      response.error &&
      response.error.data &&
      response.error.data.includes('unexpected parameter "auth"')
    ) {
      console.log("ZABLIB auth parameter rejected — probing Bearer header support");
      this._authMode = "header";
      this._probedVersion = this.version;
      delete request["auth"];
      response = await this._postJsonRpc(this.url, JSON.stringify(request), true);
      // If header also fails, fall back to body (server may be older than
      // we thought) and re-probe version.
      if (response.error) {
        console.log("ZABLIB Bearer header rejected — falling back to body auth");
        this._authMode = "body";
        request["auth"] = this.auth;
        response = await this._postJsonRpc(this.url, JSON.stringify(request), false);
      }
    }

    // Detect version change via apiinfo.version when auth keeps failing:
    // the server may have been upgraded/downgraded.
    if (response.error && this._isAuthError(response.error)) {
      const newVersion = await this._detectVersion();
      if (newVersion && newVersion !== this.version) {
        console.log("ZABLIB server version changed: " + this.version + " -> " + newVersion);
        this.version = newVersion;
        if (this.onVersionChange) {
          this.onVersionChange(this.version);
        }
        this._invalidateCapabilitiesIfVersionChanged();
        // Retry with fresh capabilities
        return this.call(method, params);
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

    this._invalidateCapabilitiesIfVersionChanged();
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
