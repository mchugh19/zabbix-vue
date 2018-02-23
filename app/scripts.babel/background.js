'use strict';

var triggerOutput = {
	"jsonrpc": "2.0",
	"result": [{
		"triggerid": "15475",
		"expression": "{17012}=1",
		"description": "Zabbix agent on master is unreachable for 5 minutes",
		"url": "",
		"status": "0",
		"value": "1",
		"priority": "3",
		"lastchange": "1516088190",
		"comments": "",
		"error": "",
		"templateid": "10047",
		"type": "0",
		"state": "0",
		"flags": "0",
		"recovery_mode": "0",
		"recovery_expression": "",
		"correlation_mode": "0",
		"correlation_tag": "",
		"manual_close": "0",
		"hosts": [{
			"hostid": "10258",
			"proxy_hostid": "0",
			"host": "master",
			"status": "0",
			"disable_until": "1519365996",
			"error": "Get value from agent failed: cannot connect to [[10.0.2.15]:10050]: [111] Connection refused",
			"available": "2",
			"errors_from": "1516087871",
			"lastaccess": "0",
			"ipmi_authtype": "-1",
			"ipmi_privilege": "2",
			"ipmi_username": "",
			"ipmi_password": "",
			"ipmi_disable_until": "0",
			"ipmi_available": "0",
			"snmp_disable_until": "0",
			"snmp_available": "0",
			"maintenanceid": "0",
			"maintenance_status": "0",
			"maintenance_type": "0",
			"maintenance_from": "0",
			"ipmi_errors_from": "0",
			"snmp_errors_from": "0",
			"ipmi_error": "",
			"snmp_error": "",
			"jmx_disable_until": "0",
			"jmx_available": "0",
			"jmx_errors_from": "0",
			"jmx_error": "",
			"name": "master",
			"flags": "0",
			"templateid": "0",
			"description": "",
			"tls_connect": "1",
			"tls_accept": "1",
			"tls_issuer": "",
			"tls_subject": "",
			"tls_psk_identity": "",
			"tls_psk": ""
		}]
	}, {
		"triggerid": "13491",
		"expression": "{12900}=1",
		"description": "Zabbix agent on Zabbix server is unreachable for 5 minutes",
		"url": "",
		"status": "0",
		"value": "1",
		"priority": "3",
		"lastchange": "1517766180",
		"comments": "",
		"error": "",
		"templateid": "10047",
		"type": "0",
		"state": "0",
		"flags": "0",
		"recovery_mode": "0",
		"recovery_expression": "",
		"correlation_mode": "0",
		"correlation_tag": "",
		"manual_close": "0",
		"hosts": [{
			"hostid": "10084",
			"proxy_hostid": "0",
			"host": "Zabbix server",
			"status": "0",
			"disable_until": "1519365996",
			"error": "Get value from agent failed: cannot connect to [[127.0.0.1]:10050]: [111] Connection refused",
			"available": "2",
			"errors_from": "1517765870",
			"lastaccess": "0",
			"ipmi_authtype": "-1",
			"ipmi_privilege": "2",
			"ipmi_username": "",
			"ipmi_password": "",
			"ipmi_disable_until": "0",
			"ipmi_available": "0",
			"snmp_disable_until": "0",
			"snmp_available": "0",
			"maintenanceid": "0",
			"maintenance_status": "0",
			"maintenance_type": "0",
			"maintenance_from": "0",
			"ipmi_errors_from": "0",
			"snmp_errors_from": "0",
			"ipmi_error": "",
			"snmp_error": "",
			"jmx_disable_until": "0",
			"jmx_available": "0",
			"jmx_errors_from": "0",
			"jmx_error": "",
			"name": "Zabbix server",
			"flags": "0",
			"templateid": "0",
			"description": "",
			"tls_connect": "1",
			"tls_accept": "1",
			"tls_issuer": "",
			"tls_subject": "",
			"tls_psk_identity": "",
			"tls_psk": ""
		}]
	}, {
		"triggerid": "13500",
		"expression": "{12909}<50",
		"description": "Lack of free swap space on Zabbix server",
		"url": "",
		"status": "0",
		"value": "1",
		"priority": "2",
		"lastchange": "1515922290",
		"comments": "It probably means that the systems requires more physical memory.",
		"error": "",
		"templateid": "10012",
		"type": "0",
		"state": "0",
		"flags": "0",
		"recovery_mode": "0",
		"recovery_expression": "",
		"correlation_mode": "0",
		"correlation_tag": "",
		"manual_close": "0",
		"hosts": [{
			"hostid": "10084",
			"proxy_hostid": "0",
			"host": "Zabbix server",
			"status": "0",
			"disable_until": "1519365996",
			"error": "Get value from agent failed: cannot connect to [[127.0.0.1]:10050]: [111] Connection refused",
			"available": "2",
			"errors_from": "1517765870",
			"lastaccess": "0",
			"ipmi_authtype": "-1",
			"ipmi_privilege": "2",
			"ipmi_username": "",
			"ipmi_password": "",
			"ipmi_disable_until": "0",
			"ipmi_available": "0",
			"snmp_disable_until": "0",
			"snmp_available": "0",
			"maintenanceid": "0",
			"maintenance_status": "0",
			"maintenance_type": "0",
			"maintenance_from": "0",
			"ipmi_errors_from": "0",
			"snmp_errors_from": "0",
			"ipmi_error": "",
			"snmp_error": "",
			"jmx_disable_until": "0",
			"jmx_available": "0",
			"jmx_errors_from": "0",
			"jmx_error": "",
			"name": "Zabbix server",
			"flags": "0",
			"templateid": "0",
			"description": "",
			"tls_connect": "1",
			"tls_accept": "1",
			"tls_issuer": "",
			"tls_subject": "",
			"tls_psk_identity": "",
			"tls_psk": ""
		}]
	}],
	"id": 2
}

