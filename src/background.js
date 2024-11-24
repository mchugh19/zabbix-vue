"use strict";

import Zabbix from "./lib/zabbix-promise.js";
import "./lib/crypt.io.js";

var browser = browser || chrome;

/*
browser.storage.session.set({ key: value }).then(() => {
    console.log("Value was set");
  });

  browser.storage.session.get(["key"]).then((result) => {
    console.log("Value currently is " + result.key);
  });
*/

/*
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'install') {
    return;
  }

  // Create initial alarm. Timing will be updated when saving options.
  console.log("Creating default 1 minute alarm");
  await chrome.alarms.create('default-alarm', {
    delayInMinutes: 1,
    periodInMinutes: 1
  });
});
*/

browser.runtime.onStartup.addListener(() => {
  initalize();
});

browser.alarms.onAlarm.addListener(() => {
  getAllTriggers();
});

async function initalize() {
  /*
   * Set settings from options screen
   * Called by options so also kickoff an initial Zabbix poll
   */
  console.log("Running initalize");
  let browser = browser || chrome;
  let settings = {};
  // eslint-disable-next-line
  cryptio.get("ZabbixServers", function (err, results) {
    if (err) {
      console.log("Problem fetching settings");
    }
    settings = results;

    // Set default pagination if doesn't yet exist
    if (settings && settings["servers"]) {
      for (var i = 0; i < settings["servers"].length; i++) {
        if (settings["servers"][i]["pagination"] == null) {
          settings["servers"][i]["pagination"] = {
            sortBy: "priority",
            descending: true,
          };
        }
      }
    }

    // Initalizie settings
    if (!settings || settings["global"] == null) {
      settings = {};
      settings.global = {};
    }

    // Set default notification if not set
    if (settings["global"]["notify"] == null) {
      settings["global"]["notify"] = true;
    }

    // Set default sound if not set
    if (settings["global"]["sound"] == null) {
      settings["global"]["sound"] = false;
    }

    // Set default display name if not set
    if (settings["global"]["displayName"] == null) {
      settings["global"]["displayName"] = "host";
    }
  });
  try {
    var interval = settings["global"]["interval"];
    if (interval) {
      console.log("Updating alarm to " + interval + " seconds");
      await browser.alarms.create("default-alarm", {
        delayInMinutes: interval / 60,
        periodInMinutes: interval / 60,
      });
    }
  } catch (err) {
    console.log("No previous polling interval set. Using default.");
  }

  console.log("Got settings: " + JSON.stringify(settings));
  await browser.storage.session.set({'ZabbixServers': settings });
  await getAllTriggers();
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
  minPriority,
  callback
) {
  /*
   * Return data from zabbix trigger.get call to a specifc server
   */
  let browser = browser || chrome;
  let popupTable = await browser.storage.session.get("popupTable");

  console.log("getServerTriggers for: " + JSON.stringify(server));
  delete popupTable["error"];
  delete popupTable["errorMessage"];
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

  const zabbix = new Zabbix(
    server + "/api_jsonrpc.php",
    user,
    pass,
    apiToken,
    version
  );
  if (groups.length > 0) {
    requestObject.groupids = groups;
  }

  zabbix
    .login()
    .then(() => {
      let result = zabbix.call("trigger.get", requestObject);
      return result;
    })
    .then((value) => {
      callback(value["result"]);
    })
    .catch(function () {
      let errorMessage = "Error communicating with: " + server.toString();
      console.log(errorMessage);
      //Show error on popup
      //popupTable["servers"] = [];
      popupTable["error"] = true;
      popupTable["errorMessage"] = errorMessage;
      //Set browser icon to config error state
      browser.action.setBadgeText({ text: "" });
      browser.action.setIcon({ path: "images/unconfigured.png" });
    })
    .finally(function () {
      zabbix.logout();
    });
}

