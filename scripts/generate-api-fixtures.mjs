// Generates the API fixtures under src/__tests__/fixtures/api/ from
// upstream-verified response shapes.
//
// Derivation rules (see src/__tests__/fixtures/api/README.md for full
// provenance; research: /tmp/zabbix-fixture-research/report.md):
// - apiinfo.version: researched final patch tag per minor series
// - user.login: 32-char lowercase hex session id
//   (2.0: md5(...); 6.0+: bin2hex(openssl_random_pseudo_bytes(16)))
// - user.logout: true
// - trigger.get: exactly the fields zabbix-vue requests —
//   output=[triggerid,description,priority,lastchange],
//   selectHosts=[host,name,hostid,maintenance_status],
//   selectLastEvent=[eventid,acknowledged,severity] — with per-version
//   adjustments:
//     * 2.0: array-form selectLastEvent is silently ignored -> no lastEvent key
//     * 3.0: severity is not an event column yet -> lastEvent has no severity
//     * 4.0+: lastEvent = {eventid, acknowledged, severity}
//   Bookkeeping fields the request didn't ask for (objectid, ns) are omitted.
// - event.get: output=[eventid] -> [{eventid}] (2.0/3.0 ignore unknown output
//   arrays and fall back to `refer`, which is also just the eventid)
// - hostgroup.get: output=[groupid,name] -> [{groupid, name}]
// Upstream emits all numbers as JSON strings (DB values are PHP strings).
//
// Run: node scripts/generate-api-fixtures.mjs (or npm run generate:fixtures)

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'src', '__tests__', 'fixtures', 'api');

// Researched final patch per minor series. Tags 6.0.48/7.0.30/7.4.14 verified
// against the GitHub tag listing; older finals from the upstream ChangeLog.
const VERSIONS = [
  // dir, upstream tag, lastEvent fields (null = key absent: 2.0 ignores
  // array-form selectLastEvent entirely; 3.0 has no severity event column)
  { dir: '2.0', tag: '2.0.21', lastEvent: null },
  { dir: '3.0', tag: '3.0.32', lastEvent: ['eventid', 'acknowledged'] },
  { dir: '4.0', tag: '4.0.50', lastEvent: ['eventid', 'acknowledged', 'severity'] },
  { dir: '5.0', tag: '5.0.47', lastEvent: ['eventid', 'acknowledged', 'severity'] },
  { dir: '5.4', tag: '5.4.12', lastEvent: ['eventid', 'acknowledged', 'severity'] },
  { dir: '6.0', tag: '6.0.48', lastEvent: ['eventid', 'acknowledged', 'severity'] },
  { dir: '7.0', tag: '7.0.30', lastEvent: ['eventid', 'acknowledged', 'severity'] },
  { dir: '7.4', tag: '7.4.14', lastEvent: ['eventid', 'acknowledged', 'severity'] },
];

// Documented example session id (5.0 docs): 32 lowercase hex chars.
const SESSION_ID = '0424bd59b807674191e7d77572075f33';

const LAST_EVENT_VALUES = {
  eventid: '51234',
  acknowledged: '0',
  severity: '4',
};

const envelope = (result) => ({ jsonrpc: '2.0', result, id: 1 });

function triggerGet(v) {
  const trigger = {
    triggerid: '13123',
    description: 'High CPU load on Web Server 01',
    priority: '4',
    lastchange: '1726400000',
    hosts: [
      {
        hostid: '10105',
        host: 'web-server-01',
        name: 'Web Server 01',
        maintenance_status: '0',
      },
    ],
  };
  if (v.lastEvent) {
    trigger.lastEvent = Object.fromEntries(
      v.lastEvent.map((f) => [f, LAST_EVENT_VALUES[f]])
    );
  }
  return envelope([trigger]);
}

for (const v of VERSIONS) {
  const dir = join(OUT, v.dir);
  mkdirSync(dir, { recursive: true });
  const files = {
    'apiinfo.version.json': envelope(v.tag),
    'user.login.json': envelope(SESSION_ID),
    'user.logout.json': envelope(true),
    'trigger.get.json': triggerGet(v),
    'event.get.json': envelope([{ eventid: '51234' }]),
    'hostgroup.get.json': envelope([{ groupid: '4', name: 'Linux servers' }]),
  };
  for (const [name, data] of Object.entries(files)) {
    writeFileSync(join(dir, name), JSON.stringify(data, null, 2) + '\n');
  }
  console.log(`wrote ${v.dir}/ (upstream ${v.tag})`);
}
