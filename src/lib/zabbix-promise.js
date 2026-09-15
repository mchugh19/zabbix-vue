/**
 * Zabbix API client.
 *
 * Native ES2015+ class (previously Babel-transpiled ES5 output).
 * Behavior is unchanged: promise-based JSON-RPC with version-aware
 * auth handling and stale-version self-healing.
 */
export class Zabbix {
  /**
   * Create Zabbix API client.
   * @param {string} url - Zabbix API url e.g. http://localhost/zabbix/api_jsonrpc.php
   * @param {string} user - Zabbix API username
   * @param {string} password - Zabbix API password
   * @param {string} apiToken - Zabbix API token (skips login/logout when set)
   * @param {string} version - server version e.g. "7.0.19"
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
    if (this.version) {
      const [major] = this.version.split(".").map(Number);
      if (major < 7) {
        request["auth"] = this.auth;
      }
    }
    let response = await this._postJsonRpc(this.url, JSON.stringify(request));

    // Self-heal when server was upgraded but extension version config is stale.
    // Zabbix 7.2+ removed the "auth" body parameter and rejects it outright.
    if (
      response.error &&
      response.error.data &&
      response.error.data.includes('unexpected parameter "auth"')
    ) {
      console.log("ZABLIB auth parameter rejected — auto-detecting server version");
      const versionResponse = await this._postJsonRpc(
        this.url,
        JSON.stringify({
          jsonrpc: "2.0",
          method: "apiinfo.version",
          params: [],
          id: "1",
        }),
        true // skip auth header: 7.4 rejects apiinfo.version with Authorization
      );
      if (versionResponse.result) {
        console.log("ZABLIB detected server version: " + versionResponse.result);
        this.version = versionResponse.result;
        if (this.onVersionChange) {
          this.onVersionChange(this.version);
        }
        // Retry without auth in body
        delete request["auth"];
        response = await this._postJsonRpc(this.url, JSON.stringify(request));
      }
    }

    return response;
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

    const params = {
      password: this.password,
    };
    this.auth = undefined;
    const [major] = this.version.split(".").map(Number);
    // API pre 6.0 needs user, 6.0+ username
    if (major < 6) {
      params["user"] = this.user;
    } else {
      params["username"] = this.user;
    }
    const reply = await this.call("user.login", params);
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

  async _postJsonRpc(url, data, skipAuth) {
    const myHeaders = new Headers();
    if (this.auth && !skipAuth) {
      // API after 7.0 removes auth object
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
