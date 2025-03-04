"use strict";

import { Zabbix } from './lib/zabbix-promise.js';
import browser from "webextension-polyfill";
import { manifest } from 'virtual:render-svg'
import { encryptSettingKeys, decryptSettings } from './lib/crypto.js'

const ZABBIX_SERVERS_KEY = "ZabbixServers";

browser.runtime.onMessage.addListener(handleMessage);
browser.alarms.onAlarm.addListener(initalize);


browser.runtime.onInstalled.addListener( async () => {
  console.log(`onInstalled()`);

  await migrateOldSettings();
  await initalize();
});
browser.runtime.onStartup.addListener( async () => {
  console.log(`onStartup()`);

  await initalize();
});
self.addEventListener("activate", (event) => {
  console.log("activated for " + JSON.stringify(event))

  setAlarmState(60).then();
});

async function getSettings() {
  const settings = await browser.storage.local.get(ZABBIX_SERVERS_KEY);
  return settings[ZABBIX_SERVERS_KEY] ? JSON.parse(settings[ZABBIX_SERVERS_KEY]) : null;
}

async function migrateOldSettings() {
  /*
  * Up to version 2 of extension encrypted all data. Only pass and key are sensitive data
  * Converts old all encrypted format to only encrypt those two fields
  */
  var settings = await getSettings();
  if (settings) {
    if (Object.keys(settings).includes('iv')) {
      console.log("Found previous encrypted settings. Migrating")
      settings = decryptSettings(JSON.stringify(settings))
      settings = encryptSettingKeys(JSON.parse(settings));
      await browser.storage.local.set({"ZabbixServers": JSON.stringify(settings)});
      console.log("Migration complete")
    } else {
      //console.log("no IV keys " + JSON.stringify(settings))
    }
  } else {
    //console.log("no ZabbixServer keys")
  }
}


async function setAlarmState(interval) {
  const alarmName = "default-alarm";
  const alarm = await browser.alarms.get(alarmName);

  if (!alarm) {
    await browser.alarms.create(alarmName, {
      delayInMinutes: interval / 60,
      periodInMinutes: interval / 60,
    });
  }
}


async function initalize() {
  /*
   * Set Zabbix poll alarm, listeners, and activate polling
   */
  const settings = await getSettings();
  if (settings) {
    // settings have been configured
    try {
      var interval = settings["global"]["interval"];
      if (interval) {
        console.log("Updating alarm to " + interval + " seconds");
        await setAlarmState(interval);
      }
    } catch (_) { // eslint-disable-line no-unused-vars
      await setAlarmState(60);
      console.log("No previous polling interval set. Using default.");
    }
    await getAllTriggers();
  }
}

async function getServerTriggers(
  server,
  user,
  pass,
  apiToken,
  version,
  groups,
  hideAck,
  hideMaintenance,
  minPriority
) {
  /*
   * Return data from zabbix trigger.get call to a specifc server
   */
  let popupTable = await browser.storage.session.get("popupTable");
  popupTable = popupTable["popupTable"]
  if (popupTable && "error" in popupTable) {
    console.log("Error found in popupTable. Clearning and refreshing triggers");
    delete popupTable["error"];
    delete popupTable["errorMessage"];
    await browser.storage.session.set({"popupTable": popupTable});
  }

  //console.log("getServerTriggers for: " + JSON.stringify(server))
  let requestObject = {
    expandDescription: 1,
    skipDependent: 1,
    selectHosts: ["host", "name", "hostid", "maintenance_status"],
    selectLastEvent: ["eventid", "acknowledged"],
    monitored: 1,
    min_severity: minPriority,
    active: 1,
    filter: {
      // Value: 0 = OK | 1 = PROBLEM | 2 = UNKNOWN
      value: 1,
      status: 0,
    },
    output: ["triggerid", "description", "priority", "lastchange"],
    sortfield: "priority",
    sortorder: "DESC",
  };

  if (hideAck) {
    // Don't show acknowledged
    requestObject.withLastEventUnacknowledged = 1;
  }
  if (hideMaintenance) {
    requestObject.maintenance = false;
  }
  if (groups.length > 0) {
    requestObject.groupids = groups;
  }

  const zabbix = new Zabbix(
    server + "/api_jsonrpc.php",
    user,
    pass,
    apiToken,
    version
  );
  let triggerResults = {};
  try {
    await zabbix.login();
    let result = await zabbix.call("trigger.get", requestObject);
    triggerResults = result["result"];
    zabbix.logout();
  } catch (err) { // eslint-disable-line no-unused-vars
    let errorMessage = "Error communicating with: " + server.toString();
    console.log(errorMessage);
    console.log(err.message);

    triggerResults = {
      "error": true,
      "errorMessage": errorMessage
    };
  }

  return triggerResults;
}

