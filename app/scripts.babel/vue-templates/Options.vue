<template>
    <div>
        <div id="app">
            <h1>Zabbix Servers</h1>
            <span class="errors" v-if="errors['items'][0]">
                {{ errors['items'][0]['msg'] }}
            </span>
            <div class='serverList' v-for="(server, index) in zabbixs.servers">
                <span>Zabbix Server: {{server.alias}}</span><br>
                Alias: <input id="zabbixAlias" type="text" name='alias' v-model="server.alias" v-validate="'required'"><br>
                URL: <input id="zabbixBase" name='url' type="text" v-model="server.url" v-validate="'required|url:true'"><br>
                Zabbix User: <input id="zabbixUser" type="text" name='username' v-model="server.user" v-validate="'required'"><br>
                Zabbix Password: <input id="zabbixPass" name='password' type="password" v-model="server.pass" v-validate="'required'"><br>
                Hide Ack Events: <input id="hideAck" type="checkbox" v-model="server.hide"><br>
                <select id="groupid" v-model='server.hostGroups' multiple>
                    <option v-for="hostgroup in server.hostGroupsList" v-bind:key="hostgroup.name" v-bind:value="hostgroup.groupid">{{ hostgroup.name }}</option>
                </select>
                <input id='refreshGroups' type='button' value='Refresh Group List' @click='refreshGroups(server.url, server.user, server.pass, index)'>
                <select id="severity" v-model='server.minSeverity'>
                    <option v-for="priority in severitySelector" v-bind:key="priority.name" v-bind:value="priority.priority">{{ priority.name }}</option>
                </select>
                <input id='removeZabbix' type='button' value='X' v-if="zabbixs.servers.length > 1" @click='removeServer(index)'>
            </div>
            <div name='globalSettings'>
            Update Interval: <input id="checkInterval" name='interval' type="number" size="2" min="10" max="500" v-model="zabbixs.global.interval" v-validate="'min_value:10|required'"><br>
            </div>
            <button id='addZabbix' @click="addServer" v-bind:disabled="errors.any()">Add Server</button>
        </div>
        <input id="save" type='button' value='Save' @click="save_data" v-bind:disabled="errors.any()">
    </div>
</template>

<script>
const Zabbix = require('zabbix-promise');
require('crypt.io');
global.sjcl = require('sjcl');
var browser = browser || chrome;
var severitySelect = [
    {'name': 'not classified', 'priority': 0},
    {'name': 'information', 'priority': 1},
    {'name': 'warning', 'priority': 2},
    {'name': 'average', 'priority': 3},
    {'name': 'high', 'priority': 4},
    {'name': 'disaster', 'priority': 5}
]

var zabbix_data;
cryptio.get('ZabbixServers', function(err, results) {
    if (err) {
        zabbix_data = {
            'global': {
                'interval': 60
            },
            'servers': [{
                'alias': 'New Server',
                'url': '',
                'user': '',
                'pass': '',
                'hide': false,
                'hostGroups': [],
                'hostGroupsList': [],
                'minSeverity': 0

            }]
        }
    };
    zabbix_data = results;
    console.log('zabbix_data is now: ' + JSON.stringify(zabbix_data));
})

export default {
    data () {
        return {
            'zabbixs': zabbix_data,
            'severitySelector': severitySelect
        }
    },
    methods: {
        addServer: function () {
            this.zabbixs.servers.push({
                'alias': 'New Server',
                'url': '',
                'user': '',
                'pass': '',
                'hide': false,
                'hostGroups': [],
                'hostGroupsList': [],
                'minSeverity': 0
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

            // Only save if validation successful
            this.$validator.validateAll().then(res=>{
                if(res) {

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
            })
        },
        refreshGroups: function (server, user, pass, index) {
            /*
            * Connect to Zabbix server using provided credentials
            * Perform hostgroup.get lookup and popuplate the hostgroup list
            */

            // Clear old errors
            this.errors.items = [];

            const zabbix = new Zabbix(
                server + '/api_jsonrpc.php',
                user,
                pass
            );
            this.$validator.validateAll().then(
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
            );
        }
    }
}
</script>
