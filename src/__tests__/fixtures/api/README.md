# Zabbix API Version Compatibility

Based on actual upstream Zabbix code and documentation.
Fixtures in this directory are realistic API responses for each major version.

## Methods used by zabbix-vue

| Method | 2.0 | 3.0 | 4.0 | 5.0 | 5.4 | 6.0 | 7.0 | 7.4 |
|--------|-----|-----|-----|-----|-----|-----|-----|-----|
| `apiinfo.version` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `user.login` (`user` param) | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `user.login` (`username` param) | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| `user.logout` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `trigger.get` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `event.get` (`suppressed` filter) | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `hostgroup.get` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

## Auth transport

| Method | 2.0–5.2 | 5.4–6.4 | 7.0+ |
|--------|---------|---------|------|
| Session ID in body (`auth` param) | ✓ | ✓ | ✓ (deprecated) |
| Bearer token in `Authorization` header | ✗ | ✓ | ✓ (preferred) |

zabbix-vue sends Bearer header on 5.4+ (PR #126), body `auth` on older.

## trigger.get parameters (used by zabbix-vue)

All of these exist in 2.0+ (verified against upstream docs):
- `expandDescription`, `skipDependent`, `selectHosts`, `selectLastEvent`
- `monitored`, `min_severity`, `active`, `filter`, `output`
- `withLastEventUnacknowledged`, `maintenance`
- `sortfield`, `sortorder`

## Notes

- `user.login` response is always `{"result": "<sessionid>"}` — only the
  *request* param name changed (`user` → `username` in 5.4).
- The `suppressed` filter in `event.get` was added in 4.0. On 2.x/3.x,
  zabbix-vue's suppressed-problem detection via `event.get` will fail;
  all problems are treated as non-suppressed (fail-open).
- `problem.get` (used by zabbix-noc-alerter) was added in 5.4 and is not
  used by zabbix-vue, which uses `trigger.get` + `event.get` instead.

## Sources

- Upstream PHP: `ui/include/classes/api/services/CTrigger.php`,
  `CEvent.php` (6.0, 7.0 tags — GitHub only retains 6.0+ branches)
- Versioned docs: https://www.zabbix.com/documentation/{version}/en/manual/api/reference/
