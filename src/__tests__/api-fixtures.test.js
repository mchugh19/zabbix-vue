// Validates that the API fixtures match upstream-verified response shapes
// for each Zabbix version. Per-version rules (lastEvent presence/fields,
// string types, 32-hex session ids) were derived from upstream PHP source
// (2.0/6.0/7.0/7.4) and official docs (3.0/4.0/5.0/5.4) — see
// src/__tests__/fixtures/api/README.md for provenance.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, 'fixtures', 'api');

const versions = readdirSync(FIXTURES, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

// lastEvent fields zabbix-vue's selectLastEvent=[eventid,acknowledged,severity]
// actually yields per version:
// - 2.0: array-form selectLastEvent is silently ignored -> no lastEvent key
// - 3.0: severity is not an event column yet -> no severity
// - 4.0+: all three fields
const LAST_EVENT_FIELDS = {
  '2.0': null,
  '3.0': ['eventid', 'acknowledged'],
  '4.0': ['eventid', 'acknowledged', 'severity'],
  '5.0': ['eventid', 'acknowledged', 'severity'],
  '5.4': ['eventid', 'acknowledged', 'severity'],
  '6.0': ['eventid', 'acknowledged', 'severity'],
  '7.0': ['eventid', 'acknowledged', 'severity'],
  '7.4': ['eventid', 'acknowledged', 'severity'],
};

describe('API fixtures', () => {
  for (const version of versions) {
    describe(`Zabbix ${version}`, () => {
      const load = (method) =>
        JSON.parse(readFileSync(join(FIXTURES, version, `${method}.json`), 'utf8'));

      it('apiinfo.version returns this version', () => {
        const r = load('apiinfo.version');
        expect(r.jsonrpc).toBe('2.0');
        expect(r.result).toMatch(new RegExp(`^${version.replace('.', '\\.')}\\.`));
      });

      it('user.login returns a 32-char lowercase hex session id', () => {
        expect(load('user.login').result).toMatch(/^[0-9a-f]{32}$/);
      });

      it('user.logout returns true', () => {
        expect(load('user.logout').result).toBe(true);
      });

      it('trigger.get returns the requested fields as strings', () => {
        const [t] = load('trigger.get').result;
        for (const f of ['triggerid', 'description', 'priority', 'lastchange']) {
          expect(typeof t[f]).toBe('string');
        }
        const [h] = t.hosts;
        for (const f of ['hostid', 'host', 'name', 'maintenance_status']) {
          expect(typeof h[f]).toBe('string');
        }
      });

      it('trigger.get lastEvent matches version capabilities', () => {
        const [t] = load('trigger.get').result;
        const expected = LAST_EVENT_FIELDS[version];
        if (expected === null) {
          expect(t).not.toHaveProperty('lastEvent');
        } else {
          expect(Object.keys(t.lastEvent).sort()).toEqual([...expected].sort());
          // never emit bookkeeping fields the request didn't ask for
          expect(t.lastEvent).not.toHaveProperty('objectid');
          expect(t.lastEvent).not.toHaveProperty('ns');
        }
      });

      it('event.get returns only eventids', () => {
        const result = load('event.get').result;
        expect(result.length).toBeGreaterThan(0);
        for (const e of result) {
          expect(Object.keys(e)).toEqual(['eventid']);
          expect(typeof e.eventid).toBe('string');
        }
      });

      it('hostgroup.get returns groupid and name', () => {
        const result = load('hostgroup.get').result;
        expect(result.length).toBeGreaterThan(0);
        for (const g of result) {
          expect(Object.keys(g).sort()).toEqual(['groupid', 'name']);
          expect(typeof g.groupid).toBe('string');
        }
      });
    });
  }
});