var hostgroups = {
    'jsonrpc': '2.0',
    'result': [
        {
            'groupid': '2',
            'name': 'Linux servers',
            'internal': '0'
        },
        {
            'groupid': '4',
            'name': 'Zabbix servers',
            'internal': '0'
        }
    ],
    'id': 1
}


var zabbixChecker = {
    checkServers: function() {
        var settings = JSON.parse(localStorage.getItem('ZabbixServers')) || {};
        var interval = settings['global']['interval'] || 60;
        var hostGroups = settings['global']['hostGroups'] || [];
        //console.log('Got: ' + JSON.stringify(settings));

        if (!settings || 0 === settings.length) {
            console.log('No servers defined.');
        } else {
            for (var i = 0; i < settings['servers'].length; i++) {
                console.log('Found server: ' + settings['servers'][i].alias);
            }
            interval = settings.global.interval;
        }
        setTimeout(function(){ zabbixChecker.checkServers(); },1000*interval);
    },
    getTriggers: function(groups, callback) {
        console.log('Lookup trigger for hostgroups: ' + JSON.stringify(groups));
        //console.log('Got triggers: ' + JSON.stringify(triggerOutput));
        var results = triggerOutput['result'];
        callback(results);
    },
    getHostGroups: function() {
        var localhostgroups = hostgroups['result'];
        console.log('Sending hostgroups: ' + JSON.stringify(localhostgroups));
        return localhostgroups;
    }
};

// Run our script as soon as the document's DOM is ready.
document.addEventListener('DOMContentLoaded', function () {
    zabbixChecker.checkServers();
});

// Activate messaging to popup.js
function handleMessage(request, sender, sendResponse) {
    switch (request.method)
	{
	case 'getHostGroups':
		sendResponse(zabbixChecker.getHostGroups());
		break;
    case 'refreshTriggers':
        console.log('getTriggers request for groups: ' + JSON.stringify(request.data));

        zabbixChecker.getTriggers(request.data, function(triggerReturn) {
            //console.log('ActiveTriggers should be set: ' + JSON.stringify(activeTriggers));
            sendResponse(triggerReturn);
        });

		break;
	}
}
var browser = browser || chrome;
browser.runtime.onMessage.addListener(handleMessage);
