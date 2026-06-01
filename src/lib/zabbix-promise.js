"use strict";

/**
 * Class representing Zabbix API client
 */

var _createClass = (function () {
  function defineProperties(target, props) {
    for (var i = 0; i < props.length; i++) {
      var descriptor = props[i];
      descriptor.enumerable = descriptor.enumerable || false;
      descriptor.configurable = true;
      if ("value" in descriptor) descriptor.writable = true;
      Object.defineProperty(target, descriptor.key, descriptor);
    }
  }
  return function (Constructor, protoProps, staticProps) {
    if (protoProps) defineProperties(Constructor.prototype, protoProps);
    if (staticProps) defineProperties(Constructor, staticProps);
    return Constructor;
  };
})();

function _classCallCheck(instance, Constructor) {
  if (!(instance instanceof Constructor)) {
    throw new TypeError("Cannot call a class as a function");
  }
}

export var Zabbix = (function () {
  /**
   * Create Zabbix API client.
   * @param {string} url - Zabbix API url e.g. http://localhost/zabbix/api_jsonrpc.php
   * @param {string} user - Zabbix user name
   * @param {string} password - Zabbix user password
   */

  function Zabbix(url, user, password, apiToken, version, onVersionChange) {
    _classCallCheck(this, Zabbix);

    this.url = url;
    this.user = user;
    this.password = password;
    this.apiToken = apiToken;
    this.version = version;
    this.onVersionChange = onVersionChange;
  }

  /**
   * Call Zabbix API method.
   * @param {string} method - Zabbix API method like "trigger.get", "host.create"
   * @param {object} params - params object like {filter: {host: ["Zabbix server"]}}
   * @return {Promise} Promise object
   */

  _createClass(Zabbix, [
    {
      key: "call",
      value: async function call(method, params) {
        //console.log("ZABLIB method: " + JSON.stringify(method) + " Params: " + JSON.stringify(params))
        var request = {
          jsonrpc: "2.0",
          id: "1",
          method: method,
          params: params,
        };
        if (this.version) {
          const [major, minor] = this.version.split('.').map(Number);
          if (major < 7) {
            request["auth"] = this.auth;
          }
        }
        //console.log("ZABLIB request: " + JSON.stringify(request))
        var response = await this._postJsonRpc(this.url, JSON.stringify(request));

        // Self-heal when server was upgraded but extension version config is stale.
        // Zabbix 7.2+ removed the "auth" body parameter and rejects it outright.
        if (response.error && response.error.data &&
            response.error.data.includes('unexpected parameter "auth"')) {
          console.log("ZABLIB auth parameter rejected — auto-detecting server version");
          var versionResponse = await this._postJsonRpc(this.url, JSON.stringify({
            jsonrpc: "2.0",
            method: "apiinfo.version",
            params: [],
            id: "1"
          }));
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
      },

      /**
       * Log in Zabbix server.
       * @return {Promise} Promise object
       */
    },
    {
      key: "login",
      value: function login() {
        var _this = this;

        // make login noop if using an api key
        if (this.apiToken) {
          _this.auth = this.apiToken;
          //console.log("ZABLIB got apiToken SKIPPING LOGIN")
          return Promise.resolve();
        }

        var params = {
          password: this.password,
        };
        _this.auth = undefined;
        const [major, minor] = this.version.split('.').map(Number);
        // API pre 6.0 needs user, 6.0+ username
        if (major < 6) {
          params["user"] = this.user;
        } else {
          params["username"] = this.user;
        }
        return this.call("user.login", params).then(function (reply) {
          _this.auth = reply.result;
          if (_this.auth === undefined) {
            throw new Error(JSON.stringify(reply.error));
          }
          return reply;
        });
      },

      /**
       * Log out from Zabbix server.
       * @return {Promise} Promise object
       */
    },
    {
      key: "logout",
      value: function logout() {
        var _this2 = this;

        // if using an api Token, ignore logout
        if (this.apiToken) {
          //console.log("ZABLIB Using API Key. Skipping logout.")
          return Promise.resolve();
        }
        return this.call("user.logout", []).then(function (reply) {
          if (reply.result !== true) {
            throw new Error(JSON.stringify(reply.error));
          }

          _this2.auth = undefined;
          return reply;
        });
      },
    },
    {
      key: "_postJsonRpc",
      value: async function _postJsonRpc(url, data) {
        const myHeaders = new Headers();

        var _this3 = this;
        if (_this3.auth) {
          // API after 7.0 removes auth object
          myHeaders.append("Authorization", "Bearer " + _this3.auth)
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
          const zabResponse = await response.json()
          //console.log("ZABLIB response: " + JSON.stringify(zabResponse))
          return zabResponse;
        } catch {
          throw new Error('Failed to communicate with server');
        }       
      },
    },
  ]);

  return Zabbix;
})();