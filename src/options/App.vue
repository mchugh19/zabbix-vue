<template>
  <v-app>
    <v-main>
      <v-form v-model="zabbixs.global.formValid" ref="form">
        <v-container fluid grid-list-md class="ma-0 pa-0 px-2">
          <v-container fluid class="ma-0 pa-0">
            <v-card class="ma-0 pa-0">
              <v-card-title class="ma-0 pa-0"
                ><p>{{ $i18n("serverSettings") }}</p></v-card-title
              >
              <v-container fluid class="ma-0 pa-0 pb-6 px-1">
                <v-card
                  flat
                  outlined
                  class="ma-0 pa-0 mb-1"
                  min-width="100%"
                  v-for="(server, index) in zabbixs.servers"
                  v-bind:key="server[index]"
                >
                  <v-system-bar class="primary lighten-2">
                    <v-layout justify-end>
                      <v-icon
                        v-if="zabbixs.servers.length > 1"
                        @click="removeServer(index)"
                      >
                        close
                      </v-icon>
                    </v-layout>
                  </v-system-bar>

                  <v-card-title class="mb-0 pa-0"
                    ><p>
                      {{ $i18n("server") }}: {{ server.alias }}
                    </p></v-card-title
                  >

                  <v-text-field
                    :label="$i18n('alias')"
                    v-model="server.alias"
                    :rules="[(v) => !!v || $i18n('required')]"
                    required
                  ></v-text-field>
                  <v-text-field
                    :label="$i18n('URL')"
                    v-model="server.url"
                    :rules="[(v) => !!v || $i18n('required')]"
                    @input="serverAPI($event, index)"
                    :error-messages="server.errorMsg"
                    :success-messages="
                      server.version ? 'Version: ' + server.version : undefined
                    "
                    required
                  ></v-text-field>

                  <v-checkbox
                    class="mb-0 pa-0"
                    :label="$i18n('useToken')"
                    v-model="server.useToken"
                  ></v-checkbox>

                  <v-text-field
                    :label="$i18n('zabbixToken')"
                    v-model="server.apiToken"
                    :rules="[(v) => !!v || $i18n('required')]"
                    v-if="server.useToken"
                    required
                  ></v-text-field>

                  <v-text-field
                    :label="$i18n('zabbixUser')"
                    v-model="server.user"
                    :rules="[(v) => !!v || $i18n('required')]"
                    v-if="!server.useToken"
                    required
                  ></v-text-field>
                  <v-text-field
                    :label="$i18n('zabbixPass')"
                    v-model="server.pass"
                    required
                    :append-icon="
                      server.visiblePass ? 'visibility' : 'visibility_off'
                    "
                    @click:append="server.visiblePass = !server.visiblePass"
                    :type="server.visiblePass ? 'text' : 'password'"
                    :rules="[(v) => !!v || $i18n('required')]"
                    v-if="!server.useToken"
                  ></v-text-field>

                  <v-checkbox
                    class="mb-0 pa-0"
                    :label="$i18n('hideEvents')"
                    v-model="server.hide"
                  ></v-checkbox>
                  <v-checkbox
                    class="mb-0 pa-0"
                    :label="$i18n('ignoreHosts')"
                    v-model="server.maintenance"
                  ></v-checkbox>
                  <v-select
                    :items="severitySelector"
                    v-model="server.minSeverity"
                    :label="$i18n('minSev')"
                    item-text="name"
                    item-value="priority"
                  >
                  </v-select>
                  <v-container class="mb-0 pa-0">
                    <v-col>
                      <v-row>
                        <v-select
                          class="hostGroupSelect"
                          :items="server.hostGroupsList"
                          v-model="server.hostGroups"
                          :label="$i18n('monGroups')"
                          :error-messages="server.errorMsg"
                          item-text="name"
                          item-value="groupid"
                          autocomplete
                          multiple
                        ></v-select>
                        <v-btn
                          class="reloadHostGroups"
                          @click="
                            refreshGroups(
                              server.url,
                              server.user,
                              server.pass,
                              server.apiToken,
                              server.version,
                              index
                            )
                          "
                        >
                          <i class="reloadBtn material-icons">autorenew</i>
                        </v-btn>
                      </v-row>
                    </v-col>
                  </v-container>
                </v-card>
              </v-container>
              <v-footer :padless="true">
                <v-btn block id="addZabbix" @click="addServer">{{
                  $i18n("addServer")
                }}</v-btn>
              </v-footer>
            </v-card>
          </v-container>
          <v-container fluid class="ma-0 pa-0 pt-3">
            <v-card class="ma-0 pa-0 px-1" name="globalSettings">
              <v-card-title class="mb-0 pa-0"
                ><p>{{ $i18n("generalSettings") }}</p></v-card-title
              >
              <v-text-field
                :label="$i18n('updateInterval')"
                v-model="zabbixs.global.interval"
                :rules="intervalRules"
                type="Number"
                required
              ></v-text-field>
              <v-checkbox
                class="mb-0 pa-0"
                :label="$i18n('notify')"
                v-model="zabbixs.global.notify"
              ></v-checkbox>
              <v-checkbox
                class="mb-0 pa-0"
                :label="$i18n('sound')"
                v-model="zabbixs.global.sound"
              ></v-checkbox>
              <v-radio-group
                v-model="zabbixs.global.displayName"
                :label="$i18n('selectName')"
              >
                <v-radio :label="$i18n('displayHost')" value="host"></v-radio>
                <v-radio :label="$i18n('displayName')" value="name"></v-radio>
              </v-radio-group>
            </v-card>
          </v-container>
        </v-container>
        <v-btn block @click="save_data" :disabled="!zabbixs.global.formValid">
          {{ $i18n("save") }}
        </v-btn>
      </v-form>
    </v-main>
  </v-app>
