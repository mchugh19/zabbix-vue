<template>
  <v-app>
    <v-alert
      v-if="triggerTableData.data.error"
      color="red"
      prominent
      type="warning"
    >
      {{ $i18n("checkConfig") }}:
      {{ triggerTableData.data.errorMessage }}
    </v-alert>

    <v-card
      id="triggerTable"
      v-for="serverObj in triggerTableData.data.servers"
      v-bind:key="serverObj.server"
    >
      <v-card-title class="pa-0 ma-0">
        <h3>{{ serverObj.server }}</h3>
        <v-spacer></v-spacer>
        <v-text-field
          append-icon="search"
          :label="$i18n('filter')"
          single-line
          hide-details
          v-model="serverObj.search"
        ></v-text-field>
      </v-card-title>
      <v-data-table
        :items="serverObj.triggers"
        item-key="triggerid"
        :headers="triggerTableData.data.headers"
        :loading="triggerTableData.data.loaded"
        :search="serverObj.search"
        :sort-by.sync="serverObj.pagination.sortBy"
        :sort-desc.sync="serverObj.pagination.descending"
        :hide-default-footer="true"
        disable-pagination
        class="elevation-1"
        dense
        single-expand
      >
        <template v-slot:item="{index, item, isExpanded, expand}">
          <tr
            :key="item.name"
            :class="item.priority | priority_class"
            @mouseover="toolsIndex=index"
            @mouseleave="toolsIndex=null"
            @click="expand(!isExpanded)"
          >
            <td>{{ item.system }}</td>
            <td>
              <v-layout>
                {{ item.description }}
                <v-layout justify-end>
                  <v-icon v-if="item.acknowledged" small>flag</v-icon>
                  <v-icon v-if="item.maintenance_status" small>build</v-icon>
                </v-layout>
              </v-layout>
            </td>
            <td>
              {{ item.priority | priority_name_filter }}
            </td>
            <td>
              {{ item.age | date_filter }}
            </td>
          </tr>
        </template>
        <template v-slot:expanded-item="{ headers, item }">
          <td :colspan="headers.length">
            <v-btn
              small
              class="pa-0 px-1 ma-0 mr-1"
              color="teal lighten-3"
              @click="hostDetails(serverObj.url, serverObj.version, item.hostid)"
              >{{ $i18n("hostDetails") }}</v-btn
            >
            <v-btn
              small
              class="pa-0 px-1 ma-0 mr-1"
              color="teal lighten-3"
              @click="latestData(serverObj.url, serverObj.version, item.hostid)"
              >{{ $i18n("latestData") }}</v-btn
            >
            <v-btn
              small
              class="pa-0 px-1 ma-0 mr-1"
              color="teal lighten-3"
              @click="hostGraphs(serverObj.url, serverObj.version, item.hostid)"
              >{{ $i18n("hostGraphs") }}</v-btn
            >
            <v-btn
              small
              class="pa-0 px-1 ma-0 mr-1"
              color="teal lighten-3"
              @click="hostDashboards(serverObj.url, serverObj.version, item.hostid)"
              >{{ $i18n("hostDashboards") }}</v-btn
            >
            <v-btn
              small
              class="pa-0 px-1 ma-0 mr-1"
              color="teal lighten-3"
              @click="problemDetails(serverObj.url, serverObj.version, item.triggerid)"
              >{{ $i18n("problemDetails") }}</v-btn
            >
            <v-btn
              small
              class="pa-0 px-1 ma-0 mr-1"
              color="teal lighten-3"
              @click="
                eventDetails(
                  serverObj.url,
                  serverObj.version,
                  item.triggerid,
                  item.eventid
                )
              "
              >{{ $i18n("eventDetails") }}</v-btn
            >
            <v-btn
              small
              class="pa-0 px-1 ma-0"
              color="teal lighten-3"
              @click="
                ackEvent(
                  serverObj.url,
                  serverObj.version,
                  item.triggerid,
                  item.eventid
                )
              "
              >{{ $i18n("ackEvent") }}</v-btn
            >
          </td>
        </template>
        <template slot="no-data">
          <v-alert :value="true" color="green lighten-1" icon="done">
            {{ $i18n("noProb") }}
          </v-alert>
        </template>
        <v-alert slot="no-results" :value="true" color="red" icon="warning">
          {{ $i18n("noResults") }}: {{ serverObj.search }}
        </v-alert>
      </v-data-table>
    </v-card>
  </v-app>
</template>

<script>
var browser = browser || chrome;
var triggerTable = {};
triggerTable["data"] = {};
triggerTable["data"]["loaded"] = true;
triggerTable.data.error = false;

function requestTableRefresh() {
  browser.runtime.sendMessage(
    {
      method: "refreshTriggers",
    },
    function (response) {
      //console.log("refreshTriggers Popup got response: " + JSON.stringify(response));
      if (response) {
        if (
          Object.keys(response).length === 0 &&
          response.constructor === Object
        ) {
          // No servers defined
          triggerTable.data.error = true;
          triggerTable.data.errorMessage = browser.i18n.getMessage("noServers");
        } else {
          triggerTable.data = response;
        }
      } else {
        triggerTable.data.error = true;
        triggerTable.data.errorMessage = browser.i18n.getMessage("error");
      }
      //console.log("triggerTable is now: " + JSON.stringify(triggerTable));
    }
  );
}

document.addEventListener("DOMContentLoaded", function () {
  requestTableRefresh();

  // Display modifications to work around chrome issue 428044
  // (Tiny popup size)
  setTimeout(() => {
    document.body.style.display = "block";
  }, 300);
});

