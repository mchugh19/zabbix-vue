<template>
    <v-app>
        <v-form v-model="zabbixs.global.formValid" ref="form" lazy-validation>
            <v-container fluid grid-list-sm>
                <v-layout row>
                    <v-card class="serverConfig">
                    <h1>Server Settings</h1><br>

                        <v-card class="serverBlock" v-for="(server, index) in zabbixs.servers" v-bind:key="server[index]">
                            <h2>Server: {{server.alias}}</h2>

                            <v-btn
                            id='removeServer'
                            v-if="zabbixs.servers.length > 1"
                            @click='removeServer(index)'>
                                X
                            </v-btn>

                            <v-text-field
                            label="Alias"
                            v-model="server.alias"
                            :rules="[v => !!v || 'Item is required']"
                            required
                            ></v-text-field>
                            <v-text-field
                            label="URL"
                            v-model="server.url"
                            :rules="urlRules"
                            required
                            ></v-text-field>
                            <v-text-field
                            label="Zabbix User"
                            v-model="server.user"
                            :rules="[v => !!v || 'Item is required']"
                            required
                            ></v-text-field>
                            <v-text-field
                            label="Zabbix Password"
                            v-model="server.pass"
                            required
                            :append-icon="server.visiblePass ? 'visibility' : 'visibility_off'"
                            :append-icon-cb="() => (server.visiblePass = !server.visiblePass)"
                            :type="server.visiblePass ? 'text' : 'password'"
                            :rules="[v => !!v || 'Item is required']"
                            ></v-text-field>
                            <v-checkbox
                            label="Hide Acknowledged Events"
                            v-model="server.hide"
                            ></v-checkbox>
                            <v-checkbox
                            label="Ignore Hosts in Maintenance"
                            v-model="server.maintenance"
                            ></v-checkbox>
                            <v-select
                            :items="severitySelector"
                            v-model="server.minSeverity"
                            label="Monitor Minimum Severity"
                            item-text="name"
                            item-value="priority">
                            </v-select>

                            <div class="grouper">
                            <v-select
                            class="hostGroupSelect"
                            :items="server.hostGroupsList"
                            v-model="server.hostGroups"
                            label="Monitor Hostgroups"
                            item-text="name"
                            item-value="groupid"
                            autocomplete
                            multiple
                            ></v-select>
                            <v-btn class="reloadHostGroups"
                            @click='refreshGroups(server.url, server.user, server.pass, index)'>
                            <i class="reloadBtn material-icons">autorenew</i>
                            </v-btn>
                            </div>

                        </v-card>
                    </v-card>
                </v-layout>
                <v-layout row>
                    <v-card class="globalSettings" name='globalSettings'>
                        <h1>General Settings</h1>
                        <v-text-field
                            label="Update Interval"
                            v-model="zabbixs.global.interval"
                            :rules="intervalRules"
                            type='Number'
                            required
                            ></v-text-field>
                    </v-card>
                </v-layout>
                <v-layout row>
                    <v-btn
                        @click="save_data"
                        :disabled="!zabbixs.global.formValid"
                        >
                        Save
                    </v-btn>
                </v-layout>
            </v-container>
        </v-form>
        <button id='addZabbix' @click="addServer">Add Server</button>
    </v-app>
</template>

<script>
const Zabbix = require('zabbix-promise');
require('crypt.io');
global.sjcl = require('sjcl');
var browser = browser || chrome;
var zabbix_data;
var severitySelect = [
    {'name': 'not classified', 'priority': 0},
    {'name': 'information', 'priority': 1},
    {'name': 'warning', 'priority': 2},
    {'name': 'average', 'priority': 3},
    {'name': 'high', 'priority': 4},
    {'name': 'disaster', 'priority': 5}
]

