<template>
  <v-app>
    <v-main>
      <v-form ref="form" v-model="zabbixs.global.formValid">
        <v-container fluid grid-list-md class="pa-0 px-2 mx-auto" style="max-width: 800px;">
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

              <v-select
                v-model="server.authType"
                :label="$i18n('authType')"
                :items="authTypeItems"
                item-title="title"
                item-value="value"
              />

              <v-text-field
                v-model="server.apiToken"
                v-if="server.authType === 'token'"
                :label="$i18n('zabbixToken')"
                :rules="[(v) => !!v || $i18n('required')]"
                required
              />

              <v-text-field
                v-model="server.user"
                v-if="server.authType === 'password'"
                :label="$i18n('zabbixUser')"
                :rules="[(v) => !!v || $i18n('required')]"
                required
              />
              <v-text-field
                v-model="server.pass"
                v-if="server.authType === 'password'"
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

              <div
                v-if="server.authType === 'guest'"
                class="text-caption mb-2"
              >
                {{ $i18n('guestHint') }}
              </div>

              <v-checkbox
                v-model="server.showSuppressed"
                class="mb-0 pa-0"
                :label="$i18n('showSuppressed')"
              />
              <v-checkbox
                v-model="server.notify"
                class="mb-0 pa-0"
                :label="$i18n('notify')"
              />
              <v-checkbox
                v-model="server.sound"
                class="mb-0 pa-0"
                :label="$i18n('sound')"
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
              <v-radio-group
                v-model="zabbixs.global.displayName"
                :label="$i18n('selectName')"
              >
                <v-radio :label="$i18n('displayHost')" value="host" />
                <v-radio :label="$i18n('displayName')" value="name" />
              </v-radio-group>
              <v-checkbox
                v-model="zabbixs.global.combineServers"
                class="mb-0 pa-0"
                :label="$i18n('combineServers')"
              />
            </v-card>
          </v-container>
        </v-container>
        <v-btn block :disabled="!zabbixs.global.formValid" @click="save_data">
          {{ $i18n("save") }}
        </v-btn>
        <v-row class="mt-2" dense>
          <v-col cols="6">
            <v-btn block variant="outlined" @click="exportSettings">
              {{ $i18n("exportSettings") }}
            </v-btn>
          </v-col>
          <v-col cols="6">
            <v-btn block variant="outlined" @click="$refs.importFile.click()">
              {{ $i18n("importSettings") }}
            </v-btn>
          </v-col>
        </v-row>
        <input
          ref="importFile"
          type="file"
          accept=".json,application/json"
          style="display: none"
          @change="importSettings"
        />
      </v-form>
    </v-main>
  </v-app>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { browser } from '../lib/browser-shim.js'; // Chrome: aliases globalThis.chrome (no-op in Firefox)
import { mdiClose, mdiEye, mdiEyeOff, mdiReload } from '@mdi/js';
import { Zabbix } from '../lib/zabbix-promise.js';
import { encryptSettingKeys, decryptSettings } from '../lib/crypto.js';

const i18n = browser.i18n.getMessage;

const defaultServer = {
  alias: "New Server",
  url: "",
  authType: "password",
  user: "",
  pass: "",
  apiToken: "",
  showSuppressed: false,
  notify: true,
  sound: true,
  hostGroups: [],
  hostGroupsList: [],
  visiblePass: false,
  errorMsg: "",
  sortBy: [{ key: 'priority', order: 'desc' }],
};

// Reactive state
const form = ref(null);

const zabbixs = ref({
  global: {
    interval: 60,
    displayName: "host",
    minSeverity: 0,
    combineServers: false,
    hideAcknowledged: false,
    hideMaintenance: false,
    formValid: true,
  },
  servers: [
    defaultServer
  ],
});

const intervalRules = [
  (v) => !!v || i18n("required"),
  (v) => v > 9 || i18n("lessSeconds"),
];

const authTypeItems = [
  { value: "password", title: i18n("authTypePassword") },
  { value: "token", title: i18n("authTypeToken") },
  { value: "guest", title: i18n("authTypeGuest") },
];

let debounceTimeout = null;

