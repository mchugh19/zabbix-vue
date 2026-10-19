<template>
  <v-app>
    <v-alert
      v-if="triggerTableData.error"
      color="red"
      prominent
      type="warning"
    >
      {{ $i18n("checkConfig") }}:
      {{ triggerTableData.errorMessage }}
    </v-alert>

    <div
      v-if="tables.length"
      class="popup-filters"
    >
      <v-select
        v-model="filters.minSeverity"
        :items="severitySelector"
        :label="$i18n('minSev')"
        item-title="name"
        item-value="priority"
        density="compact"
        variant="outlined"
        hide-details
        class="min-severity-select"
        @update:model-value="saveFilters"
      />
      <v-switch
        v-model="filters.hideAcknowledged"
        :label="$i18n('hideEvents')"
        color="primary"
        density="compact"
        hide-details
        @update:model-value="saveFilters"
      />
      <v-switch
        v-model="filters.hideMaintenance"
        :label="$i18n('ignoreHosts')"
        color="primary"
        density="compact"
        hide-details
        @update:model-value="saveFilters"
      />
      <v-spacer />
      <v-btn
        v-if="!isTabView"
        :icon="mdiOpenInNew"
        :title="$i18n('openInTab')"
        size="small"
        variant="text"
        density="comfortable"
        @click="openInTab"
      />
    </div>

    <v-card
      v-for="table in tables"
      id="triggerTable"
      v-bind:key="table.key"
    >
      <v-container>
        <v-row
          class="flex-nowrap"
          no-gutters
        >
          <v-col
            class="flex-grow-0 flex-shrink-0"
            cols="3"
          >
            <h2
              v-if="!table.combined"
              class="server-name-link"
              :title="$i18n('openDashboard')"
              @click="openDashboard(table.url)"
            >{{ table.title }}</h2>
          </v-col>
          <v-col
            class="flex-grow-1 flex-shrink-0"
            cols="4"
            style="min-width: 100px; max-width: 100%;"
          >
            <v-text-field
              v-model="table.search"
              :label="$i18n('filter')"
              single-line
              density="compact"
              clearable
              hide-details
              variant="outlined"
            >
              <template v-slot:append-inner >
                <v-icon :icon="mdiMagnify" />
              </template>
            </v-text-field>
          </v-col>
        </v-row>
      </v-container>
      <v-alert
        v-for="err in table.errors"
        :key="err.server"
        prominent
        type="error"
        density="compact"
        class="ma-1"
      >
        <span v-if="table.combined">{{ err.server }}: </span>
        {{ err.errorMessage }}
        {{ err.errorDetails }}
      </v-alert>
      <v-data-table
        v-if="!(table.errors.length && !table.triggers.length)"
        v-model:sort-by="table.sortBy"
        v-model:expanded="table.expanded"
        :items="visibleTriggers(table.triggers)"
        item-value="rowKey"
        :headers="table.headers"
        :loading="triggerTableData.loading"
        :search="table.search"
        :single-expand="true"
        hide-default-footer
        class="elevation-1"
        density="compact"
        items-per-page="-1"
        @update:sortBy="sortSave($event, table)"
      >
        <template v-slot:item="{ item }">
          <tr :class="priority_class(item.priority)" @click="clickRow(item.rowKey, table)">
            <td v-if="table.combined" class="text-no-wrap">
              <span
                class="server-name-link"
                :title="$i18n('openDashboard')"
                @click.stop="openDashboard(item.url)"
              >{{ item.server }}</span>
            </td>
            <td> {{ item.system }}</td>
            <td>
              <v-sheet class="d-flex mb-0" :class="priority_class(item.priority)">
                <v-sheet class="ma-0 pa-0 me-auto" :class="priority_class(item.priority)">
                  {{ item.description }}
                </v-sheet>
                <v-sheet class="ma-0 pa-0" :class="priority_class(item.priority)">
                  <v-icon v-if="item.acknowledged" class="opacity-40" size="small" :icon="mdiFlagVariant" :title="$i18n('acknowledgedProblem')" />
                  <v-icon v-if="item.maintenance_status" class="opacity-40" size="small" :icon="mdiWrench" :title="$i18n('maintenanceProblem')" />
                  <v-icon v-if="item.suppressed" class="opacity-40" size="small" :icon="mdiEyeOff" :title="$i18n('suppressedProblem')" />
                </v-sheet>
              </v-sheet>
            </td>
            <td> {{ priority_name_filter(item.priority) }}</td>
            <td class="text-no-wrap"> {{ date_filter(item.age) }}</td>
          </tr>
        </template>
        <template v-slot:expanded-row="{ columns, item }">
          <tr>
            <td :colspan="columns.length" class="expanded-cell">
              <div class="expanded-actions">
              <v-btn
                size="small"
                class="pa-0 px-1 ma-0"
                color="teal-lighten-3"
                @click="hostDetails(item.url, item.version, item.hostid)"
              >
                {{ $i18n("hostDetails") }}
              </v-btn>
              <v-btn
                size="small"
                class="pa-0 px-1 ma-0"
                color="teal-lighten-3"
                @click="latestData(item.url, item.version, item.hostid)"
              >
                {{ $i18n("latestData") }}
              </v-btn>
              <v-btn
                size="small"
                class="pa-0 px-1 ma-0"
                color="teal-lighten-3"
                @click="hostGraphs(item.url, item.version, item.hostid)"
              >
                {{ $i18n("hostGraphs") }}
              </v-btn>
              <v-btn
                size="small"
                class="pa-0 px-1 ma-0"
                color="teal-lighten-3"
                @click="hostDashboards(item.url, item.version, item.hostid)"
              >
                {{ $i18n("hostDashboards") }}
              </v-btn>
              <v-btn
                size="small"
                class="pa-0 px-1 ma-0"
                color="teal-lighten-3"
                @click="problemDetails(item.url, item.version, item.triggerid)"
              >
                {{ $i18n("problemDetails") }}
              </v-btn>
              <v-btn
                size="small"
                class="pa-0 px-1 ma-0"
                color="teal-lighten-3"
                @click="eventDetails(item.url, item.version, item.triggerid, item.eventid)"
              >
                {{ $i18n("eventDetails") }}
              </v-btn>
              <v-btn
                size="small"
                class="pa-0 px-1 ma-0"
                color="teal-lighten-3"
                @click="ackEvent(item.url, item.version, item.triggerid, item.eventid)"
              >
                {{ $i18n("ackEvent") }}
              </v-btn>
              </div>
            </td>
          </tr>
        </template>
        <template v-slot:no-data>
          <v-alert
            :value="true"
            type="success"
            color="green-lighten-1"
            v-if="!table.search && !table.errors.length"
          >
            {{ $i18n("noProb") }}
          </v-alert>
          <v-alert
            :value="true"
            type="info"
            v-if="table.search"
          >
            {{ $i18n("noResults") }}: {{ table.search }}
          </v-alert>
        </template>
      </v-data-table>
    </v-card>
  </v-app>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { browser } from '../lib/browser-shim.js'; // Chrome: aliases globalThis.chrome (no-op in Firefox)
