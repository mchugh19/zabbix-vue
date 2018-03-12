<template>
    <v-app class="popup">
        <span v-if="triggerTableData.data.error" class='serverError'>
            <i class="material-icons">warning</i> Check server configuration in extension options
        </span>
        <v-card class="serverBlock" id="triggerTable" v-for="serverObj in triggerTableData.data.servers" v-bind:key="serverObj.server">
            <v-card-title>
                <h3>{{serverObj.server}}</h3>
                <v-spacer></v-spacer>
                <v-text-field
                append-icon="search"
                label="Filter"
                single-line
                hide-details
                v-model="serverObj.search"
                ></v-text-field>
            </v-card-title>
            <v-data-table
                :items="serverObj.triggers"
                :headers="triggerTableData.data.headers"
                :loading="triggerTableData.data.loaded"
                v-bind:search="serverObj.search"
                v-bind:pagination.sync="serverObj.pagination"
                hide-actions
                item-key="triggerid"
                class="server-display"
            >
                <template slot="items" slot-scope="props">
                    <tr class="show-overflow" @click="props.expanded = !props.expanded" :class="props.item.priority | priority_class">
                        <td class="show-overflow">{{props.item.system}}</td>
                        <td class="text-xs-left show-overflow">{{props.item.description}}
                            <span style="float:right;">
                                <i v-if="props.item.acknowledged" class="tiny material-icons">flag</i>
                                <i v-if="props.item.maintenance_status" class="tiny material-icons">build</i>
                            </span>
                        </td>
                        <td class="text-xs-left show-overflow">{{props.item.priority | priority_name_filter}}</td>
                        <td class="text-xs-left show-overflow">{{props.item.age | date_filter}}</td>
                    </tr>
                </template>
                <template slot="expand" slot-scope="props">
                    <v-layout row justify-left>
                        <v-btn color="teal lighten-3" @click="hostDetails(serverObj.url, props.item.hostid)">Host Details</v-btn>
                        <v-btn color="teal lighten-3" @click="latestData(serverObj.url, props.item.hostid)">Latest Data</v-btn>
                        <v-btn color="teal lighten-3" @click="hostGraphs(serverObj.url, props.item.hostid)">Host Graphs</v-btn>
                        <v-btn color="teal lighten-3" @click="problemDetails(serverObj.url, props.item.triggerid)">Problem Details</v-btn>
                        <v-btn color="teal lighten-3" @click="eventDetails(serverObj.url, props.item.triggerid, props.item.eventid)">Event Details</v-btn>
                        <v-btn color="teal lighten-3" @click="ackEvent(serverObj.url, props.item.triggerid, props.item.eventid)">Ack Event</v-btn>
                    </v-layout>
                </template>
                <template slot="no-data">
                    <v-alert :value="true" color="green lighten-1" icon="done">
                        No problems
                    </v-alert>
                </template>
                <v-alert slot="no-results" :value="true" color="red" icon="warning">
                    Your search for "{{ serverObj.search }}" found no results.
                </v-alert>
            </v-data-table>
        </v-card>
    </v-app>
</template>

<script>
var browser = browser || chrome;
var triggerTable = {};
triggerTable['data'] = {};
triggerTable['data']['loaded'] = true;


function requestTableRefresh() {
    browser.runtime.sendMessage({
        'method': 'refreshTriggers'}, function(response) {
            //console.log('refreshTriggers Popup got response: ' + JSON.stringify(response));
            if (response) {
                if (Object.keys(response).length === 0 && response.constructor === Object) {
                    // No servers defined
                    triggerTable.data.error = true;
                } else {
                    triggerTable.data = response;
                }
            } else {
                triggerTable.data.error = true;
            }
            //console.log('triggerTable is now: ' + JSON.stringify(triggerTable));
        }
    )
}


document.addEventListener('DOMContentLoaded', function () {
    requestTableRefresh();

    // Display modifications to work around chrome issue 428044
    // (Tiny popup size)
    setTimeout(() => {
        document.body.style.display = 'block';
    }, 50);
});

export default {
    data () {
        return {
            'triggerTableData': triggerTable
        }
    },
    filters: {
        priority_class: function(value) {
            var PRIORITIES = {
                0: 'Cnotclassified',
                1: 'Cinformation',
                2: 'Cwarning',
                3: 'Caverage',
                4: 'Chigh',
                5: 'Cdisaster',
                9: 'Cnormal'
            }
            return PRIORITIES[value];
        },
        priority_name_filter: function(value) {
            var PRIORITY_NAMES = {
                0: 'Not Classified',
                1: 'Information',
                2: 'Warning',
                3: 'Average',
                4: 'High',
                5: 'Disaster',
                9: 'Normal'
            }
            return PRIORITY_NAMES[value];
        },
        date_filter: function(value) {
            var curtime = new Date().getTime();
            var diff = curtime - (value * 1000);

            var seconds = parseInt(diff / 1000);
            var minutes = parseInt(seconds / 60);
            var hours = parseInt(minutes / 60);
            var days = parseInt(hours / 24);

            var result = '';
            if (days > 0) {
                result += days + 'd, ';
            }
            if (hours > 0) {
                if (days < 1){
                    result += (hours % 24) + 'h, ';
                } else {
                    result += (hours % 24) + 'h';
                }
            }
            if (days < 1) {
                // Only show minutes if under a day
                result += (minutes % 60) + 'm';
            }

            return result;
        }
    },
    methods: {
        updateTriggerData: function(newTriggers) {
            this.triggers = newTriggers;
        },
        hostDetails: function(url, hostid) {
            window.open(url + "/hostinventories.php?hostid=" + hostid, "_blank")
        },
        latestData: function(url, hostid) {
            window.open(url + "/latest.php?fullscreen=0&filter_set=1&show_without_data=1&hostids%5B%5D=" + hostid, "_blank")
        },
        hostGraphs: function(url, hostid) {
            window.open(url + "/charts.php?fullscreen=0&groupid=0&graphid=0&hostid=" + hostid, "_blank")
        },
        problemDetails: function(url, triggerid) {
            window.open(url + "/zabbix.php?action=problem.view&filter_set=1&filter_triggerids%5B%5D=" + triggerid, "_blank")
        },
        eventDetails: function(url, triggerid, eventid) {
            window.open(url + "/tr_events.php?triggerid=" + triggerid + "&eventid=" + eventid, '_blank');
        },
        ackEvent: function(url, triggerid, eventid) {
            window.open(url + "/zabbix.php?action=acknowledge.edit&eventids[]=" + eventid, '_blank');
        }
    }
}
</script>
<style src="vuetify/dist/vuetify.min.css"></style>
<style>
/* Override vuetify defaults for greater table density*/
table.table thead tr {
    height: unset;
}
table.table tbody th,
table.table tbody td {
    height: unset;
}
table.table tbody td:first-child,
table.table tbody td:not(:first-child),
table.table tbody th:first-child,
table.table tbody th:not(:first-child),
table.table thead td:first-child,
table.table thead td:not(:first-child),
table.table thead th:first-child,
table.table thead th:not(:first-child) {
    padding: 0 5px;
}
.btn {
	height: 20px;
	margin: 2px 2px;
}
.btn__content {
	padding: 0 10px;
}
.card__title {
    padding: unset;
}
.serverError {
    padding: 20px;
    background-color: gray;
    color: white;
    margin-bottom: 15px;
    display: block;
}
/* Display modifications to work around chrome issue 428044
 * (Tiny popup size)
 */
body {
    display: none;
}
i.tiny {
    font-size: 16px;
}
</style>
