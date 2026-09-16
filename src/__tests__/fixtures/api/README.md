# Zabbix API response fixtures

Synthetic-but-grounded JSON-RPC responses for the six API methods zabbix-vue
calls, one directory per Zabbix minor series. Each fixture contains exactly
the fields zabbix-vue requests, with per-version shapes derived from upstream
source and docs (see Provenance below) — not from guesswork.

Regenerate: `npm run generate:fixtures` (`scripts/generate-api-fixtures.mjs`).

## What zabbix-vue sends

- `apiinfo.version` — `params: []`
- `user.login` — `{password, user|username}`
- `user.logout` — `[]`
- `trigger.get` — `expandDescription`, `skipDependent`,
  `selectHosts=[host,name,hostid,maintenance_status]`,
  `selectLastEvent=[eventid,acknowledged,severity]`, `monitored`,
  `min_severity`, `active`, `filter={value:1,status:0}`,
  `output=[triggerid,description,priority,lastchange]`,
  `sortfield=priority`, `sortorder=DESC`
  (optionally `withLastEventUnacknowledged`, `maintenance=false`, `groupids`)
- `event.get` — `output=[eventid]`, `eventids=[...]`, `suppressed=false`
- `hostgroup.get` — `output=[groupid,name]`

## Per-version fixture differences

| Area | 2.0 | 3.0 | 4.0 | 5.0 | 5.4 | 6.0 | 7.0 | 7.4 |
|------|-----|-----|-----|-----|-----|-----|-----|-----|
| `apiinfo.version` result | 2.0.21 | 3.0.32 | 4.0.50 | 5.0.47 | 5.4.12 | 6.0.48 | 7.0.30 | 7.4.14 |
| `trigger.get` → `lastEvent` | absent | `{eventid, acknowledged}` | `{eventid, acknowledged, severity}` | same | same | same | same | same |

Everything else is identical across versions, because the requests yield
identical shapes there:

- `user.login` → 32-char lowercase hex session id (md5 on 2.0,
  `bin2hex(random_bytes(16))` on 6.0+; documented 32-hex example on 5.x).
- `user.logout` → `true`.
- `event.get` → `[{eventid}]` only. (On 2.0/3.0 the array-form `output`
  and the `suppressed` param are silently ignored; the default `refer`
  output is also just the eventid, so the shape coincides.)
- `hostgroup.get` → `[{groupid, name}]`.
- All numbers are JSON strings upstream (DB values are PHP strings), e.g.
  `"priority": "4"`.

### Why `lastEvent` varies

- **2.0**: `selectLastEvent` only honors the `'refer'`/`'extend'` literals;
  an array field list is silently ignored, so a real 2.0 server never emits
  the `lastEvent` key for zabbix-vue's request. The extension must tolerate
  its absence (it falls back to the trigger's `priority`).
- **3.0**: `severity` is not an event-table column yet (added in 4.0), so a
  real 3.0 server returns `eventid`/`acknowledged` but no `severity`.
- **4.0+**: all three requested fields are returned. Bookkeeping fields the
  request didn't ask for (`objectid`, `ns`) are deliberately omitted.

## Compatibility matrix

| Method | 2.0 | 3.0 | 4.0 | 5.0 | 5.4 | 6.0 | 7.0 | 7.4 |
|--------|-----|-----|-----|-----|-----|-----|-----|-----|
| `apiinfo.version` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `user.login` (`user` param) | ✓ | ✓ | ✓ | ✓ | ✗ | ✓¹ | ✗ | ✗ |
| `user.login` (`username` param) | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| `user.logout` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `trigger.get` (all 14 params used) | ✓² | ✓ | ✓ | ✓ | ✓³ | ✓ | ✓ | ✓ |
| `event.get` (`suppressed` filter) | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `hostgroup.get` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

¹ `user` still accepted on 6.0 as a deprecated alias (removed in 7.0);
  alias status on 5.4 is undocumented.
² Param exists on 2.0, but array-form `selectLastEvent` is ignored (no
`lastEvent` in responses), and `groupids: []` matches zero rows
(`dbConditionInt` emits `1=0` for empty arrays).
³ 5.4 `trigger/get` docs page was unfetchable; carried from 5.0 on
changelog evidence (no affecting change in the 5.4 line).

## Auth transport

| Method | 2.0–5.2 | 5.4–6.4 | 7.0+ |
|--------|---------|---------|------|
| Session ID in body (`auth` param) | ✓ | ✓ | ✓ (deprecated) |
| Bearer token in `Authorization` header | ✗ | ✓ | ✓ (preferred) |

zabbix-vue sends the Bearer header on 5.4+ (PR #126), body `auth` on older.

## Notes for fixture consumers (e.g. the dist smoke test)

- The `user` → `username` rename happened in **5.4** (ZBXNEXT-6474), not 6.0.
  Sending `user` to 7.0+ fails input validation; on 6.x it works via the
  deprecated alias.
- `suppressed: false` on `event.get` is silently ignored pre-4.0, so the
  suppressed-problem detection degrades fail-open there (suppressed problems
  show as normal) rather than erroring.
- Do not assert non-empty results for a `groupids: []` query against the 2.0
  fixtures — a real 2.0 server returns zero rows for an empty groupids array.
- `problem.get` (used by zabbix-noc-alerter) was added in 5.4 and is not
  used by zabbix-vue, which uses `trigger.get` + `event.get` instead.

## Provenance

Per-version upstream tag used for the fixture directory:

| Dir | Upstream tag | Evidence |
|-----|--------------|----------|
| 2.0 | 2.0.21 | PHP source (official tarball) |
| 3.0 | 3.0.32 | Official docs |
| 4.0 | 4.0.50 | Official docs |
| 5.0 | 5.0.47 | Official docs |
| 5.4 | 5.4.12 | Official docs |
| 6.0 | 6.0.48 | PHP source (GitHub tag) |
| 7.0 | 7.0.30 | PHP source (GitHub tag) |
| 7.4 | 7.4.14 | PHP source (GitHub tag) |

6.0.48/7.0.30/7.4.14 were verified against the GitHub tag listing; the older
final patch numbers come from the upstream ChangeLog. Known gaps: no PHP
source was inspected for 3.0/4.0/5.0/5.4 (docs only); the 5.4 `trigger/get`
page and the 3.0/4.0 `user/login` pages were unfetchable, so those claims
rest on adjacent docs plus the official API changelogs (ZBXNEXT-6474,
ZBXNEXT-413) rather than direct quotes. Nothing here is invented beyond the
request: response fields are exactly what zabbix-vue asks for.