import { mdiMagnify, mdiFlagVariant, mdiWrench, mdiEyeOff, mdiOpenInNew } from '@mdi/js';
import { versionPart, ackEventUrl } from '../lib/zabbix-urls.js';

// Zabbix severity levels - replaces magic numbers 0-5
const SEVERITY = Object.freeze({
  NOT_CLASSIFIED: 0,
  INFORMATION: 1,
  WARNING: 2,
  AVERAGE: 3,
  HIGH: 4,
  DISASTER: 5,
  NONE: -1,
});

// Reactive state
const triggerTableData = ref({
  loading: true,
  error: false,
});
// Tables rendered in the popup: one per server, or a single combined one
const tables = ref([]);
// Same page opened in a regular tab (no 800x600 popup limit)
const isTabView = new URLSearchParams(window.location.search).get("view") === "tab";
// Global filter toggles, persisted by the background (settings.global)
const filters = ref({
  minSeverity: 0,
  hideAcknowledged: false,
  hideMaintenance: false,
});

const severitySelector = Object.values(SEVERITY)
  .filter((priority) => priority >= SEVERITY.NOT_CLASSIFIED)
  .map((priority) => ({ name: priority_name_filter(priority), priority }));

// Data fetching
async function getPopupData() {
  // Default to no servers defined
  let tableResults = {
    error: true,
    errorMessage: browser.i18n.getMessage("noServers")
  }

  let popupResults = await browser.storage.session.get("popupTable")
  if ("popupTable" in popupResults) {
    popupResults = popupResults["popupTable"]
    tableResults = popupResults;
  }
  return tableResults;
}

