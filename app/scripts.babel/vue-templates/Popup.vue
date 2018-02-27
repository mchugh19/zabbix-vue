<template>
    <div class="popup">
        <div id="menu">
            <!-- <input type="search" id="filter" placeholder="Filter Results"> -->
        </div>
        <div id="triggerTable" v-for="servers in triggerTableData.data.servers">
            <div class="server-display">
                <div v-for="(triggerList, server, index) in servers">
                    <template>
                        <v-card>
                            <v-card-title>
                                <h3>{{server}}</h3>
                                <v-spacer></v-spacer>
                                <v-text-field
                                append-icon="search"
                                label="Search"
                                single-line
                                hide-details
                                v-model="server.search"
                                ></v-text-field>
                            </v-card-title>
                            <v-data-table
                                :items="triggerList"
                                :headers="triggerTableData.data.headers"
                                :search="search"
                                hide-actions
                                item-key="triggerid"
                                class="server-display"
                            >
                                <template slot="items" slot-scope="props">
                                    <tr @click="props.expanded = !props.expanded" :class="props.item.priority | priority_class">
                                        <td>{{props.item.system}}</td>
                                        <td class="text-xs-right">{{props.item.description}}</td>
                                        <td class="text-xs-right">{{props.item.priority}}</td>
                                        <td class="text-xs-right">{{props.item.age | date_filter}}</td>
                                    </tr>
                                </template>
                                <template slot="expand" slot-scope="props">
                                    <v-card flat>
                                        <v-card-text>STUFF</v-card-text>
                                    </v-card>
                                </template>
                                <v-alert slot="no-results" :value="true" color="error" icon="warning">
                                    Your search for "{{ search }}" found no results.
                                </v-alert>
                            </v-data-table>
                        </v-card>
                    </template>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
var browser = browser || chrome;
var triggerTable = {};
triggerTable['data'] = {};

function requestTableRefresh(groupids) {
    browser.runtime.sendMessage({
        method: 'refreshTriggers'}, function(response) {
            console.log('Popup got response: ' + JSON.stringify(response));
            if (response) {
                triggerTable.data = response;
            }
            console.log('triggerTable is now: ' + JSON.stringify(triggerTable));
    })
}


document.addEventListener('DOMContentLoaded', function () {
    requestTableRefresh();
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
                0: 'notclassified',
                1: 'information',
                2: 'warning',
                3: 'average',
                4: 'high',
                5: 'disaster',
                9: 'normal'
            }
            return PRIORITIES[value];
        },
        priority_name_filter: function(value) {
            if (typeof value == "number" && value < 10) {
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
            } else {
                return value;
            }
        },
        date_filter: function(value) {
            if (typeof value == "number" && value > 10000) {
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
                    result += (hours % 24) + 'h, ';
                }
                result += (minutes % 60) + 'm';

                return result;
            } else {
                return value;
            }
        }
    },
    methods: {
        updateTriggerData: function(newTriggers) {
            this.triggers = newTriggers;
        }
    }
}
</script>
<style src="vuetify/dist/vuetify.min.css"></style>
