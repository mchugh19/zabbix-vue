'use strict';

var browser = browser || chrome;
const Zabbix = require('zabbix-promise');
require('crypt.io');
global.sjcl = require('sjcl');

var settings = null;
var interval;
var triggerResults = {};
var popupTable = {};


function initalize() {
	/*
	* Set settings from options screen
	* Called by options so also kickoff an initial Zabbix poll
	*/
	cryptio.get('ZabbixServers', function(err, results){
		if (err) {settings = null};
		settings = results;
	});
	try {
		interval = settings['global']['interval'];
	} catch (err) {
		interval = 60;
	}
	//console.log('Got settings: ' + JSON.stringify(settings));
	getAllTriggers();
}


function scheduleCheckServers() {
	/*
	* Loop and schedule updates based on server check interval from options
	*/
	getAllTriggers();

	setTimeout(function(){ scheduleCheckServers(); },1000*interval);
}


function getServerTriggers(server, user, pass, groups, hideAck, minPriority, callback) {
	/*
	* Return data from zabbix trigger.get call
	*/
	//console.log("getServerTriggers for: " + JSON.stringify(server));
	delete popupTable['error'];
	let zResults = {};
	let requestObject = {
		'output': 'extend',
		'expandDescription': 1,
		'skipDependent': 1,
		'selectHosts': [
			'host',
			'hostid',
			'maintenance_status'
		],
		'selectLastEvent': [
			'eventid',
			'acknowledged'
		],
		'monitored': 1,
		'min_severity': minPriority,
		'active': 1,
		'filter': {
			// Value: 0 = OK | 1 = PROBLEM | 2 = UNKNOWN
			'value': 1,
			'status': 0
		},
		'output': [
			'triggerid',
			'description',
			'priority',
			'lastchange'
		],
		'sortfield': 'priority',
		'sortorder': 'DESC'
	}

	if (hideAck) {
		// Don't show acknowledged
		requestObject.withLastEventUnacknowledged = 1;
	}

	const zabbix = new Zabbix(
		server + '/api_jsonrpc.php',
		user,
		pass
	);
	if (groups.length > 0) {
		requestObject.groupids = groups
	}

	zabbix.login()
	.then(() => zabbix.request('trigger.get', requestObject))
	.then((value) => {
		callback(value)
	}).finally(() => zabbix.logout())
	.catch(function(res){
		console.log('Error communicating with: ' + server.toString())
		popupTable['error'] = true;
	})
}


function getAllTriggers(){
	var triggerCount = 0;
	if (!settings || 0 === settings.length) {
		triggerResults = {};
		console.log('No servers defined.');
	} else {
		let serversChecked = [];
		var i = 0;
		function nextCheck() {
			if (i < settings['servers'].length){
				let server = settings['servers'][i].alias;
				let serverURL = settings['servers'][i].url;
				let user = settings['servers'][i].user
				let pass = settings['servers'][i].pass
				let groups = settings['servers'][i].hostGroups;
				let hideAck = settings['servers'][i].hide;
				let minPriority = settings['servers'][i].minSeverity;
				serversChecked.push(server);
				console.log('Found server: ' + server);
				getServerTriggers(serverURL, user, pass, groups, hideAck, minPriority, function(results) {
					// Find triggerid values that are in new results but not in previous
					let oldTriggers = triggerResults[server] || []
					let triggerDiff = results.filter(function(obj) {
						return !oldTriggers.some(function(obj2) {
							return obj.triggerid == obj2.triggerid;
						});
					});

					// Notify popup for new triggers
					for (let trig of triggerDiff) {
						sendNotify(trig);
					}

					// Record new trigger list
					triggerResults[server] = results;

					//console.log('triggerResults for server: ' + JSON.stringify(triggerResults[server]));
					triggerCount += triggerResults[server].length;
					nextCheck();
				})
			} else {
				// all server checks now complete

				// Remove trigger.get data for old servers
				for (var trigServer in triggerResults) {
					if (!serversChecked.includes(trigServer)) {
						console.log('Removing old results for: ' + trigServer);
						delete triggerResults[trigServer];
					}
				}

				if (triggerCount > 0) {
					// Set bage for the number of active triggers
					browser.browserAction.setBadgeBackgroundColor({ color: '#888888' });
					browser.browserAction.setBadgeText({text: triggerCount.toString()});
				} else {
					// Clear badge as there are no active triggers
					browser.browserAction.setBadgeText({text: ''});
				}
				setActiveTriggersTable();
			}
			// Increment at the end to emulate a for loop
			i++;
		}
		nextCheck();
	}
}