// Lifecycle
onMounted(async () => {
  let zabbix_data = await browser.storage.local.get("ZabbixServers");
  if (Object.keys(zabbix_data).length > 0) {
    zabbix_data = zabbix_data["ZabbixServers"];
    zabbix_data = JSON.parse(zabbix_data);
    for (let serverIndex in zabbix_data["servers"]) {
      zabbix_data.servers[serverIndex].apiToken = await decryptSettings(zabbix_data.servers[serverIndex].apiToken);
      zabbix_data.servers[serverIndex].pass = await decryptSettings(zabbix_data.servers[serverIndex].pass);
      // Add fields for options screen
      const storedAuthType = zabbix_data.servers[serverIndex].authType;
      if (["password", "token", "guest"].includes(storedAuthType)) {
        zabbix_data.servers[serverIndex].authType = storedAuthType;
      } else {
        // Fallback for settings that missed the background migration
        zabbix_data.servers[serverIndex].authType =
          zabbix_data.servers[serverIndex].apiToken.length > 0 ? "token" : "password";
      }
      zabbix_data.servers[serverIndex].visiblePass = false;
      zabbix_data.servers[serverIndex].hostGroupsList = [];
    }
    // Fallback for settings that missed the background migration:
    // minSeverity moved from per-server to global, keep the lowest value
    zabbix_data.global = zabbix_data.global || {};
    if (zabbix_data.global.minSeverity === undefined) {
      const serverValues = zabbix_data.servers
        .map((s) => s.minSeverity)
        .filter((v) => v !== undefined && v !== null)
        .map(Number);
      zabbix_data.global.minSeverity = serverValues.length ? Math.min(...serverValues) : 0;
    }
    // Same for hide/maintenance, now global toggles in the popup: only
    // enabled when every server had it on
    for (const [serverKey, globalKey] of [["hide", "hideAcknowledged"], ["maintenance", "hideMaintenance"]]) {
      if (zabbix_data.global[globalKey] === undefined) {
        zabbix_data.global[globalKey] = zabbix_data.servers.length > 0 &&
          zabbix_data.servers.every((s) => s[serverKey] === true);
      }
    }
    for (const server of zabbix_data.servers) {
      for (const f of LEGACY_FIELDS) delete server[f];
    }
    zabbixs.value = zabbix_data;
  }
});

// Methods
function serverAPI(val, index) {
  /*
   * Only run for the last update of the input field
   * Query zabbix version api to confirm connectivity
   */
  if (debounceTimeout) {
    // Reset timer on new data. Thus only run for latest input
    clearTimeout(debounceTimeout);
  }

  debounceTimeout = setTimeout(async () => {
    let url;
    try {
      url = new URL(val);
    } catch (_) { // eslint-disable-line no-unused-vars
      zabbixs.value.servers[index].errorMsg = i18n("requiredURL");
      return false;
    }
    if (url.protocol === "http:" || url.protocol === "https:") {
      //console.log('protocol is okay')
    } else {
      zabbixs.value.servers[index].errorMsg = i18n("requiredURL");
      return false;
    }

    // Request host permission for this server before testing API
    const origin = url.origin + "/*";
    try {
      const hasPermission = await browser.permissions.contains({ origins: [origin] });
      if (!hasPermission) {
        const granted = await browser.permissions.request({ origins: [origin] });
        if (!granted) {
          zabbixs.value.servers[index].errorMsg = "Host permission required";
          return false;
        }
      }
    } catch (e) {
      console.log("Permission request failed: " + e);
    }

    // validate zabbix connection with query zabbix api version and save in storage
    const zabbix = new Zabbix(val + "/api_jsonrpc.php", null, null);
    zabbix
      .call("apiinfo.version", {})
      .then((value) => {
        zabbixs.value.servers[index].version = value["result"];
        zabbixs.value.servers[index].errorMsg = "";
        form.value.validate();
        return true;
      })
      .catch((err) => {
        console.log(i18n("serverError") + ": " + err);
        zabbixs.value.servers[index].errorMsg = i18n("serverError");
        zabbixs.value.servers[index].version = "";
        return false;
      });

    //console.log("url looks okay!");
    zabbixs.value.servers[index].errorMsg = "";
    return true;
  }, 800);
}

function addServer() {
  zabbixs.value.servers.push(structuredClone(defaultServer));
}

function removeServer(index) {
  zabbixs.value.servers.splice(index, 1);
}

// Fields stripped from export/import: secrets (never leave the device) and
// transient UI state (not part of the settings). The API token is exported
// in plain text on purpose, so a server can be moved without re-entering it.
const SECRET_FIELDS = ["pass"];
const TRANSIENT_FIELDS = ["errorMsg", "visiblePass", "hostGroupsList", "version"];
// Per-server fields that moved to the global settings
const LEGACY_FIELDS = ["minSeverity", "hide", "maintenance"];

async function sanitizeServerForExport(server) {
  const copy = structuredClone(server);
  for (const f of [...SECRET_FIELDS, ...TRANSIENT_FIELDS, ...LEGACY_FIELDS]) delete copy[f];
  try {
    copy.apiToken = copy.apiToken ? await decryptSettings(copy.apiToken) : "";
  } catch (_) { // eslint-disable-line no-unused-vars
    copy.apiToken = "";
  }
  return copy;
}

