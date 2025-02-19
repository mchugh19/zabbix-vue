<template>
  <v-app>
    <v-main>
      <v-form ref="form" v-model="zabbixs.global.formValid">
        <v-container fluid grid-list-md class="ma-0 pa-0 px-2">
          <v-container fluid class="ma-0 pa-0">
            <v-card-title class="ma-0 pa-0">
              <p>{{ $i18n("serverSettings") }}</p>
            </v-card-title>
            <v-card
              v-for="(server, index) in zabbixs.servers"
              v-bind:key="server[index]"
              flat
              border
              class="ma-0 pa-0 mb-1"
              min-width="100%"
            >
              <v-toolbar dense>
                <v-toolbar-title>
                  {{ $i18n("server") }}: {{ server.alias }}
                </v-toolbar-title>
                <v-spacer />
                <v-icon
                  v-if="zabbixs.servers.length > 1"
                  @click="removeServer(index)"
                  :icon="mdiClose"
                />
              </v-toolbar>
              
              <v-text-field
                v-model="server.alias"
                :label="$i18n('alias')"
                :rules="[(v) => !!v || $i18n('required')]"
                required
              />
              <v-text-field
                v-model="server.url"
                :label="$i18n('URL')"
                :rules="[(v) => !!v || $i18n('required')]"
                :error-messages="server.errorMsg"
                :messages="server.version ? 'Version: ' + server.version : undefined"
                required
                @update:modelValue="serverAPI($event, index)"
              />

              <v-checkbox
                v-model="server.useToken"
                class="mb-0 pa-0"
                :label="$i18n('useToken')"
              />

              <v-text-field
                v-model="server.apiToken"
                v-if="server.useToken"
                :label="$i18n('zabbixToken')"
                :rules="[(v) => !!v || $i18n('required')]"
                required
              />

              <v-text-field
                v-model="server.user"
                v-if="!server.useToken"
                :label="$i18n('zabbixUser')"
                :rules="[(v) => !!v || $i18n('required')]"
                required
              />
              <v-text-field
                v-model="server.pass"
                v-if="!server.useToken"
                :label="$i18n('zabbixPass')"
                required
                :type="server.visiblePass ? 'text' : 'password'"
                :rules="[(v) => !!v || $i18n('required')]"
              >
              <template v-slot:append>
                <v-icon v-if="server.visiblePass"
                :icon="mdiEye" 
                @click="server.visiblePass = !server.visiblePass"
                />
                <v-icon v-if="!server.visiblePass"
                :icon="mdiEyeOff" 
                @click="server.visiblePass = !server.visiblePass"
                />
              </template>
              </v-text-field>

              <v-checkbox
                v-model="server.hide"
                class="mb-0 pa-0"
                :label="$i18n('hideEvents')"
              />
              <v-checkbox
                v-model="server.maintenance"
                class="mb-0 pa-0"
                :label="$i18n('ignoreHosts')"
              />
              <v-select
                v-model="server.minSeverity"
                :items="severitySelector"
                :label="$i18n('minSev')"
                item-title="name"
                item-value="priority"
              />
              <v-container class="mb-0 pa-0">
                <v-col>
                  <v-row>
                    <v-select
                      v-model="server.hostGroups"
                      class="hostGroupSelect"
                      :items="server.hostGroupsList"
                      :label="$i18n('monGroups')"
                      :error-messages="server.errorMsg"
                      item-title="name"
                      item-value="groupid"
                      autocomplete
                      multiple
                    />
                    <v-btn
                      class="reloadHostGroups"
                      :icon="mdiReload"
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
                    />
                  </v-row>
                </v-col>
              </v-container>
            </v-card>
            <v-footer class="pa-0">
              <v-btn id="addZabbix" block @click="addServer">
                {{ $i18n("addServer") }}
              </v-btn>
            </v-footer>
          </v-container>
          <v-container fluid class="ma-0 pa-0 pt-3">
            <v-card class="ma-0 pa-0 px-1" name="globalSettings">
              <v-card-title class="mb-0 pa-0">
                <p>{{ $i18n("generalSettings") }}</p>
              </v-card-title
              >
              <v-text-field
                v-model="zabbixs.global.interval"
                :label="$i18n('updateInterval')"
                :rules="intervalRules"
                type="Number"
                required
              ></v-text-field>
              <v-checkbox
                v-model="zabbixs.global.notify"
                class="mb-0 pa-0"
                :label="$i18n('notify')"
              />
              <v-checkbox
                v-model="zabbixs.global.sound"
                class="mb-0 pa-0"
                :label="$i18n('sound')"
              />
              <v-radio-group
                v-model="zabbixs.global.displayName"
                :label="$i18n('selectName')"
              >
                <v-radio :label="$i18n('displayHost')" value="host" />
                <v-radio :label="$i18n('displayName')" value="name" />
              </v-radio-group>
            </v-card>
          </v-container>
        </v-container>
        <v-btn block :disabled="!zabbixs.global.formValid" @click="save_data">
          {{ $i18n("save") }}
        </v-btn>
      </v-form>
    </v-main>
  </v-app>
