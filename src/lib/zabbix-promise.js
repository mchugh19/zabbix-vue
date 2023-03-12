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

Object.defineProperty(exports, "__esModule", {
  value: true,
});

function _classCallCheck(instance, Constructor) {
  if (!(instance instanceof Constructor)) {
    throw new TypeError("Cannot call a class as a function");
  }
}

var Zabbix = (function () {
  /**
   * Create Zabbix API client.
   * @param {string} url - Zabbix API url e.g. http://localhost/zabbix/api_jsonrpc.php
   * @param {string} user - Zabbix user name
   * @param {string} password - Zabbix user password
   */

  function Zabbix(url, user, password, apiToken, version) {
    _classCallCheck(this, Zabbix);

    this.url = url;
    this.user = user;
    this.password = password;
    this.apiToken = apiToken;
    this.version = version;
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
      value: function call(method, params) {
        //console.log("ZABLIB method: " + JSON.stringify(method) + " Params: " + JSON.stringify(params))
        var request = {
          jsonrpc: "2.0",
          id: "1",
          auth: this.auth,
          method: method,
          params: params,
        };
        //console.log("ZABLIB request: " + JSON.stringify(request))
        return this._postJsonRpc(this.url, JSON.stringify(request)).then(
          function (r) {
            return JSON.parse(r);
          }
        );
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
        let versionComp = this.version.split('.').slice(0,2).join('.')
        // API pre 6.0 needs user, 6.0+ username
        if (versionComp && versionComp < 6.0) {
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
      value: function _postJsonRpc(url, data) {
        return new Promise(function (resolve, reject) {
          var method = "POST";
          var client = new XMLHttpRequest();
          client.open(method, url);
          client.setRequestHeader("Content-Type", "application/json-rpc");
          client.send(data);
          client.onload = function () {
            if (this.status >= 200 && this.status < 300) {
              resolve(this.response);
            } else {
              reject("HTTP status " + this.statusText + " was returned.");
            }
          };
          client.onerror = function () {
            reject("XMLHTTP request error occurred.");
          };
        });
      },
    },
  ]);

  return Zabbix;
})();

exports.default = Zabbix;