async function exportSettings() {
  // Read the stored (encrypted) settings so export reflects what's saved,
  // not just what's currently in the form.
  const stored = await browser.storage.local.get("ZabbixServers");
  let servers = [];
  if (stored["ZabbixServers"]) {
    try {
      const parsed = JSON.parse(stored["ZabbixServers"]);
      if (Array.isArray(parsed.servers)) servers = parsed.servers;
    } catch (_) { /* fall through with empty list */ }
  }
  const exportData = {
    app: "zabbix-vue",
    version: 1,
    servers: await Promise.all(servers.map(sanitizeServerForExport)),
  };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "zabbix-vue-settings.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importSettings(event) {
  const file = event.target.files?.[0];
  event.target.value = ""; // allow re-selecting the same file
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || typeof data !== "object" || !Array.isArray(data.servers)) {
      throw new Error("invalid settings file");
    }
    // Never import passwords: strip them so existing ones are preserved.
    // An API token from the file is taken as-is (plain text, encrypted on Save).
    const imported = data.servers.map((s) => {
      const copy = structuredClone(s);
      for (const f of [...SECRET_FIELDS, ...TRANSIENT_FIELDS, ...LEGACY_FIELDS]) delete copy[f];
      const apiToken = typeof copy.apiToken === "string" ? copy.apiToken : "";
      return { ...structuredClone(defaultServer), ...copy, pass: "", apiToken };
    });
    // Merge by URL into the form (not saved yet): update non-credential fields
    // on existing servers, append genuinely new ones. User reviews and clicks
    // Save, entering passwords for new servers manually.
    const existing = zabbixs.value.servers;
    for (const imp of imported) {
      if (!imp.url) continue;
      const idx = existing.findIndex((s) => s.url === imp.url);
      if (idx >= 0) {
        const keepCreds = {
          pass: existing[idx].pass,
          // An imported token wins; otherwise keep the one already configured
          apiToken: imp.apiToken || existing[idx].apiToken,
        };
        existing[idx] = { ...imp, ...keepCreds };
      } else {
        existing.push(imp);
      }
    }
    // Trigger validation/UI refresh for the merged servers
    for (let i = 0; i < existing.length; i++) {
      if (existing[i].url) serverAPI(existing[i].url, i);
    }
  } catch (e) {
    console.log("Settings import failed: " + e.message);
  }
}

async function save_data() {
  /*
   * Save data to localstorage encrypted and close options window
   * Message background.js to reload the new settings
   */

  if (form.value.validate()) {
    // Request host permissions for each configured server URL
    for (const server of zabbixs.value["servers"]) {
      if (server.url) {
        try {
          const url = new URL(server.url);
          const origin = url.origin + "/*";
          const hasPermission = await browser.permissions.contains({ origins: [origin] });
          if (!hasPermission) {
            const granted = await browser.permissions.request({ origins: [origin] });
            if (!granted) {
              console.log("Permission denied for " + origin);
              server.errorMsg = "Host permission required for " + url.origin;
              return;
            }
          }
        } catch (e) {
          console.log("Invalid server URL: " + server.url);
        }
      }
    }

    // Do not save results of hostGroup lookups, password display, or errors
    let savedServerSettings = zabbixs.value["servers"];
    for (let i = 0; i < savedServerSettings.length; i++) {
      savedServerSettings[i].errorMsg = "";
      delete savedServerSettings[i].visiblePass;
      delete savedServerSettings[i].hostGroupsList;
      if (savedServerSettings[i].authType === "guest") {
        // Guest needs no stored credentials; drop anything stale
        savedServerSettings[i].user = "";
        savedServerSettings[i].pass = "";
        savedServerSettings[i].apiToken = "";
      }
    }
    zabbixs.value["servers"] = savedServerSettings;

    // encrypt pass and api fields
    const ZabbixServers = await encryptSettingKeys(zabbixs.value);
    await browser.storage.local.set({"ZabbixServers": JSON.stringify(ZabbixServers)});
    console.log("Options calling reinitialize");
    browser.runtime.sendMessage({ method: "reinitialize" });
    
    window.close();
  } else {
    console.log("submit problem");
  }
}

function refreshGroups(server, user, pass, apiToken, version, index) {
  /*
   * Connect to Zabbix server using provided credentials
   * Perform hostgroup.get lookup and populate the hostgroup list
   */

  zabbixs.value["servers"][index]["errorMsg"] = "";
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
      zabbixs.value["servers"][index].hostGroupsList = value["result"];
    })
    .catch((err) => {
      zabbixs.value["servers"][index].hostGroupsList = [];
      zabbixs.value["servers"][index]["errorMsg"] = err.message;
      console.log(i18n("serverError") + ": " + err);
    })
    .finally(() => {
      zabbix.logout();
    });
}
</script>

<style></style>