async function getAllTriggers() {
  /*
   * Loop over each server found in settings
   *   Get trigger results
   * 	Get diff of new results from previous and send browser notifications
   * Update browser badge color and count
   * Call setActiveTriggersTable function to update popup dataset
   */
  let browser = browser || chrome;
  var triggerCount = 0;
  let settings = browser.storage.session.get("ZabbixServers");
  if (
    !settings ||
    settings.length === 0 ||
    !settings["servers"] ||
    settings["servers"].length == 0
  ) {
    console.log("No servers defined.");
  } else {
    let triggerResults = browser.storage.session.get("triggerResults");
    let serversChecked = [];
    var i = 0;
    // eslint-disable-next-line
    async function nextCheck() {
      if (i < settings["servers"].length) {
        let server = settings["servers"][i].alias;
        let serverURL = settings["servers"][i].url;
        let user = settings["servers"][i].user;
        let pass = settings["servers"][i].pass;
        let version = settings["servers"][i].version;
        let apiToken = settings["servers"][i].apiToken;
        let groups = settings["servers"][i].hostGroups;
        let hideAck = settings["servers"][i].hide;
        let hideMaintenance = settings["servers"][i].maintenance;
        let minPriority = settings["servers"][i].minSeverity;
        serversChecked.push(server);
        console.log("Found server: " + server);
        await getServerTriggers(
          serverURL,
          user,
          pass,
          apiToken,
          version,
          groups,
          hideAck,
          hideMaintenance,
          minPriority,
          function (results) {
            // Find triggerid values that are in new results but not in previous
            let oldTriggers = triggerResults[server] || [];
            let triggerDiff = results.filter(function (obj) {
              return !oldTriggers.some(function (obj2) {
                return obj.triggerid == obj2.triggerid;
              });
            });

            if (settings["global"]["notify"]) {
              // Notify popup for new triggers
              for (let trig of triggerDiff) {
                sendNotify(trig);
              }
            }

            if (triggerDiff && triggerDiff.length) {
              if (settings["global"]["sound"]) {
                //console.log('Playing audio for new triggers: ' + triggerDiff.toString());
                var myAudio = new Audio(
                  chrome.runtime.getURL("sounds/drip.mp3")
                );
                myAudio.play();
              }
            }

            // Record new trigger list
            triggerResults[server] = results;

            //console.log('triggerResults for server: ' + JSON.stringify(triggerResults[server]));
            triggerCount += triggerResults[server].length;
            nextCheck();
          }
        );
      } else {
        // all server checks now complete

        // Remove trigger.get data for old servers
        for (var trigServer in triggerResults) {
          if (!serversChecked.includes(trigServer)) {
            console.log("Removing old results for: " + trigServer);
            delete triggerResults[trigServer];
          }
        }

        // save triggerResults
        browser.storage.session.set({"triggerResults": triggerResults});

        if (triggerCount > 0) {
          // Set bage for the number of active triggers
          browser.action.setBadgeBackgroundColor({ color: "#888888" });
          browser.action.setBadgeText({ text: triggerCount.toString() });
        } else {
          // Clear badge as there are no active triggers
          browser.action.setBadgeText({ text: "" });
        }
        await setActiveTriggersTable();
      }
      // Increment at the end to emulate a for loop
      i++;
    }
    await nextCheck();
  }
}

function sendNotify(message) {
  /*
   * Create a browser notification popup
   */
  let browser = browser || chrome;
  let settings = browser.storage.session.get("ZabbixServers");
  browser.notifications.create(
    "notification",
    {
      type: "basic",
      title: message.hosts[0][settings.global.displayName],
      message: message.description,
      iconUrl: "images/sev_" + message.priority + ".png",
    },
    function () {
      setTimeout(function () {
        browser.notifications.clear("notification", function () {});
      }, 5000);
    }
  );
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
  let browser = browser || chrome;
  //console.log('Setting icon for priority: ' + severity.toString());
  browser.action.setIcon({ path: "images/sev_" + severity + ".png" });
}