async function getAllTriggers() {
  /*
   * Loop over each server found in settings
   *   Get trigger results
   * 	Get diff of new results from previous and send browser notifications
   * Update browser badge color and count
   * Call setActiveTriggersTable function to update popup dataset
   */
  var triggerCount = 0;
  let settings = await getSettings();
  if (
    !settings ||
    settings.length === 0 ||
    !settings["servers"] ||
    settings["servers"].length == 0
  ) {
    console.log("No servers defined for trigger processing");
    return null;
  }

  let triggerResults = await browser.storage.local.get("triggerResults");
  triggerResults = triggerResults["triggerResults"]
  if (!triggerResults) {
    triggerResults = {}
  }
  //console.log("Current triggerResults: " + JSON.stringify(triggerResults));
  
  let serversChecked = [];
  for (var serverIndex in settings["servers"]) {
    var serverError = false;

    let server = settings["servers"][serverIndex].alias;
    let serverURL = settings["servers"][serverIndex].url;
    let user = settings["servers"][serverIndex].user;
    let pass = decryptSettings(settings["servers"][serverIndex].pass);
    let version = settings["servers"][serverIndex].version;
    let apiToken = decryptSettings(settings["servers"][serverIndex].apiToken);
    let groups = settings["servers"][serverIndex].hostGroups;
    let hideAck = settings["servers"][serverIndex].hide;
    let hideMaintenance = settings["servers"][serverIndex].maintenance;
    let minPriority = settings["servers"][serverIndex].minSeverity;
    serversChecked.push(server);
    //console.log("Found server: " + server);
    let newTriggerData = {};
    newTriggerData = await getServerTriggers(
      serverURL,
      user,
      pass,
      apiToken,
      version,
      groups,
      hideAck,
      hideMaintenance,
      minPriority
    );

    if ("error" in newTriggerData) {
      // Error state already set. Break out of function
      serverError = true;
    } else {
      // Check if new triggers are different from existing
      // Find triggerid values that are in new results but previous
      let oldTriggers = triggerResults[server] || [];
      let triggerDiff = newTriggerData.filter(function (obj) {
        return !oldTriggers.some(function (obj2) {
          return obj.triggerid == obj2.triggerid;
        });
      });
      if (settings["global"]["notify"]) {
        // Notify popup for new triggers
        for (let trig of triggerDiff) {
          await sendNotify(trig, settings.global.displayName);
        }
      }
      // Play sounds
      if (triggerDiff && triggerDiff.length) {
        playSounds(settings);
      }
    }
    // Record new trigger list
    triggerResults[server] = newTriggerData;
    //console.log('triggerResults for server '+ JSON.stringify(server)+ ": " + JSON.stringify(triggerResults[server]));
    if (!serverError) {
      // When not erroring, update trigger count
      triggerCount += triggerResults[server].length;
    }
  }

  // all server checks now complete

  // Remove trigger.get data for old servers
  for (let trigServer in triggerResults) {
    if (!serversChecked.includes(trigServer)) {
      console.log("Removing old results for: " + trigServer);
      delete triggerResults[trigServer];
    }
  }

  // Remove server errors from triggerResults and persist data
  const completeTriggerResults = structuredClone(triggerResults);
  for (let trigServer in triggerResults) {
    if (triggerResults[trigServer].error) {
      delete triggerResults[trigServer];
    }
  }
  browser.storage.local.set({"triggerResults": triggerResults});

  if (serverError) {
    // set badge to error state, but keep count
    browser.action.setIcon({ path: manifest["1"].unconfigured });
    browser.action.setBadgeText({ text: triggerCount.toString() });
  } else {
    // only update badge fully when healthy
    if (triggerCount > 0) {
      // Set bage for the number of active triggers
      browser.action.setBadgeBackgroundColor({ color: "#888888" });
      browser.action.setBadgeText({ text: triggerCount.toString() });
    } else {
      // Clear badge as there are no active triggers
      browser.action.setBadgeText({ text: "" });
    }
  }
  await setActiveTriggersTable(completeTriggerResults);
}

async function sendNotify(message, displayName) {
  /*
   * Create a browser notification popup
   */
  if (__BROWSER__ === "firefox") { // eslint-disable-line no-undef
    await browser.notifications.create(
      "notification",
      {
        type: "basic",
        title: message.hosts[0][displayName],
        message: message.description,
        iconUrl: manifest["1"]["sev_" + message.priority],
        
      }
    );
  } else {
    // MV3 chrome notification
    registration.showNotification( // eslint-disable-line no-undef
      message.hosts[0][displayName], 
      {
        body: message.description,
        icon: manifest["1"]["sev_" + message.priority],
      }
    )
  }
}