cryptio.get('ZabbixServers', function(err, results) {
    if (err) {
        console.log('Generating new options data');
        zabbix_data = {
            'global': {
                'interval': 60,
                'formValid': true
            },
            'servers': [{
                'alias': 'New Server',
                'url': '',
                'user': '',
                'pass': '',
                'hide': false,
                'maintenance': false,
                'hostGroups': [],
                'hostGroupsList': [],
                'minSeverity': 0,
                'visiblePass': false

            }]
        }
    } else {
        zabbix_data = results;
    };
    //console.log('zabbix_data is now: ' + JSON.stringify(zabbix_data));
})

export default {
    data () {
        return {
            'zabbixs': zabbix_data,
            'severitySelector': severitySelect,
            urlRules: [
                v => /^(https?):\/\/(((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:)*@)?(((\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5]))|((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.?)(:\d*)?)(\/((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)+(\/(([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)*)*)?)?(\?((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)|[\uE000-\uF8FF]|\/|\?)*)?(\#((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)|\/|\?)*)?$/i.test(v) || 'Must be a valid URL',
                v => !!v || 'URL is required'
            ],
            intervalRules: [
                v => !! v || 'Interval required',
                (v) => v > 9 || 'Don\'t check more frequently than every 10 seconds!'
            ]
        }
    },
    methods: {
        addServer: function () {
            zabbix_data.servers.push({
                'alias': 'New Server',
                'url': '',
                'user': '',
                'pass': '',
                'hide': false,
                'maintenance': false,
                'hostGroups': [],
                'hostGroupsList': [],
                'minSeverity': 0,
                'visiblePass': false
            });
        },
        removeServer: function (index) {
            //console.log('Removing index: ' + JSON.stringify(index));
            this.zabbixs.servers.splice(index, 1);
        },
        save_data : function() {
            /*
            * Save data to localstorage encrypted and close options window
            * Message background.js to reload the new settings
            */

            if (this.$refs.form.validate()) {
                // Do not save results of hostGroup lookups
                let savedServerSettings = this.zabbixs['servers'];
                for (var i = 0; i < savedServerSettings.length; i++) {
                    savedServerSettings[i].hostGroupsList = [];
                }
                this.zabbixs['servers'] = savedServerSettings;

                var ZabbixServers = this.zabbixs;
                cryptio.set('ZabbixServers', ZabbixServers, function(err, results) {
                    if (err) throw err;
                    console.log(results);
                });
                window.close();
                browser.runtime.sendMessage({method: 'reinitalize'});
            } else {
                console.log("submit problem");
            }
        },
        refreshGroups: function (server, user, pass, index) {
            /*
            * Connect to Zabbix server using provided credentials
            * Perform hostgroup.get lookup and popuplate the hostgroup list
            */

            const zabbix = new Zabbix(
                server + '/api_jsonrpc.php',
                user,
                pass
            );
            zabbix.login()
                .then(() => zabbix.request('hostgroup.get', {
                    'output': [
                        'groupid',
                        'name'
                    ]
                })).then((value) => this.zabbixs['servers'][index].hostGroupsList = value)
                .then(() => zabbix.logout())
                .catch((reason) =>
                this.errors['items'].splice(0, 0, {'msg': "Server connection error"}))
        }
    }
}
</script>
<style src="vuetify/dist/vuetify.min.css"></style>
<style>
html {
    width: 400px;
}
#app {
    width: 400px;
}
.serverConfig.card,
.globalSettings.card {
    margin-top: 8px;
    margin-left: 8px;
    margin-right: 8px;
    width: 400px;
}
.serverBlock.card {
    margin-top: 8px;
}
.grouper {
    overflow: hidden;
}
#removeServer {
    width: 40px;
    min-width: unset;
    float: right;
}
.reloadHostGroups {
    float: right;
    min-width: unset;
    width: 40px;
}
.reloadBtn {
    margin: unset;
}
.input-group {
    margin-left: 8px;
    padding-right: 12px;
}
.hostGroupSelect {
    width: 300px;
    overflow: hidden;
    float: left;
    padding-top: 0px;
}
.hostGroupSelect > label {
    top: unset;
}
</style>