async function setActiveTriggersTable(triggerResults) {
  /*
   * Generate object for display in popup window
   */
  let browser = browser || chrome;
  let settings = browser.storage.session.get("ZabbixServers");
  let topSeverity = -1;
  let popupHeaders = [
    { text: browser.i18n.getMessage("headerSystem"), value: "system" },
    {
      text: browser.i18n.getMessage("headerDescription"),
      value: "description",
    },
    { text: browser.i18n.getMessage("headerPriority"), value: "priority" },
    { text: browser.i18n.getMessage("headerAge"), value: "age" },
  ];

  //console.log('getActiveTriggersTable activated. Current triggerResults: ' + JSON.stringify(triggerResults))
  if (
    Object.keys(triggerResults).length === 0 &&
    triggerResults.constructor === Object
  ) {
    console.log("No current triggers or servers");
  } else {
    let popupTable = {};
    popupTable["servers"] = [];
    popupTable["headers"] = popupHeaders;
    popupTable["loaded"] = false;
    let servers = Object.keys(triggerResults);
    for (var i = 0; i < servers.length; i++) {
      // Iterate over each configured server, generate trigger list

      let serverObject = {};
      let triggerTable = [];
      let server = servers[i];

      // Iterate over found triggers and format for popup
      console.log(
        "Generating trigger table for server: " + JSON.stringify(server)
      );
      for (var t = 0; t < triggerResults[server].length; t++) {
        let system =
          triggerResults[server][t]["hosts"][0][settings.global.displayName];
        let description = triggerResults[server][t]["description"];
        let priority = triggerResults[server][t]["priority"];
        // Set priority number if higher than current
        // Used to set browser icon
        if (priority > topSeverity) {
          topSeverity = priority;
        }
        let age = triggerResults[server][t]["lastchange"];
        let triggerid = triggerResults[server][t]["triggerid"];
        let hostid = triggerResults[server][t]["hosts"][0]["hostid"];
        let eventid = triggerResults[server][t]["lastEvent"]["eventid"];
        let acknowledged = Number(
          triggerResults[server][t]["lastEvent"]["acknowledged"]
        );
        let maintenance = Number(
          triggerResults[server][t]["hosts"][0]["maintenance_status"]
        );
        triggerTable.push({
          system: system,
          description: description,
          priority: priority,
          age: age,
          triggerid: triggerid,
          hostid: hostid,
          eventid: eventid,
          acknowledged: acknowledged,
          maintenance_status: maintenance,
        });
      }
      //console.log('TriggerTable: ' + JSON.stringify(triggerTable));
      serverObject["triggers"] = triggerTable;

      serverObject["server"] = server;
      // Add search string for server
      serverObject["search"] = "";
      // Lookup zabbix url from settings
      let url = "";
      let version = "";
      let pagination = {};
      for (var x = 0; x < settings["servers"].length; x++) {
        if (settings["servers"][x]["alias"] === server) {
          url = settings["servers"][x]["url"];
          version = settings["servers"][x]["version"];
          pagination = settings["servers"][i]["pagination"];
        }
      }
      serverObject["url"] = url;
      serverObject["version"] = version;
      serverObject["pagination"] = pagination;
      //console.log('serverObject is: ' + JSON.stringify(serverObject));
      popupTable["servers"].push(serverObject);
    }
    await browser.storage.session.set({"popupTable": popupTable})
    //console.log('Complete table: ' + JSON.stringify(popupTable));
    setBrowserIcon(topSeverity);
  }
}

// Activate messaging to popup.js and options.js
async function handleMessage(request, sender, sendResponse) {
  switch (request.method) {
    case "refreshTriggers":
      // Sent by popup to request data for display
      sendResponse(await browser.storage.session.get("popupTable"));
      break;
    case "reinitalize":
      // Sent by options to alert to config changes in order to refresh
      initalize();
      break;
    case "submitPagination": {
      // Message sent by popup to save header sorting
      var updated = false;
      var browser = browser || chrome;
      let settings = browser.storage.session.get("ZabbixServers");
      if (
        settings["servers"][request.index]["pagination"].sortBy !=
        request.sortBy
      ) {
        settings["servers"][request.index]["pagination"].sortBy =
          request.sortBy;
        updated = true;
      }
      if (
        settings["servers"][request.index]["pagination"].descending !=
        request.descending
      ) {
        settings["servers"][request.index]["pagination"].descending =
          request.descending;
        updated = true;
      }
      if (updated) {
        // eslint-disable-next-line
        cryptio.set("ZabbixServers", settings, function (err, results) {
          if (err) throw err;
        });
      }
      break;
    }
  }
  return true;
}
browser.runtime.onMessage.addListener(handleMessage);
