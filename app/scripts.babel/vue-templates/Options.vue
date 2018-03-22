<template>
    <v-app>
        <v-form v-model="zabbixs.global.formValid" ref="form" lazy-validation>
            <v-container fluid grid-list-sm>
                <v-layout row>
                    <v-card class="serverConfig">
                    <h1>{{ $i18n('serverSettings')}}</h1><br>

                        <v-card class="serverBlock" v-for="(server, index) in zabbixs.servers" v-bind:key="server[index]">
                            <h2>{{ $i18n('server')}}: {{server.alias}}</h2>

                            <v-btn
                            id='removeServer'
                            v-if="zabbixs.servers.length > 1"
                            @click='removeServer(index)'>
                                X
                            </v-btn>

                            <v-text-field
                            :label="$i18n('alias')"
                            v-model="server.alias"
                            :rules="[v => !!v || $i18n('required')]"
                            required
                            ></v-text-field>
                            <v-text-field
                            :label="$i18n('URL')"
                            v-model="server.url"
                            :rules="urlRules"
                            required
                            ></v-text-field>
                            <v-text-field
                            :label="$i18n('zabbixUser')"
                            v-model="server.user"
                            :rules="[v => !!v || $i18n('required')]"
                            required
                            ></v-text-field>
                            <v-text-field
                            :label="$i18n('zabbixPass')"
                            v-model="server.pass"
                            required
                            :append-icon="server.visiblePass ? 'visibility' : 'visibility_off'"
                            :append-icon-cb="() => (server.visiblePass = !server.visiblePass)"
                            :type="server.visiblePass ? 'text' : 'password'"
                            :rules="[v => !!v || $i18n('required')]"
                            ></v-text-field>
                            <v-checkbox
                            :label="$i18n('hideEvents')"
                            v-model="server.hide"
                            ></v-checkbox>
                            <v-checkbox
                            :label="$i18n('ignoreHosts')"
                            v-model="server.maintenance"
                            ></v-checkbox>
                            <v-select
                            :items="severitySelector"
                            v-model="server.minSeverity"
                            :label="$i18n('minSev')"
                            item-text="name"
                            item-value="priority">
                            </v-select>

                            <div class="grouper">
                            <v-select
                            class="hostGroupSelect"
                            :items="server.hostGroupsList"
                            v-model="server.hostGroups"
                            :label="$i18n('monGroups')"
                            item-text="name"
                            item-value="groupid"
                            autocomplete
                            multiple
                            ></v-select>
                            <v-btn class="reloadHostGroups"
                            @click='refreshGroups(server.url, server.user, server.pass, index)'>
                            <i class="reloadBtn material-icons">autorenew</i>
                            </v-btn>
                            <span v-if="server.errorMsg" class='serverError'>
                                <i class="material-icons">warning</i>{{ $i18n('serverError')}}: {{server.errorMsg}}
                            </span>
                            </div>

                        </v-card>
                    </v-card>
                </v-layout>
                <v-layout row>
                    <v-card class="globalSettings" name='globalSettings'>
                        <h1>{{ $i18n('generalSettings')}}</h1>
                        <v-text-field
                            :label="$i18n('updateInterval')"
                            v-model="zabbixs.global.interval"
                            :rules="intervalRules"
                            type='Number'
                            required
                            ></v-text-field>
                            <v-checkbox
                            :label="$i18n('notify')"
                            v-model="zabbixs.global.notify"
                            ></v-checkbox>
                            <v-radio-group
                            v-model="zabbixs.global.displayName"
                            :label="$i18n('selectName')"
                            >
                                <v-radio :label="$i18n('displayHost')" value="host"></v-radio>
                                <v-radio :label="$i18n('displayName')" value="name"></v-radio>
                            </v-radio-group>
                    </v-card>
                </v-layout>
                <v-layout row>
                    <v-btn
                        @click="save_data"
                        :disabled="!zabbixs.global.formValid"
                        >
                        {{ $i18n('save')}}
                    </v-btn>
                </v-layout>
            </v-container>
        </v-form>
        <button id='addZabbix' @click="addServer">{{ $i18n('addServer')}}</button>
    </v-app>