function playSounds(settings) {
  if (settings["global"]["sound"]) {
    if (__BROWSER__ === "firefox") { // eslint-disable-line no-undef
      // mv2 firefox & older chrome sound support         
      var myAudio = new Audio(
        browser.runtime.getURL("sounds/drip.mp3")
      );
      myAudio.play();
    } else {
      // MV3 chrome sound support
      browser.offscreen.createDocument({
        url: browser.runtime.getURL('./sounds/audio.html'),
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'notification',
      });
    }
  }
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
  browser.action.setIcon({ path: manifest["1"]["sev_" + severity]});
}

async function setActiveTriggersTable(triggerResults) {
  /*
   * Generate object for display in popup window
   */

  //console.log('getActiveTriggersTable activated. Current triggerResults: ' + JSON.stringify(triggerResults))
  const settings = await getSettings();
  let hasError = false;

  if (
    Object.keys(triggerResults).length === 0 &&
    triggerResults.constructor === Object
  ) {
    console.log("No current triggers or servers");
    return null;
  }

  let topSeverity = -1;
  const popupHeaders = [
    { title: browser.i18n.getMessage("headerSystem"),
      sortable: true,
      value: "system" },
    {
      title: browser.i18n.getMessage("headerDescription"),
      sortable: true,
      value: "description",
    },
    { title: browser.i18n.getMessage("headerPriority"),
      sortable: true,
      value: "priority" },
    { title: browser.i18n.getMessage("headerAge"),
      sortable: true,
      value: "age" },
  ];

  let popupTable = {
    "servers": [],
    "headers": popupHeaders,
    "loaded": false,
  };
  let servers = Object.keys(triggerResults);
  for (var i = 0; i < servers.length; i++) {
    // Iterate over each configured server, generate trigger list
    let triggerTable = [];
    let server = servers[i];
    let serverObject = {
      "server": server,
      "search": "",
      "expanded": [],
    };

    if (
      Object.hasOwn(triggerResults[server], 'error')
    ) {
      console.log("Error found in triggerResults for server: " + server);
      hasError = true;
      serverObject["error"] = triggerResults[server]["error"];
      serverObject["errorMessage"] = triggerResults[server]["errorMessage"];
    } else {
      // Iterate over found triggers and format for popup
      console.log(
        "Generating trigger table for server: " + server
      );
      for (var t = 0; t < triggerResults[server].length; t++) {
        let priority = triggerResults[server][t]["priority"];
        // Set priority number if higher than current
        // Used to set browser icon
        if (priority > topSeverity) {
          topSeverity = priority;
        }
        triggerTable.push({
          system: triggerResults[server][t]["hosts"][0][settings.global.displayName],
          description: triggerResults[server][t]["description"],
          priority: priority,
          age: triggerResults[server][t]["lastchange"],
          triggerid: triggerResults[server][t]["triggerid"],
          hostid: triggerResults[server][t]["hosts"][0]["hostid"],
          eventid: triggerResults[server][t]["lastEvent"]["eventid"],
          acknowledged: Number(triggerResults[server][t]["lastEvent"]["acknowledged"]),
          maintenance_status: Number(triggerResults[server][t]["hosts"][0]["maintenance_status"]),
        });
      }
      serverObject["triggers"] = triggerTable;
  
      // Lookup zabbix url from settings
      for (var x = 0; x < settings["servers"].length; x++) {
        if (settings["servers"][x]["alias"] === server) {
          serverObject["url"] = settings["servers"][x]["url"];
          serverObject["version"] = settings["servers"][x]["version"];
          serverObject["sortBy"] = settings["servers"][i]["sortBy"];
        }
      }
    }

    popupTable["servers"].push(serverObject);
  }

  await browser.storage.session.set({"popupTable": popupTable})

  if (!hasError) {
    setBrowserIcon(topSeverity);
  }
}

// Activate messaging to popup.js and options.js
// eslint-disable-next-line no-unused-vars
async function handleMessage(request, sender, sendResponse) {
  switch (request.method) {
    case "reinitalize": {
      console.log("Background triggered reinialize")
      // Sent by options to alert to config changes in order to refresh
      await initalize();
      break;
    }
    case "submitPagination": {
      // Message sent by popup to save header sorting
      var settings = await getSettings();
      const newSort = [{
        "key": request.sortBy,
        "order": request.descending
      }]
      settings.servers[request.index]["sortBy"] = newSort;

      await browser.storage.local.set({"ZabbixServers": JSON.stringify(settings)});
      await setActiveTriggersTable();
      break;
    }
  }
  return true;
}