</template>

<script>
import Zabbix from "../lib/zabbix-promise.js";
import "../lib/sjcl.js";
import "../lib/crypt.io.js";
var browser = browser || chrome;
var zabbix_data;
var severitySelect = [
  { name: browser.i18n.getMessage("notClassified"), priority: 0 },
  { name: browser.i18n.getMessage("information"), priority: 1 },
  { name: browser.i18n.getMessage("warning"), priority: 2 },
  { name: browser.i18n.getMessage("average"), priority: 3 },
  { name: browser.i18n.getMessage("high"), priority: 4 },
  { name: browser.i18n.getMessage("disaster"), priority: 5 },
];

// eslint-disable-next-line
cryptio.get("ZabbixServers", function (err, results) {
  if (err) {
    console.log("Generating new options data");
    zabbix_data = {
      global: {
        interval: 60,
        notify: true,
        sound: false,
        displayName: "host",
        formValid: true,
      },
      servers: [
        {
          alias: "New Server",
          url: "",
          user: "",
          pass: "",
          apiToken: "",
          hide: false,
          maintenance: false,
          hostGroups: [],
          hostGroupsList: [],
          minSeverity: 0,
          visiblePass: false,
          errorMsg: "",
          pagination: { sortBy: "priority", descending: true },
        },
      ],
    };
  } else {
    zabbix_data = results;
    // Set defaults
    if (zabbix_data.global.notify == null) {
      zabbix_data.global.notify = true;
    }
    if (zabbix_data.global.sound == null) {
      zabbix_data.global.sound = false;
    }
    if (zabbix_data.global.displayName == null) {
      zabbix_data.global.displayName = "host";
    }
  }
  //console.log('zabbix_data is now: ' + JSON.stringify(zabbix_data));
});