</template>

<script>
import Zabbix from '../lib/zabbix-promise.js';
import '../lib/crypt.io.js';
var browser = browser || chrome;
var zabbix_data;
var severitySelect = [
    {'name': browser.i18n.getMessage('notClassified'), 'priority': 0},
    {'name': browser.i18n.getMessage('information'), 'priority': 1},
    {'name': browser.i18n.getMessage('warning'), 'priority': 2},
    {'name': browser.i18n.getMessage('average'), 'priority': 3},
    {'name': browser.i18n.getMessage('high'), 'priority': 4},
    {'name': browser.i18n.getMessage('disaster'), 'priority': 5}
]

cryptio.get('ZabbixServers', function(err, results) {
    if (err) {
        console.log('Generating new options data');
        zabbix_data = {
            'global': {
                'interval': 60,
                'notify': true,
                'displayName': 'host',
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
                'visiblePass': false,
                'errorMsg': '',
                'pagination': {'sortBy': 'priority', 'descending': true, 'rowsPerPage': -1}

            }]
        }
    } else {
        zabbix_data = results;
        // Set defaults
        if (zabbix_data.global.notify == null) {
            zabbix_data.global.notify = true;
        }
        if (zabbix_data.global.displayName == null) {
            zabbix_data.global.displayName = 'host';
        }
    };
    //console.log('zabbix_data is now: ' + JSON.stringify(zabbix_data));
})

export default {
    data () {
        return {
            'zabbixs': zabbix_data,
            'severitySelector': severitySelect,
            urlRules: [
                v => /^(https?):\/\/(((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:)*@)?(((\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5]))|((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.?)(:\d*)?)(\/((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)+(\/(([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)*)*)?)?(\?((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)|[\uE000-\uF8FF]|\/|\?)*)?(\#((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)|\/|\?)*)?$/i.test(v) || this.$i18n('requiredURL'),
                v => !!v || this.$i18n('requiredURL')
            ],
            intervalRules: [
                v => !! v || this.$i18n('required'),
                (v) => v > 9 || this.$i18n('lessSeconds')
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
                'visiblePass': false,
                'errorMsg': '',
                'pagination': {'sortBy': 'priority', 'descending': true, 'rowsPerPage': -1}
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
                // Do not save results of hostGroup lookups, password display, or errors
                let savedServerSettings = this.zabbixs['servers'];
                for (var i = 0; i < savedServerSettings.length; i++) {
                    savedServerSettings[i].hostGroupsList = [];
                    savedServerSettings[i].errorMsg = '';
                    savedServerSettings[i].visiblePass = false;
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

            this.zabbixs['servers'][index]['errorMsg'] = '';
            const zabbix = new Zabbix(
                server + '/api_jsonrpc.php',
                user,
                pass
            );
            zabbix.login()
                .then(() => {
                    //console.log('Successfully logged in');
                    return zabbix.call('hostgroup.get', {
                        'output': [
                            'groupid',
                            'name'
                        ]
                    });
                    zabbix.logout();
                }).then((value) => {
                    //console.log('found result: ' + JSON.stringify(value['result']));
                    this.zabbixs['servers'][index].hostGroupsList = value['result'];
                }).catch(err => {
                    this.zabbixs['servers'][index].hostGroupsList = [];
                    this.zabbixs['servers'][index]['errorMsg'] = err.message;
                    console.log(this.$i18n('serverError') + ': ' + err);
                })
        }
    }
}
</script>
<style src="vuetify/dist/vuetify.min.css"></style>
<style>
html,
#app {
    width: 400px;
    height: 600px;
    overflow: scroll;
}
body {
	margin: 0;
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
.serverError {
    float: left;
}
</style>
