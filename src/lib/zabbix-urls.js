/**
 * Pure helpers for building Zabbix frontend deep links.
 * Kept outside the Vue components so the version-dependent URL
 * logic is unit-testable.
 */

/**
 * Parse a major or minor version segment as a number for safe comparison.
 * Avoids string comparison bugs where "10" < "7".
 */
export function versionPart(version, index) {
  return parseInt(version.split(".")[index], 10) || 0;
}

/**
 * Build the "acknowledge event" popup URL for a Zabbix server version.
 *
 * The popup controller's expected parameter changed across Zabbix releases:
 *  - 5.x through 7.2 require `popup_action=acknowledge.edit`
 *    (verified against Zabbix 7.0 source: CControllerPopup::checkInput
 *    requires `popup_action`; sending `popup=` fails validation)
 *  - 7.4+ requires `popup=acknowledge.edit`
 *    (verified against Zabbix 7.4 source)
 *
 * @param {string} url - Zabbix frontend base URL
 * @param {string} version - server version, e.g. "7.0.19"
 * @param {string|number} eventid - event to acknowledge
 * @return {string} full URL to open
 */
export function ackEventUrl(url, version, eventid) {
  const encoded = "eventids%5B%5D=" + eventid;
  if (
    versionPart(version, 0) > 7 ||
    (versionPart(version, 0) === 7 && versionPart(version, 1) >= 4)
  ) {
    return url + "/zabbix.php?action=popup&popup=acknowledge.edit&" + encoded;
  } else if (versionPart(version, 0) >= 5) {
    return (
      url +
      "/zabbix.php?action=popup&popup_action=acknowledge.edit&" +
      encoded
    );
  }
  return url + "/zabbix.php?action=acknowledge.edit&eventids[]=" + eventid;
}