export default {
  data() {
    return {
      zabbixs: zabbix_data,
      severitySelector: severitySelect,
      intervalRules: [
        (v) => !!v || this.$i18n("required"),
        (v) => v > 9 || this.$i18n("lessSeconds"),
      ],
      timeout: 800,
    };
  },
  methods: {
    serverAPI: function (val, index) {
      /*
       * Only run for the last update of the input field
       * Query zabbix version api to confirm connectivity
       */
      //console.log('looking up url: ' + val + " and index " + index)
      if (this.timeout) {
        // Reset timer on new data. Thus only run for latest input
        clearTimeout(this.timeout);
        //console.log("resetting zab query timer")
      }

      this.timeout = setTimeout(() => {
        let url;
        try {
          url = new URL(val);
        } catch (_) {
          this.zabbixs.servers[index].errorMsg = this.$i18n("requiredURL");
          return false;
        }
        if (url.protocol === "http:" || url.protocol === "https:") {
          //console.log('protocol is okay')
        } else {
          this.zabbixs.servers[index].errorMsg = this.$i18n("requiredURL");
          return false;
        }

        // validate zabbix connection with query zabbix api version and save in storage
        const zabbix = new Zabbix(val + "/api_jsonrpc.php", null, null);
        zabbix
          .call("apiinfo.version", {})
          .then((value) => {
            //console.log("found result: " + JSON.stringify(value["result"]) + " for index " + index);
            this.zabbixs.servers[index].version = value["result"];
            this.zabbixs.servers[index].errorMsg = "";
            this.$refs.form.validate();
            //console.log('data stuff: ' + JSON.stringify(this.zabbixs));
            return true;
          })
          .catch((err) => {
            console.log(this.$i18n("serverError") + ": " + err);
            this.zabbixs.servers[index].errorMsg = this.$i18n("serverError");
            this.zabbixs.servers[index].version = "";
            return false;
          });

        //console.log("url looks okay!");
        this.zabbixs.servers[index].errorMsg = "";
        return true;
      }, 800);
    },
    addServer: function () {
      zabbix_data.servers.push({
        alias: "New Server",
        url: "",
        user: "",
        pass: "",
        apiToken: "",
        hide: false,
        maintenance: false,
        hostGroups: [],
        hostGroupsList: [],
        minSeverity: 0,
        visiblePass: false,
        errorMsg: "",
        pagination: { sortBy: "priority", descending: true },
      });
    },
    removeServer: function (index) {
      //console.log('Removing index: ' + JSON.stringify(index));
      this.zabbixs.servers.splice(index, 1);
    },
    save_data: function () {
      /*
       * Save data to localstorage encrypted and close options window
       * Message background.js to reload the new settings
       */

      if (this.$refs.form.validate()) {
        // Do not save results of hostGroup lookups, password display, or errors
        let savedServerSettings = this.zabbixs["servers"];
        for (var i = 0; i < savedServerSettings.length; i++) {
          savedServerSettings[i].hostGroupsList = [];
          savedServerSettings[i].errorMsg = "";
          savedServerSettings[i].visiblePass = false;
        }
        this.zabbixs["servers"] = savedServerSettings;

        var ZabbixServers = this.zabbixs;
        // eslint-disable-next-line
        cryptio.set("ZabbixServers", ZabbixServers, function (err, results) {
          if (err) throw err;
          //console.log(results);
        });
        window.close();
        browser.runtime.sendMessage({ method: "reinitalize" });
      } else {
        console.log("submit problem");
      }
    },
    refreshGroups: function (server, user, pass, apiToken, version, index) {
      /*
       * Connect to Zabbix server using provided credentials
       * Perform hostgroup.get lookup and popuplate the hostgroup list
       */

      this.zabbixs["servers"][index]["errorMsg"] = "";
      const zabbix = new Zabbix(
        server + "/api_jsonrpc.php",
        user,
        pass,
        apiToken,
        version
      );
      zabbix
        .login()
        .then(() => {
          //console.log('Successfully logged in');
          let result = zabbix.call("hostgroup.get", {
            output: ["groupid", "name"],
          });
          return result;
        })
        .then((value) => {
          //console.log('found result: ' + JSON.stringify(value['result']));
          this.zabbixs["servers"][index].hostGroupsList = value["result"];
        })
        .catch((err) => {
          this.zabbixs["servers"][index].hostGroupsList = [];
          this.zabbixs["servers"][index]["errorMsg"] = err.message;
          console.log(this.$i18n("serverError") + ": " + err);
        })
        .finally(() => {
          zabbix.logout();
        });
    },
  },
};
</script>

<style></style>
