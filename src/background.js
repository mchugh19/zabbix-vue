"use strict";

/* global cryptio:readonly */

import Zabbix from "./lib/zabbix-promise.js";
import "./lib/crypt.io.js";
import png_sev_1 from "./images/sev_-1.svg";  // eslint-disable-line no-unused-vars
import png_sev0 from "./images/sev_0.svg";    // eslint-disable-line no-unused-vars
import png_sev1 from "./images/sev_1.svg";    // eslint-disable-line no-unused-vars
import png_sev2 from "./images/sev_2.svg";    // eslint-disable-line no-unused-vars
import png_sev3 from "./images/sev_3.svg";    // eslint-disable-line no-unused-vars
import png_sev4 from "./images/sev_4.svg";    // eslint-disable-line no-unused-vars
import png_sev5 from "./images/sev_5.svg";    // eslint-disable-line no-unused-vars
import png_logo from "./images/logo.svg";     // eslint-disable-line no-unused-vars
import png_unconfigured from "./images/unconfigured.svg"; // eslint-disable-line no-unused-vars

const DEF_INTERVAL = 60;
var browser = browser || chrome;
var settings = null;
var interval = 60;
var triggerResults = {};
var popupTable = {};

function initalize() {
  /*
   * Set settings from options screen
   * Called by options so also kickoff an initial Zabbix poll
   */
  cryptio.get("ZabbixServers", function (err, results) {
    if (err) {
      settings = {};
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
    interval = settings["global"]["interval"];
    if (!interval) {
      interval = DEF_INTERVAL;
    }
  } catch (err) {
    interval = DEF_INTERVAL;
  }
  //console.log("Got settings: " + JSON.stringify(settings));
  getAllTriggers();
}

function scheduleCheckServers() {
  /*
   * Loop and schedule updates based on server check interval from options
   */
  getAllTriggers();

  setTimeout(function () {
    scheduleCheckServers();
  }, 1000 * interval);
}

function getServerTriggers(
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
  //console.log("getServerTriggers for: " + JSON.stringify(server));
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

  const zabbix = new Zabbix(server + "/api_jsonrpc.php", user, pass, apiToken, version);
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
      browser.browserAction.setBadgeText({ text: "" });
      browser.browserAction.setIcon({ path: "images/unconfigured.png" });
    })
    .finally(function () {
      zabbix.logout();
    });
}

function getAllTriggers() {
  /*
   * Loop over each server found in settings
   *   Get trigger results
   * 	Get diff of new results from previous and send browser notifications
   * Update browser badge color and count
   * Call setActiveTriggersTable function to update popup dataset
   */
  var triggerCount = 0;
  if (
    !settings ||
    settings.length === 0 ||
    !settings["servers"] ||
    settings["servers"].length == 0
  ) {
    triggerResults = {};
    console.log("No servers defined.");
  } else {
    let serversChecked = [];
    var i = 0;
    function nextCheck() {
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
        getServerTriggers(
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

        if (triggerCount > 0) {
          // Set bage for the number of active triggers
          browser.browserAction.setBadgeBackgroundColor({ color: "#888888" });
          browser.browserAction.setBadgeText({ text: triggerCount.toString() });
        } else {
          // Clear badge as there are no active triggers
          browser.browserAction.setBadgeText({ text: "" });
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
  //console.log('Setting icon for priority: ' + severity.toString());
  browser.browserAction.setIcon({ path: "images/sev_" + severity + ".png" });
}

function setActiveTriggersTable() {
  /*
   * Generate object for display in popup window
   */
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
    //console.log('Complete table: ' + JSON.stringify(popupTable));
    setBrowserIcon(topSeverity);
  }
}

function getActiveTriggersTable(callback) {
  callback(popupTable);
}

// Run our script as soon as the document's DOM is ready.
document.addEventListener("DOMContentLoaded", function () {
  console.log("Page loaded. Scheduling checks");
  initalize();
  scheduleCheckServers();
});

// Activate messaging to popup.js and options.js
function handleMessage(request, sender, sendResponse) {
  switch (request.method) {
    case "refreshTriggers":
      // Sent by popup to request data for display
      getActiveTriggersTable(function (results) {
        sendResponse(results);
      });
      break;
    case "reinitalize":
      // Sent by options to alert to config changes in order to refresh
      initalize();
      break;
    case "submitPagination":
      // Message sent by popup to save header sorting
      var updated = false;
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
        cryptio.set("ZabbixServers", settings, function (err) {
          if (err) throw err;
        });
      }
      break;
  }
  return true;
}
browser.runtime.onMessage.addListener(handleMessage);