</template>

<script setup>
import { mdiClose, mdiEye, mdiEyeOff, mdiReload } from '@mdi/js'
</script>

<script>
import { Zabbix } from '../lib/zabbix-promise.js';
import browser from "webextension-polyfill";
import { encryptSettingKeys, decryptSettings } from '../lib/crypto.js'


var severitySelect = [
  { name: browser.i18n.getMessage("notClassified"), priority: 0 },
  { name: browser.i18n.getMessage("information"), priority: 1 },
  { name: browser.i18n.getMessage("warning"), priority: 2 },
  { name: browser.i18n.getMessage("average"), priority: 3 },
  { name: browser.i18n.getMessage("high"), priority: 4 },
  { name: browser.i18n.getMessage("disaster"), priority: 5 },
];
const defaultServer = {
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
  sortBy: [{ key: 'priority', order: 'desc' }],
}

export default {
  data() {
    return {
      zabbixs: {
        global: {
          interval: 60,
          notify: true,
          sound: false,
          displayName: "host",
          formValid: true,
        },
        servers: [
          defaultServer
        ],
      },
      severitySelector: severitySelect,
      intervalRules: [
        (v) => !!v || this.$i18n("required"),
        (v) => v > 9 || this.$i18n("lessSeconds"),
      ],
      timeout: 800,
    };
  },
  async mounted() {
    var zabbix_data;
    zabbix_data = await browser.storage.local.get("ZabbixServers");
    if (Object.keys(zabbix_data).length > 0) {
      zabbix_data = zabbix_data["ZabbixServers"]
      zabbix_data = JSON.parse(zabbix_data);
      for (let serverIndex in zabbix_data["servers"]) {
        zabbix_data.servers[serverIndex].apiToken = decryptSettings(zabbix_data.servers[serverIndex].apiToken)
        zabbix_data.servers[serverIndex].pass = decryptSettings(zabbix_data.servers[serverIndex].pass)
        if (zabbix_data.servers[serverIndex].apiToken.length > 0) {
          zabbix_data.servers[serverIndex].useToken = true;
        }
      }
      this.zabbixs = zabbix_data;
    }
  },
  methods: {
    serverAPI: function (val, index) {
      /*
       * Only run for the last update of the input field
       * Query zabbix version api to confirm connectivity
       */
      if (this.timeout) {
        // Reset timer on new data. Thus only run for latest input
        clearTimeout(this.timeout);
      }

      this.timeout = setTimeout(() => {
        let url;
        try {
          url = new URL(val);
        } catch (_) { // eslint-disable-line no-unused-vars
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
            this.zabbixs.servers[index].version = value["result"];
            this.zabbixs.servers[index].errorMsg = "";
            this.$refs.form.validate();
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
      this.zabbixs.servers.push(structuredClone(defaultServer));
    },
    removeServer: function (index) {
      this.zabbixs.servers.splice(index, 1);
    },
    save_data: async function () {
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

        // encrypt pass and api fields
        var ZabbixServers =  encryptSettingKeys(this.zabbixs);
        await browser.storage.local.set({"ZabbixServers": JSON.stringify(ZabbixServers)});
        console.log("Options calling reinitalize")
        browser.runtime.sendMessage({ method: "reinitalize" });
        
        window.close();
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
