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
	getTriggers();
}

function getServerTriggers(server, user, pass, groups, hideAck, minPriority, callback) {
	delete popupTable['error'];
	let zResults = {};
	let requestObject = {
		'output': 'extend',
		'expandDescription': 1,
		'skipDependent': 1,
		'selectHosts': [
			'host',
			'hostid'
		],
		// new stuff
		'monitored': 1,
		'min_severity': minPriority,
		//'active': 1,
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
	}).finally(() => zabbix.logout()).catch(function(res){
		console.log('Error communicating with: ' + server.toString())
		popupTable['error'] = true;
	})
}

Set.prototype.difference = function(setB) {
    var difference = new Set(this);
    for (var elem of setB) {
        difference.delete(elem);
    }
    return difference;
}

function getTriggers(){
	var triggerCount = 0;
	if (!settings || 0 === settings.length) {
		triggerResults = {};
		console.log('No servers defined.');
	} else {
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
				console.log('Found server: ' + server);
				getServerTriggers(serverURL, user, pass, groups, hideAck, minPriority, function(results) {
					/*
					let newResults = [];
					for (lines of results) {
						newResults.push
					}
					console.log('got new results' + JSON.stringify(results));
					let notifyTriggers = results.filter((trig) => {
						return !triggerResults[server].has(trig);
					})
					console.log('New triggers: ' + JSON.stringify(notifyTriggers));
					for (let trg of notifyTriggers) {
						sendNotify(trg);
					}
					*/
					triggerResults[server] = results;
					/*
					let oldTriggersSet = new Set(triggerResults[server]||[]);
					console.log('oldTriggers: ' + JSON.stringify(oldTriggersSet));
					triggerResults[server] = results;
					let newTriggersSet = new Set(triggerResults[server]);
					console.log('newTriggers: ' + JSON.stringify(newTriggersSet));
					//let newTriggerDiff = new Set([...newTriggersSet].filter(x => !oldTriggersSet.has(x)));
					let newTriggerDiff = new Set(
						[...newTriggersSet].filter(x => !oldTriggersSet.has(x))
					);
					console.log('diff found: ' + JSON.stringify([...newTriggerDiff]));

					for (let trig of [...newTriggerDiff]) {
						sendNotify(trig);
					}
					*/
					//console.log('triggerResults for server: ' + JSON.stringify(triggerResults[server]));
					triggerCount += triggerResults[server].length;
					nextCheck();
				})
			} else {
				// all server checks now complete
				if (triggerCount > 0) {
					browser.browserAction.setBadgeBackgroundColor({ color: '#888888' });
					browser.browserAction.setBadgeText({text: triggerCount.toString()});
				} else {
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
	console.log('notify message for: ' + JSON.stringify(message))
	browser.notifications.create('notification', {
		type: 'basic',
		title: message.hosts[0].host,
		message: message.description,
		iconUrl: 'images/logo.png',
		buttons: [{
			title: 'View in Zabbix'
		}]
	}, function() {
			setTimeout(function() { browser.notifications.clear('notification', function() {}); }, 5000);
	});
}

function scheduleCheckServers() {
	console.log('Running scheduleCheckServers as scheduled');
	getTriggers();

	setTimeout(function(){ scheduleCheckServers(); },1000*interval);
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
				triggerTable.push({'system': system,
								'description': description,
								'priority': priority,
								'age': age,
								'triggerid': triggerid,
								'hostid': hostid})
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

// Activate messaging to popup.js
function handleMessage(request, sender, sendResponse) {
    switch (request.method) {
    case 'refreshTriggers':
		getActiveTriggersTable(function(results) {
            sendResponse(results);
        });
		break;
	case 'reinitalize':
		initalize();
	}
}
browser.runtime.onMessage.addListener(handleMessage);
