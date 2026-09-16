// Validates that API fixtures are well-formed and match the expected
// structure for each Zabbix version.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, 'fixtures', 'api');

const versions = readdirSync(FIXTURES).filter(v => v !== 'README.md');

describe('API fixtures', () => {
  for (const version of versions) {
    describe(`Zabbix ${version}`, () => {
      const load = (method) => JSON.parse(
        readFileSync(join(FIXTURES, version, `${method}.json`), 'utf8')
      );

      it('apiinfo.version returns a version string', () => {
        const r = load('apiinfo.version');
        expect(r.jsonrpc).toBe('2.0');
        expect(r.result).toMatch(new RegExp(`^${version.replace('.', '\\.')}`));
      });

      it('user.login returns a session ID string', () => {
        const r = load('user.login');
        expect(typeof r.result).toBe('string');
        expect(r.result.length).toBeGreaterThan(0);
      });

      it('user.logout returns true', () => {
        const r = load('user.logout');
        expect(r.result).toBe(true);
      });

      it('trigger.get returns triggers with expected fields', () => {
        const r = load('trigger.get');
        expect(Array.isArray(r.result)).toBe(true);
        for (const t of r.result) {
          expect(t.triggerid).toBeDefined();
          expect(t.description).toBeDefined();
          expect(t.priority).toBeDefined();
          expect(t.lastchange).toBeDefined();
          expect(Array.isArray(t.hosts)).toBe(true);
          expect(t.lastEvent).toBeDefined();
          expect(t.lastEvent.eventid).toBeDefined();
        }
      });

      it('event.get returns events', () => {
        const r = load('event.get');
        expect(Array.isArray(r.result)).toBe(true);
        for (const e of r.result) {
          expect(e.eventid).toBeDefined();
        }
      });

      it('hostgroup.get returns groups', () => {
        const r = load('hostgroup.get');
        expect(Array.isArray(r.result)).toBe(true);
        for (const g of r.result) {
          expect(g.groupid).toBeDefined();
          expect(g.name).toBeDefined();
        }
      });
    });
  }
});