function sendNotify(message) {
	/*
	* Create a browser notification popup
	*/
	browser.notifications.create('notification', {
		type: 'basic',
		title: message.hosts[0].host,
		message: message.description,
		iconUrl: 'images/sev_' + message.priority + '.png',
	}, function() {
			setTimeout(function() { browser.notifications.clear('notification', function() {}); }, 5000);
	});
}


function setBrowserIcon(severity) {
	/*
	* -1 no problems
	* 0 not classified
	* 1 information
	* 2 warning
	* 3 average
	* 4 high
	* 5 disaster
	*/
	//console.log('Setting icon for priority: ' + severity.toString());
	browser.browserAction.setIcon({path: 'images/sev_' + severity + '.png'})
}


function setActiveTriggersTable() {
	/*
	* Generate object for display in popup window
	*/
	let topSeverity = -1;
	let popupHeaders = [
		{'text': 'System','value': 'system'},
		{'text': 'Description','value': 'description'},
		{'text': 'Priority','value': 'priority'},
		{'text': 'Age','value': 'age'}
	]

	//console.log('getActiveTriggersTable activated. Current triggerResults: ' + JSON.stringify(triggerResults))
	if (Object.keys(triggerResults).length === 0 && triggerResults.constructor === Object) {
		console.log('No current triggers or servers');
	} else {
		popupTable['servers'] = []
		popupTable['headers'] = popupHeaders
		popupTable['loaded'] = false
		let servers = Object.keys(triggerResults)
		for (var i = 0; i < servers.length; i++) {
			// Iterate over each configured server, generate trigger list

			let serverObject = {};
			let triggerTable = [];
			let server = servers[i];
			console.log('Generating trigger table for server: ' + JSON.stringify(server));
			for (var t = 0; t < triggerResults[server].length; t++) {
				let system = triggerResults[server][t]['hosts'][0]['host']
				let description = triggerResults[server][t]['description']
				let priority = triggerResults[server][t]['priority']
				// Set priority number if higher than current
				// Used to set browser icon
				if (priority > topSeverity) {
					topSeverity = priority
				}
				let age = triggerResults[server][t]['lastchange']
				let triggerid = triggerResults[server][t]['triggerid']
				let hostid = triggerResults[server][t]['hosts'][0]['hostid']
				let eventid = triggerResults[server][t]['lastEvent']['eventid']
				let acknowledged = Number(triggerResults[server][t]['lastEvent']['acknowledged'])
				let maintance = Number(triggerResults[server][t]['hosts'][0]['maintenance_status'])
				triggerTable.push({
					'system': system,
					'description': description,
					'priority': priority,
					'age': age,
					'triggerid': triggerid,
					'hostid': hostid,
					'eventid': eventid,
					'acknowledged': acknowledged,
					'maintenance_status': maintance
				})
			}
			//console.log('TriggerTable: ' + JSON.stringify(triggerTable));
			serverObject['triggers'] = triggerTable;
			serverObject['server'] = server
			// Add search string for server
			serverObject['search'] = '';
			serverObject['pagination'] = {'sortBy': 'priority', 'descending': true, 'rowsPerPage': -1}
			// Lookup zabbix url from settings
			let url = ''
			for (var x = 0; x < settings['servers'].length; x++) {
				if (settings['servers'][i]['alias'] === server) {
					url = settings['servers'][i]['url'];
				}
			}
			serverObject['url'] = url
			//console.log('serverObject is: ' + JSON.stringify(serverObject));
			popupTable['servers'].push(serverObject);
		}
		//console.log('Complete table: ' + JSON.stringify(popupTable));
		setBrowserIcon(topSeverity);
	}
}


function getActiveTriggersTable(callback) {
	callback(popupTable);
}


// Run our script as soon as the document's DOM is ready.
document.addEventListener('DOMContentLoaded', function () {
	initalize();
    scheduleCheckServers();
});


// Activate messaging to popup.js and options.js
function handleMessage(request, sender, sendResponse) {
    switch (request.method) {
    case 'refreshTriggers':
		getActiveTriggersTable(function(results) {
            sendResponse(results);
        });
		break;
	case 'reinitalize':
		// Sent by options to alert to config changes in order to refresh
		initalize();
		break;
	}
	return true;
}
browser.runtime.onMessage.addListener(handleMessage);
