<template>
    <div>
        <div id="app">
            <h1>Zabbix Servers</h1>
            <div class='serverList' v-for="(server, key, index) in zabbixs.servers">
                <span>Zabbix Server: {{server.alias}}</span><br>
                <span v-if="errors['items'][0]">
                    {{ errors['items'][0]['msg'] }}
                </span>
                Alias: <input id="zabbixAlias" type="text" name='alias' v-model="server.alias" v-validate="'required'"><br>
                URL: <input id="zabbixBase" name='url' type="text" v-model="server.url" v-validate="'required|url:true'"><br>
                Zabbix User: <input id="zabbixUser" type="text" name='username' v-model="server.user" v-validate="'required'"><br>
                Zabbix Password: <input id="zabbixPass" name='password' type="password" v-model="server.pass" v-validate="'required'"><br>
                Hide Ack Events: <input id="hideAck" type="checkbox" v-model="server.hide"><br>
                <input id='removeZabbix' type='button' value='X' @click='removeServer(index)'>
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
var zabbix_data = JSON.parse(localStorage.getItem('ZabbixServers')) || {
    'global': {
        'interval': 60,
        'hostGroups': []
    },
    'servers': [{
        'alias': 'New Server',
        'url': '',
        'user': '',
        'pass': '',
        'hide': false
    }]
};
//console.log('Got zabbix_data: ' + JSON.stringify(zabbix_data));

export default {
    data () {
        return {
            'zabbixs': zabbix_data
        }
    },
    methods: {
        addServer: function () {
            this.zabbixs.push();
        },
        removeServer: function (index) {
            this.zabbixs.servers.splice(index, 1);
        },
        save_data : function(){
            this.$validator.validateAll().then(res=>{
                if(res) {
                    localStorage.setItem('ZabbixServers', JSON.stringify(this.zabbixs) );
                    window.close();
                } else {
                    console.log("submit problem");
                }
            })
        }
    }
}
</script>