// Display modifications to work around chrome issue 428044 (Tiny popup size)
document.addEventListener("DOMContentLoaded", async function () {
  setTimeout(() => {
    document.body.style.display = "block";
  }, 300);
});

// versionPart imported from ../lib/zabbix-urls.js (unit-tested there)

async function loadPopupData() {
  triggerTableData.value = await getPopupData();
  // Keep per-table UI state (filter text, expanded row) across refreshes
  const previous = Object.fromEntries(tables.value.map((t) => [t.key, t]));
  tables.value = buildTables(triggerTableData.value).map((t) => (
    previous[t.key]
      ? { ...t, search: previous[t.key].search, expanded: previous[t.key].expanded }
      : t
  ));
  filters.value = {
    minSeverity: Number(triggerTableData.value.minSeverity || 0),
    hideAcknowledged: triggerTableData.value.hideAcknowledged === true,
    hideMaintenance: triggerTableData.value.hideMaintenance === true,
  };
}

function onStorageChanged(changes, area) {
  // Background rewrites popupTable on every poll; refresh so an open tab
  // doesn't go stale
  if (area === "session" && "popupTable" in changes) {
    loadPopupData();
  }
}

onMounted(async () => {
  if (isTabView) {
    document.title = browser.i18n.getMessage("appName");
  }
  await loadPopupData();
  browser.storage.onChanged.addListener(onStorageChanged);
});

onUnmounted(() => {
  browser.storage.onChanged.removeListener(onStorageChanged);
});

function openInTab() {
  browser.tabs.create({ url: browser.runtime.getURL("popup/popup.html?view=tab") });
  window.close();
}

function visibleTriggers(triggers) {
  // Same rules as isTriggerHidden in background.js, on the popup row shape
  return triggers.filter((t) =>
    Number(t.priority) >= filters.value.minSeverity &&
    !(filters.value.hideAcknowledged && t.acknowledged) &&
    !(filters.value.hideMaintenance && t.maintenance_status)
  );
}

function saveFilters() {
  // Persist and let the background recompute badge/icon right away
  browser.runtime.sendMessage({
    method: "setFilters",
    minSeverity: filters.value.minSeverity,
    hideAcknowledged: filters.value.hideAcknowledged,
    hideMaintenance: filters.value.hideMaintenance,
  });
}

function serverError(serverObj) {
  return {
    server: serverObj.server,
    errorMessage: serverObj.errorMessage,
    errorDetails: serverObj.errorDetails,
  };
}

function buildTables(data) {
  /*
   * Flatten the per-server popup data into the tables to render.
   * Each row carries its server's alias/url/version so actions work the
   * same way whether the table is per-server or combined.
   */
  const servers = data.servers || [];
  const perServer = servers.map((serverObj, serverIndex) => ({
    key: serverObj.server,
    title: serverObj.server,
    combined: false,
    serverIndex: serverIndex,
    url: serverObj.url,
    headers: data.headers,
    sortBy: serverObj.sortBy || [],
    search: "",
    expanded: [],
    errors: serverObj.error ? [serverError(serverObj)] : [],
    triggers: (serverObj.triggers || []).map((t) => ({
      ...t,
      rowKey: serverIndex + ":" + t.triggerid,
      server: serverObj.server,
      url: serverObj.url,
      version: serverObj.version,
    })),
  }));

  if (!data.combined || perServer.length === 0) {
    return perServer;
  }

  return [{
    key: "__combined__",
    title: "",
    combined: true,
    serverIndex: -1,
    url: null,
    headers: [
      { title: browser.i18n.getMessage("server"), sortable: true, value: "server" },
      ...data.headers,
    ],
    sortBy: data.combinedSortBy || [],
    search: "",
    expanded: [],
    errors: perServer.flatMap((t) => t.errors),
    triggers: perServer.flatMap((t) => t.triggers),
  }];
}

