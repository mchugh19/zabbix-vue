"use strict";

import { Zabbix } from './lib/zabbix-promise.js';
import { encryptSettingKeys, decryptSettings, isLegacyFormat } from './lib/crypto.js'

const icon = (name) => `images/${name}.png`
const ZABBIX_SERVERS_KEY = "ZabbixServers";
const DEBUG = false;
const log = (...args) => DEBUG && console.log(...args);

// Zabbix severity levels - replaces magic numbers 0-5
const SEVERITY = Object.freeze({
  NOT_CLASSIFIED: 0,
  INFORMATION: 1,
  WARNING: 2,
  AVERAGE: 3,
  HIGH: 4,
  DISASTER: 5,
  NONE: -1, // Used for "no triggers" state
});

browser.runtime.onMessage.addListener(handleMessage);
const handleAlarm = (alarm) => {
  if (alarm?.name === 'default-alarm') {
    initialize();
  }
};

// Guarantee single registration (safe across MV3 restarts / HMR)
browser.alarms.onAlarm.removeListener(handleAlarm);
browser.alarms.onAlarm.addListener(handleAlarm);


browser.runtime.onInstalled.addListener( async () => {
  log(`onInstalled()`);

  await migrateOldSettings();
  await migrateCryptoFormat();
  await initialize();
});
browser.runtime.onStartup.addListener( async () => {
  log(`onStartup()`);

  await migrateCryptoFormat();
  await initialize();
});
self.addEventListener("activate", (event) => {
  log("activated for " + JSON.stringify(event))

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
  let settings = await getSettings();
  if (settings) {
    if (Object.keys(settings).includes('iv')) {
      log("Found previous encrypted settings. Migrating")
      settings = await decryptSettings(JSON.stringify(settings))
      settings = await encryptSettingKeys(JSON.parse(settings));
      await browser.storage.local.set({"ZabbixServers": JSON.stringify(settings)});
      log("Migration complete")
    } else {
      //log("no IV keys " + JSON.stringify(settings))
    }
  } else {
    //log("no ZabbixServer keys")
  }
}

async function migrateCryptoFormat() {
  /*
  * Detect legacy sjcl-encrypted fields (apiToken, pass) and re-encrypt
  * with Web Crypto API. Runs on startup so users don't need to manually
  * open settings to trigger the migration.
  */
  const settings = await getSettings();
  if (!settings || !settings.servers) {
    return;
  }

  let needsSave = false;
  for (const server of settings.servers) {
    if (isLegacyFormat(server.apiToken)) {
      server.apiToken = await decryptSettings(server.apiToken);
      needsSave = true;
    }
    if (isLegacyFormat(server.pass)) {
      server.pass = await decryptSettings(server.pass);
      needsSave = true;
    }
  }

  if (needsSave) {
    log("Migrating crypto format from sjcl to Web Crypto API");
    const encrypted = await encryptSettingKeys(settings);
    await browser.storage.local.set({[ZABBIX_SERVERS_KEY]: JSON.stringify(encrypted)});
    log("Crypto format migration complete");
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


async function initialize() {
  /*
   * Set Zabbix poll alarm, listeners, and activate polling
   */
  // Prevent concurrent runs if alarm fires while previous poll is still active
  if (self.__zabbixPolling) return;
  self.__zabbixPolling = true;
  try {
  const settings = await getSettings();
  if (settings) {
    // settings have been configured
    try {
      const interval = settings["global"]["interval"];
      if (interval) {
        log("Updating alarm to " + interval + " seconds");
        await setAlarmState(interval);
      }
    } catch (_) { // eslint-disable-line no-unused-vars
      await setAlarmState(60);
      log("No previous polling interval set. Using default.");
    }
    await getAllTriggers();
  }
  } finally {
    self.__zabbixPolling = false;
  }
}

async function clearPopupTableError() {
  /*
   * Clear any stale error state from the popup table in session storage
   */
  let popupTable = await browser.storage.session.get("popupTable");
  popupTable = popupTable["popupTable"]
  if (popupTable && "error" in popupTable) {
    log("Error found in popupTable. Clearing and refreshing triggers");
    delete popupTable["error"];
    delete popupTable["errorMessage"];
    delete popupTable["errorDetails"];
    await browser.storage.session.set({"popupTable": popupTable});
  }
}

function buildTriggerRequest(serverConfig) {
  /*
   * Build the trigger.get request object from server configuration
   */
  const { hostGroups, hide, maintenance, minSeverity } = serverConfig;

  const request = {
    expandDescription: 1,
    skipDependent: 1,
    selectHosts: ["host", "name", "hostid", "maintenance_status"],
    selectLastEvent: ["eventid", "acknowledged", "severity"],
    monitored: 1,
    min_severity: minSeverity,
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

  if (hide) {
    // Don't show acknowledged
    request.withLastEventUnacknowledged = 1;
  }
  if (maintenance) {
    request.maintenance = false;
  }
  if (hostGroups.length > 0) {
    request.groupids = hostGroups;
  }

  return request;
}

function getEffectiveSeverity(trigger) {
  /*
   * Return the trigger's current severity, preferring the last event's
   * severity (reflects manual changes in Zabbix) over the trigger's
   * configured priority. Falls back to trigger priority when event
   * severity is unavailable (older Zabbix versions).
   */
  const eventSeverity = trigger["lastEvent"] && trigger["lastEvent"]["severity"];
  return eventSeverity !== undefined && eventSeverity !== null
    ? Number(eventSeverity)
    : trigger["priority"];
}

function makeVersionPersister(serverURL) {
  /*
   * Return a callback that persists an auto-detected Zabbix version
   */
  return async function(newVersion) {
    try {
      const settings = await getSettings();
      if (settings && settings.servers) {
        for (const srv of settings.servers) {
          if (srv.url === serverURL) {
            console.log("Updating stored version for " + serverURL + " to " + newVersion);
            srv.version = newVersion;
          }
        }
        await browser.storage.local.set({[ZABBIX_SERVERS_KEY]: JSON.stringify(settings)});
      }
    } catch (e) {
      console.log("Failed to persist auto-detected version: " + e.message);
    }
  };
}

async function getServerTriggers(serverConfig) {
  /*
   * Return data from zabbix trigger.get call to a specific server
   *
   * serverConfig: { url, user, pass, apiToken, version, hostGroups,
   *                 hide, maintenance, minSeverity }
   */
  await clearPopupTableError();

  const { url, user, pass, apiToken, version } = serverConfig;
  const requestObject = buildTriggerRequest(serverConfig);

  const zabbix = new Zabbix(
    url + "/api_jsonrpc.php",
    user,
    pass,
    apiToken,
    version,
    makeVersionPersister(url)
  );

  let triggerResults = {};
  try {
    await zabbix.login();
    let result = await zabbix.call("trigger.get", requestObject);

    if ("result" in result) {
      triggerResults = result["result"];
    } else {
      let errorMessage = "Error communicating with: " + url.toString();
      log(errorMessage);
      let details = result.error.message + " " + result.error.data;
      log(details);
      triggerResults = {
        "error": true,
        "errorMessage": errorMessage,
        "errorDetails": details,
      };
    }
  } catch (err) {
    let errorMessage = "Error communicating with: " + url.toString();
    console.error(errorMessage, err);
    log(err.message);

    triggerResults = {
      "error": true,
      "errorMessage": errorMessage,
      "errorDetails": err.message,
    };
  } finally {
    try {
      await zabbix.logout();
    } catch (logoutErr) {
      log("Logout failed:", logoutErr.message);
    }
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
  let triggerCount = 0;
  let settings = await getSettings();
  if (
    !settings ||
    settings.length === 0 ||
    !settings["servers"] ||
    settings["servers"].length == 0
  ) {
    log("No servers defined for trigger processing");
    return null;
  }

  let triggerResults = await browser.storage.local.get("triggerResults");
  triggerResults = triggerResults["triggerResults"]
  if (!triggerResults) {
    triggerResults = {}
  }
  
  let serversChecked = [];
  for (const serverSettings of settings["servers"]) {
    let serverError = false;
    const server = serverSettings.alias;
    serversChecked.push(server);

    // Decrypt credentials and build config object for getServerTriggers
    const serverConfig = {
      url: serverSettings.url,
      user: serverSettings.user,
      pass: await decryptSettings(serverSettings.pass),
      apiToken: await decryptSettings(serverSettings.apiToken),
      version: serverSettings.version,
      hostGroups: serverSettings.hostGroups,
      hide: serverSettings.hide,
      maintenance: serverSettings.maintenance,
      minSeverity: serverSettings.minSeverity,
    };

    const newTriggerData = await getServerTriggers(serverConfig);

    // Zero out credentials from config immediately after use
    serverConfig.pass = null;
    serverConfig.apiToken = null;
    serverConfig.user = null;

    if ("error" in newTriggerData) {
      serverError = true;
    } else {
      // Find triggers that are new since last poll
      const oldTriggers = triggerResults[server] || [];
      const triggerDiff = newTriggerData.filter((trigger) =>
        !oldTriggers.some((old) => trigger.triggerid == old.triggerid)
      );

      if (settings["global"]["notify"]) {
        if (triggerDiff.length === 1) {
          await sendNotify(triggerDiff[0], settings.global.displayName);
        } else if (triggerDiff.length > 1) {
          await sendBatchNotify(triggerDiff, server, settings.global.displayName);
        }
      }
      if (triggerDiff.length) {
        playSounds(settings);
      }
    }

    triggerResults[server] = newTriggerData;
    if (!serverError) {
      triggerCount += triggerResults[server].length;
    }
  }

  // Remove trigger.get data for old servers
  for (let trigServer in triggerResults) {
    if (!serversChecked.includes(trigServer)) {
      log("Removing old results for: " + trigServer);
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
  await browser.storage.local.set({"triggerResults": triggerResults});

  if (triggerCount > 0) {
    browser.action.setBadgeBackgroundColor({ color: "#888888" });
    browser.action.setBadgeText({ text: triggerCount.toString() });
  } else {
    browser.action.setBadgeText({ text: "" });
  }

  await setActiveTriggersTable(completeTriggerResults);
}

async function sendBatchNotify(messages, serverName, displayName) {
  /*
   * Create a single batched notification for multiple triggers
   */
  const count = messages.length;
  const highestSeverity = Math.max(...messages.map(m => getEffectiveSeverity(m)));
  
  if (__BROWSER__ === "firefox") { // eslint-disable-line no-undef
    await browser.notifications.create(
      "notification-batch",
      {
        type: "basic",
        title: `${count} new problems on ${serverName}`,
        message: `${messages.slice(0, 3).map(m => m.hosts[0][displayName]).join(', ')}${count > 3 ? '...' : ''}`,
        iconUrl: icon("sev_" + highestSeverity),
      }
    );
  } else {
    // MV3 chrome notification
    registration.showNotification( // eslint-disable-line no-undef
      `${count} new problems on ${serverName}`, 
      {
        body: `${messages.slice(0, 3).map(m => m.hosts[0][displayName]).join(', ')}${count > 3 ? '...' : ''}`,
        icon: icon("sev_" + highestSeverity),
      }
    )
  }
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
        iconUrl: icon("sev_" + getEffectiveSeverity(message)),
        
      }
    );
  } else {
    // MV3 chrome notification
    registration.showNotification( // eslint-disable-line no-undef
      message.hosts[0][displayName], 
      {
        body: message.description,
        icon: icon("sev_" + getEffectiveSeverity(message)),
      }
    )
  }
}

function playSounds(settings) {
  if (settings["global"]["sound"]) {
    if (__BROWSER__ === "firefox") { // eslint-disable-line no-undef
      // mv2 firefox & older chrome sound support         
      const myAudio = new Audio(
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

async function setBrowserIcon(severity) {
  /*
   * unconfigured
   * -1 no problems
   * 0 not classified
   * 1 information
   * 2 warning
   * 3 average
   * 4 high
   * 5 disaster
   */
  //log('Setting icon for priority: ' + severity);
  await browser.action.setIcon({ path: icon(severity)});
}

async function setActiveTriggersTable(triggerResults) {
  /*
   * Generate object for display in popup window
   */

  //log('getActiveTriggersTable activated. Current triggerResults: ' + JSON.stringify(triggerResults))
  if (!triggerResults) {
    const stored = await browser.storage.local.get('triggerResults');
    triggerResults = stored.triggerResults || {};
  }
  const settings = await getSettings();
  let hasError = false;

  if (
    Object.keys(triggerResults).length === 0 &&
    triggerResults.constructor === Object
  ) {
    log("No current triggers or servers");
    return null;
  }

  let topSeverity = SEVERITY.NONE;
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
      log("Error found in triggerResults for server: " + server);
      hasError = true;
      serverObject["error"] = triggerResults[server]["error"];
      serverObject["errorMessage"] = triggerResults[server]["errorMessage"];
      serverObject["errorDetails"] = triggerResults[server]["errorDetails"];
    } else {
      // Iterate over found triggers and format for popup
      log(
        "Generating trigger table for server: " + server
      );
      for (var t = 0; t < triggerResults[server].length; t++) {
        const priority = getEffectiveSeverity(triggerResults[server][t]);
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

  if (hasError) {
    await setBrowserIcon("unconfigured");
  } else {
    await setBrowserIcon("sev_" + topSeverity);
  }
}

// Activate messaging to popup.js and options.js
// eslint-disable-next-line no-unused-vars
async function handleMessage(request, sender, sendResponse) {
  switch (request.method) {
    case "reinitialize": {
      log("Background triggered reinialize")
      // Sent by options to alert to config changes in order to refresh
      await initialize();
      break;
    }
    case "submitPagination": {
      // Message sent by popup to save header sorting
      const settings = await getSettings();
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

// Exports for testing — these don't affect extension runtime behavior
export {
  getSettings,
  migrateOldSettings,
  migrateCryptoFormat,
  setAlarmState,
  initialize,
  clearPopupTableError,
  buildTriggerRequest,
  makeVersionPersister,
  getEffectiveSeverity,
  getServerTriggers,
  getAllTriggers,
  sendNotify,
  playSounds,
  setBrowserIcon,
  setActiveTriggersTable,
  handleMessage,
  ZABBIX_SERVERS_KEY,
};