export default {
  data() {
    return {
      triggerTableData: triggerTable,
    };
  },
  filters: {
    priority_class: function (value) {
      var PRIORITIES = {
        0: "Cnotclassified",
        1: "Cinformation",
        2: "Cwarning",
        3: "Caverage",
        4: "Chigh",
        5: "Cdisaster",
        9: "Cnormal",
      };
      return PRIORITIES[value];
    },
    priority_name_filter: function (value) {
      var PRIORITY_NAMES = {
        0: browser.i18n.getMessage("notClassified"),
        1: browser.i18n.getMessage("information"),
        2: browser.i18n.getMessage("warning"),
        3: browser.i18n.getMessage("average"),
        4: browser.i18n.getMessage("high"),
        5: browser.i18n.getMessage("disaster"),
      };
      return PRIORITY_NAMES[value];
    },
    date_filter: function (value) {
      var curtime = new Date().getTime();
      var diff = curtime - value * 1000;

      var seconds = parseInt(diff / 1000);
      var minutes = parseInt(seconds / 60);
      var hours = parseInt(minutes / 60);
      var days = parseInt(hours / 24);

      var result = "";
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
    },
  },
  methods: {
    expandRow: function (item) {
      //console.log("expand for " + JSON.stringify(item))
      this.triggerTableData.data.expanded = item === this.triggerTableData.data.expanded[0] ? [] : [item]
    },
    updateTriggerData: function (newTriggers) {
      this.triggers = newTriggers;
    },
    hostDetails: function (url, version, hostid) {
      window.open(url + "/hostinventories.php?hostid=" + hostid, "_blank");
    },
    latestData: function (url, version, hostid) {
      if (version.split(".")[0] >= 5) {
        window.open(
          url +
            "/zabbix.php?action=latest.view&filter_application=&filter_select=&filter_show_without_data=1&filter_set=1&filter_hostids%5B%5D=" +
            hostid,
          "_blank"
        );
      }  else {
        window.open(
          url +
            "/latest.php?fullscreen=0&filter_set=1&show_without_data=1&hostids%5B%5D=" +
            hostid,
          "_blank"
        );
      }
    },
    hostGraphs: function (url, version, hostid) {
      if (version.split(".")[0] >= 5) {
        window.open(
          url +
            "/zabbix.php?action=charts.view&filter_set=1&view_as=showgraph&filter_search_type=0&filter_hostids%5B0%5D=" +
            hostid,
          "_blank"
        );
      }  else {
        window.open(
          url + "/charts.php?fullscreen=0&groupid=0&graphid=0&hostid=" + hostid,
          "_blank"
        );
      }
    },
    problemDetails: function (url, version, triggerid) {
      if (version.split(".")[0] >= 5 ||
         (version.split(".")[0] == 5 && version.split(".")[1] >=2 )) {
        window.open(
          url +
            "/zabbix.php?show=1&show_timeline=1&action=problem.view&triggerids%5B%5D=" +
            triggerid,
          "_blank"
        );
      }  else {
        window.open(
          url +
            "/zabbix.php?action=problem.view&filter_set=1&filter_triggerids%5B%5D=" +
            triggerid,
          "_blank"
        );
      }
    },
    hostDashboards: function (url, version, hostid) {
      if (version.split(".")[0] > 5 ||
         (version.split(".")[0] == 5 && version.split(".")[1] >= 2 )) {
        window.open(
          url +
            "/zabbix.php?action=host.dashboard.view&hostid=" +
            hostid,
          "_blank"
        );
      } else {
        window.open(
          url +
            "/host_screen.php?hostid=" +
            hostid,
          "_blank"
        );
      }
      // TODO get url for pre 5.0
    },
    eventDetails: function (url, version, triggerid, eventid) {
      window.open(
        url + "/tr_events.php?triggerid=" + triggerid + "&eventid=" + eventid,
        "_blank"
      );
    },
    ackEvent: function (url, version, triggerid, eventid) {
      if (version.split(".")[0] >= 5) {
        window.open(
          url + "/zabbix.php?action=popup&popup_action=acknowledge.edit&eventids%5B%5D=" +
            eventid,
          "_blank"
        );
      }  else {
        window.open(
          url + "/zabbix.php?action=acknowledge.edit&eventids[]=" + eventid,
          "_blank"
        );
      }
    },
  },
  watch: {
    // Watch for updates in order to pass along data-table sorting
    "triggerTableData.data.servers": {
      handler: function (val, oldVal) {
        if (oldVal) {
          // initial load activates watch, so only update on next change (already has oldVal)
          for (var i = 0; i < this.triggerTableData.data.servers.length; i++) {
            let sortBy = val[i].pagination.sortBy;
            let descending = val[i].pagination.descending;
            browser.runtime.sendMessage({
              method: "submitPagination",
              index: i,
              sortBy: sortBy,
              descending: descending,
            });
          }
        }
      },
      deep: true,
    },
  },
};
</script>
<style>
tr.Cdisaster {
  background-color: #ff3838;
  color: #222222;
}
tr.Chigh {
  background-color: #ff9999;
  color: #222222;
}
tr.Caverage {
  background-color: #ffb689;
  color: #222222;
}
tr.Cwarning {
  background-color: #fff6a5;
  color: #222222;
}
tr.Cinformation {
  background-color: #d6f6ff;
  color: #222222;
}
tr.Cunknown_trigger {
  background-color: #dbdbdb;
  color: #222222;
}
tr.Cnormal,
tr.Cnotclassified {
  background-color: #dbdbdb;
  color: #222222;
}

/* Display modifications to work around chrome issue 428044
 * (Tiny popup size)
 */
body {
  min-width: 800px;
}
.v-data-table--dense>.v-data-table__wrapper>table>tbody>tr>td,
.v-data-table--dense>.v-data-table__wrapper>table>tbody>tr>th {
  height: 20px;
}

</style>
