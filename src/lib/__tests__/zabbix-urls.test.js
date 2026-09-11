import { describe, it, expect } from 'vitest';
import { ackEventUrl, versionPart } from '../zabbix-urls.js';

const BASE = 'https://zabbix.example.com';
const EVENTID = '6379027563';

describe('ackEventUrl', () => {
  it('uses popup= on Zabbix 7.4 and later', () => {
    for (const v of ['7.4.0', '7.4.1', '8.0.0']) {
      expect(ackEventUrl(BASE, v, EVENTID)).toBe(
        BASE + '/zabbix.php?action=popup&popup=acknowledge.edit&eventids%5B%5D=' + EVENTID
      );
    }
  });

  it('uses popup_action= on Zabbix 5.x through 7.2', () => {
    // 7.0.19 is the exact version from the issue #22 report where
    // ACK EVENT was broken by the wrong parameter name.
    for (const v of ['5.0.0', '5.4.12', '6.0.30', '6.4.15', '7.0.0', '7.0.19', '7.2.0']) {
      expect(ackEventUrl(BASE, v, EVENTID)).toBe(
        BASE + '/zabbix.php?action=popup&popup_action=acknowledge.edit&eventids%5B%5D=' + EVENTID
      );
    }
  });

  it('uses action=acknowledge.edit on pre-5.0 servers', () => {
    expect(ackEventUrl(BASE, '4.0.45', EVENTID)).toBe(
      BASE + '/zabbix.php?action=acknowledge.edit&eventids[]=' + EVENTID
    );
  });
});

describe('versionPart', () => {
  it('parses segments numerically, not lexicographically', () => {
    expect(versionPart('7.0.19', 0)).toBe(7);
    expect(versionPart('7.0.19', 1)).toBe(0);
    expect(versionPart('10.0.0', 0)).toBe(10);
    expect(versionPart('7.4.0', 1)).toBe(4);
  });

  it('returns 0 for missing segments', () => {
    expect(versionPart('7', 1)).toBe(0);
  });
});
