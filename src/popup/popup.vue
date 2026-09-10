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

    <v-card
      v-for="(serverObj, serverIndex) in triggerTableData.servers"
      id="triggerTable"
      v-bind:key="serverObj.server"
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
            <h2>{{ serverObj.server }}</h2>
          </v-col>
          <v-col
            class="flex-grow-1 flex-shrink-0"
            cols="4"
            style="min-width: 100px; max-width: 100%;"
          >
            <v-text-field
              v-model="serverObj.search"
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
      <v-data-table
        v-model:sort-by="serverObj.sortBy"
        v-model:expanded="serverObj.expanded"
        :items="serverObj.triggers"
        item-value="triggerid"
        :headers="triggerTableData.headers"
        :loading="triggerTableData.loading"
        :search="serverObj.search"
        :single-expand="true"
        hide-default-footer
        class="elevation-1"
        density="compact"
        items-per-page="-1"
        @click:row="clickRow"
        @update:sortBy="sortSave($event, serverIndex)"
      >
        <template v-slot:item="{ item }">
          <tr :class="priority_class(item.priority)" @click="clickRow(item.triggerid, serverIndex)">
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
            <td :colspan="columns.length">
              <div class="expanded-actions">
              <v-btn
                size="small"
                class="pa-0 px-1 ma-0"
                color="teal-lighten-3"
                @click="
                  hostDetails(serverObj.url, serverObj.version, item.hostid)
                "
              >
                {{ $i18n("hostDetails") }}
              </v-btn>
              <v-btn
                size="small"
                class="pa-0 px-1 ma-0"
                color="teal-lighten-3"
                @click="latestData(serverObj.url, serverObj.version, item.hostid)"
              >
                {{ $i18n("latestData") }}
              </v-btn>
              <v-btn
                size="small"
                class="pa-0 px-1 ma-0"
                color="teal-lighten-3"
                @click="hostGraphs(serverObj.url, serverObj.version, item.hostid)"
              >
                {{ $i18n("hostGraphs") }}
              </v-btn>
              <v-btn
                size="small"
                class="pa-0 px-1 ma-0"
                color="teal-lighten-3"
                @click="
                  hostDashboards(serverObj.url, serverObj.version, item.hostid)
                "
              >
                {{ $i18n("hostDashboards") }}
              </v-btn>
              <v-btn
                size="small"
                class="pa-0 px-1 ma-0"
                color="teal-lighten-3"
                @click="
                  problemDetails(serverObj.url, serverObj.version, item.triggerid)
                "
              >
                {{ $i18n("problemDetails") }}
              </v-btn>
              <v-btn
                size="small"
                class="pa-0 px-1 ma-0"
                color="teal-lighten-3"
                @click="
                  eventDetails(
                    serverObj.url,
                    serverObj.version,
                    item.triggerid,
                    item.eventid
                  )
                "
              >
                {{ $i18n("eventDetails") }}
              </v-btn>
              <v-btn
                size="small"
                class="pa-0 px-1 ma-0"
                color="teal-lighten-3"
                @click="
                  ackEvent(
                    serverObj.url,
                    serverObj.version,
                    item.triggerid,
                    item.eventid
                  )
                "
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
            v-if="serverObj.search.length === 0 && !serverObj.error"
          >
            {{ $i18n("noProb") }}
          </v-alert>
          <v-alert
            :value="true" 
            type="info"
            v-if="serverObj.search.length > 0 && !serverObj.error"
          >
            {{ $i18n("noResults") }}: {{ serverObj.search }}
          </v-alert>
          <v-alert
            v-if="serverObj.error"
            prominent
            type="error"
            density="compact"
          >
            {{ serverObj.errorMessage }}
            {{ serverObj.errorDetails }}
          </v-alert>
        </template>
      </v-data-table>
    </v-card>
  </v-app>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { mdiMagnify, mdiFlagVariant, mdiWrench, mdiEyeOff } from '@mdi/js';

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

/**
 * Parse a major or minor version segment as a number for safe comparison.
 * Avoids string comparison bugs where "10" < "7".
 */
function versionPart(version, index) {
  return parseInt(version.split(".")[index], 10) || 0;
}

onMounted(async () => {
  triggerTableData.value = await getPopupData();
});

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

function sortSave(value, serverIndex) {
  browser.runtime.sendMessage({
    method: "submitPagination",
    index: serverIndex,
    sortBy: value[0].key,
    descending: value[0].order,
  });
}

function clickRow(item, serverIndex) {
  if (triggerTableData.value.servers[serverIndex].expanded[0] === item) {
    triggerTableData.value.servers[serverIndex].expanded = [];
  } else {
    triggerTableData.value.servers[serverIndex].expanded = [item];
  }
}

function hostDetails(url, version, hostid) {
  window.open(url + "/hostinventories.php?hostid=" + hostid, "_blank");
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
  if (versionPart(version, 0) >= 7) {
    window.open(
      url +
        "/zabbix.php?action=popup&popup=acknowledge.edit&eventids%5B%5D=" +
        eventid,
      "_blank"
    );
  } else if (versionPart(version, 0) >= 5) {
    window.open(
      url +
        "/zabbix.php?action=popup&popup_action=acknowledge.edit&eventids%5B%5D=" +
        eventid,
      "_blank"
    );
  } else {
    window.open(
      url + "/zabbix.php?action=acknowledge.edit&eventids[]=" + eventid,
      "_blank"
    );
  }
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
    gap: 4px;
    flex-wrap: nowrap;
    align-items: center;
}
.expanded-actions .v-btn {
    flex: 1 1 auto;
    letter-spacing: normal;
    text-indent: 0;
    --v-btn-size: 0.65rem;
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
</style>