// Methods (exposed to template automatically via <script setup>)
function priority_class(value) {
  const PRIORITIES = {
    [SEVERITY.NOT_CLASSIFIED]: "Cnotclassified",
    [SEVERITY.INFORMATION]: "Cinformation",
    [SEVERITY.WARNING]: "Cwarning",
    [SEVERITY.AVERAGE]: "Caverage",
    [SEVERITY.HIGH]: "Chigh",
    [SEVERITY.DISASTER]: "Cdisaster",
    9: "Cnormal",
  };
  return PRIORITIES[value];
}

function priority_name_filter(value) {
  const PRIORITY_NAMES = {
    [SEVERITY.NOT_CLASSIFIED]: browser.i18n.getMessage("notClassified"),
    [SEVERITY.INFORMATION]: browser.i18n.getMessage("information"),
    [SEVERITY.WARNING]: browser.i18n.getMessage("warning"),
    [SEVERITY.AVERAGE]: browser.i18n.getMessage("average"),
    [SEVERITY.HIGH]: browser.i18n.getMessage("high"),
    [SEVERITY.DISASTER]: browser.i18n.getMessage("disaster"),
  };
  return PRIORITY_NAMES[value];
}

function date_filter(value) {
  const curtime = new Date().getTime();
  const diff = curtime - value * 1000;

  const seconds = parseInt(diff / 1000);
  const minutes = parseInt(seconds / 60);
  const hours = parseInt(minutes / 60);
  const days = parseInt(hours / 24);

  let result = "";
  if (days > 0) {
    result += days + "d, ";
  }
  if (hours > 0) {
    if (days < 1) {
      result += (hours % 24) + "h, ";
    } else {
      result += (hours % 24) + "h";
    }
  }
  if (days < 1) {
    // Only show minutes if under a day
    result += (minutes % 60) + "m";
  }

  return result;
}

function sortSave(value, table) {
  if (!value.length) {
    return;
  }
  browser.runtime.sendMessage({
    method: "submitPagination",
    index: table.serverIndex,
    sortBy: value[0].key,
    descending: value[0].order,
  });
}

function clickRow(rowKey, table) {
  if (table.expanded[0] === rowKey) {
    table.expanded = [];
  } else {
    table.expanded = [rowKey];
  }
}

function hostDetails(url, version, hostid) {
  window.open(url + "/hostinventories.php?hostid=" + hostid, "_blank");
}

function openDashboard(url) {
  if (url) {
    window.open(url, "_blank");
  }
}

function latestData(url, version, hostid) {
  if (versionPart(version, 0) >= 7) {
    window.open(
      url +
        "/zabbix.php?action=latest.view&filter_application=&filter_select=&filter_show_without_data=1&filter_set=1&hostids%5B%5D=" +
        hostid,
      "_blank"
    );
  } else if (versionPart(version, 0) >= 5) {
    window.open(
      url +
        "/zabbix.php?action=latest.view&filter_application=&filter_select=&filter_show_without_data=1&filter_set=1&filter_hostids%5B%5D=" +
        hostid,
      "_blank"
    );
  } else {
    window.open(
      url +
        "/latest.php?fullscreen=0&filter_set=1&show_without_data=1&hostids%5B%5D=" +
        hostid,
      "_blank"
    );
  }
}

function hostGraphs(url, version, hostid) {
  if (versionPart(version, 0) >= 5) {
    window.open(
      url +
        "/zabbix.php?action=charts.view&filter_set=1&view_as=showgraph&filter_search_type=0&filter_hostids%5B0%5D=" +
        hostid,
      "_blank"
    );
  } else {
    window.open(
      url + "/charts.php?fullscreen=0&groupid=0&graphid=0&hostid=" + hostid,
      "_blank"
    );
  }
}

function problemDetails(url, version, triggerid) {
  if (
    versionPart(version, 0) >= 5 ||
    (versionPart(version, 0) == 5 && versionPart(version, 1) >= 2)
  ) {
    window.open(
      url +
        "/zabbix.php?show=1&show_timeline=1&action=problem.view&triggerids%5B%5D=" +
        triggerid,
      "_blank"
    );
  } else {
    window.open(
      url +
        "/zabbix.php?action=problem.view&filter_set=1&filter_triggerids%5B%5D=" +
        triggerid,
      "_blank"
    );
  }
}

function hostDashboards(url, version, hostid) {
  if (
    versionPart(version, 0) > 5 ||
    (versionPart(version, 0) == 5 && versionPart(version, 1) >= 2)
  ) {
    window.open(
      url + "/zabbix.php?action=host.dashboard.view&hostid=" + hostid,
      "_blank"
    );
  } else {
    window.open(url + "/host_screen.php?hostid=" + hostid, "_blank");
  }
  // TODO get url for pre 5.0
}

function eventDetails(url, version, triggerid, eventid) {
  window.open(
    url + "/tr_events.php?triggerid=" + triggerid + "&eventid=" + eventid,
    "_blank"
  );
}

function ackEvent(url, version, triggerid, eventid) {
  window.open(ackEventUrl(url, version, eventid), "_blank");
}
</script>

<style>
tr.Cdisaster,
div.Cdisaster {
  background-color: #ff3838;
  color: #222222;
}
tr.Chigh,
div.Chigh {
  background-color: #ff9999;
  color: #222222;
}
tr.Caverage,
div.Caverage {
  background-color: #ffb689;
  color: #222222;
}
tr.Cwarning,
div.Cwarning {
  background-color: #fff6a5;
  color: #222222;
}
tr.Cinformation,
div.Cinformation {
  background-color: #d6f6ff;
  color: #222222;
}
tr.Cunknown_trigger,
div.Cunknown_trigger {
  background-color: #dbdbdb;
  color: #222222;
}
tr.Cnormal,
tr.Cnotclassified,
div.Cnotclassified,
div.Cnormal {
  background-color: #dbdbdb;
  color: #222222;
}

/* Display modifications to work around chrome issue 428044
 * (Tiny popup size)
 */
body {
  min-width: 800px;
}
.v-table.v-table--density-compact {
  --v-table-header-height: 20px;
  --v-table-row-height: 20px;
}
.v-btn--size-small {
    --v-btn-height: 19px;
}
.v-btn--size-small {
    --v-btn-size: 0.73rem;
}
/* Expanded-row action buttons: single row, natural widths like the original design.
 * Vuetify's default button letter-spacing wastes ~90px across the seven
 * buttons, so neutralize it and use a slightly smaller label size to fit
 * the 800px popup without wrapping or scrolling. */
.expanded-actions {
    display: flex;
    gap: 2px;
    /* Wrap as a fallback for locales whose labels overflow the 800px
     * popup (measured: ru/pl/pt exceed the single-row budget).
     * English still renders as one row; wrapping only triggers when
     * the buttons cannot fit, avoiding a horizontal scrollbar. */
    flex-wrap: wrap;
    align-items: center;
}
.expanded-actions .v-btn {
    flex: 1 1 auto;
    letter-spacing: normal;
    text-indent: 0;
    padding-left: 2px !important;
    padding-right: 2px !important;
    --v-btn-size: 0.75rem;
    --v-btn-height: 18px;
}
/* Reclaim side padding in the expanded row so the larger labels still fit */
td.expanded-cell {
    padding-left: 4px !important;
    padding-right: 4px !important;
}
.v-input--density-compact {
  --v-input-padding-top: 0px;
  --v-input-control-height: 0px;
}
.v-container {
    padding-top: 10px;
    padding-left: 10px;
    padding-right: 10px;
    padding-bottom: 3px;
}
.popup-filters {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 8px 10px 0;
}
.min-severity-select {
    flex: 0 0 170px;
}
/* Server name opens the Zabbix dashboard in a new tab */
.server-name-link {
    cursor: pointer;
}
.server-name-link:hover {
    text-decoration: underline;
}
</style>
