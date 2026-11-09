# Web-Monitor-ST

WordPress fleet status dashboard — live at [st.richardkentgates.com](https://st.richardkentgates.com).

## What It Does

Monitors all GCM-managed WordPress sites by fetching three REST endpoints per site:
- `GET /wp-json/gcm/v1/status` — server health (Apache, MariaDB, PHP, disk, memory, backup, security, timers)
- `GET /wp-json/metamanager/v1/status` — MetaManager daemon status and queues
- `GET /wp-json/mxroute/v1/status` — MXRoute Mailer queue and cron history

## Features

### Site Cards
- **HTTP status pill** — green (200), red (errors), gray (unknown)
- **Latency pill** — response time heartbeat (⏱ seconds)
- **Service badges** — Apache, MariaDB, WP, MetaManager daemons
- **Disk/memory progress bars** with color thresholds
- **Status badge** — Up/Partial/Down with color coding
- **3 buttons** — Details, History, Remove

### Detail Lightbox (Details button)
- **Hardware** — disk, memory, swap donut gauges
- **CPU Load Average** — 1m/5m/15m bar chart
- **Backup** — date, size, archive/SQL validity, timer
- **Versions** — GCM, WordPress, PHP, updates
- **System** — uptime, load, disk, memory
- **Services** — Apache, database, WordPress, SSL
- **Timers** — backup, maintenance, WP cron
- **Security** — UFW, fail2ban, ModSecurity, maldet, site integrity
- **Status Lapses** — bar chart + text readout
- **OS Update** — last run, result, packages upgraded, reboot action
- **MetaManager** — daemons, queues, tools
- **MXRoute** — sent/pending/failed queue stats

All server-reported times convert to browser time for display only (the
status report itself is never converted); site sizes show as distinct
measures — VM disk, site files, site DB, bundle size.

### Downtime History (History button)
- **Incident Summary** — total incidents, ongoing, total downtime, avg/longest duration
- **Incidents table** — Time Down, Time Up, Duration, HTTP code, Status (Down/Resolved)
- Tracks Down/Up transitions; ongoing incidents shown as "Down"

### Other
- **Auto-poll** — checks all sites every 60 seconds
- **Notifications** — browser notifications on status change (`window.enableNotifications`)
- **Import/Export** — site list as JSON
- **Graceful degradation** — shows "Not installed" notice when MetaManager/MXRoute absent

### Status Semantics (the detection contract)

Detection is the contract: what the endpoints report defines the status.

- A **404 endpoint = not installed / not detected** — the component itself
  is never shown "down"; it renders "Not installed". But a missing
  component holds the **site** at Partial when anything else is healthy —
  never silently promoted to Up.
- A **detected-but-broken** component (500, empty payload, dead daemon)
  reads **Partial** alongside healthy ones.
- Rollup: all three healthy → Up; some healthy → Partial; **zero healthy**
  (all broken, all missing, or a mix) → Down. HTTP failure is one way to
  reach zero-healthy, not a separate rule.
- Health.js assets are cache-busted with `?v=` and the build version is
  shown in the footer so stale tabs are visible.

## Authentication

Uses WordPress Application Passwords (Basic auth). Create one per site:

```bash
sudo -u www-data /usr/local/bin/wp --path=/srv/www/wordpress \
  user application-password create crawluser "web-monitor-$(date +%Y%m%d)" --porcelain
```

Store the password securely (e.g., `/root/crawluser-credentials.txt` on the server).

## Local Development

```bash
npm install
npm run dev    # serves on localhost:8000
```

Add sites via the UI with URL + username + app password.

## Deployment

Push to `main` branch → GitHub Pages auto-deploys to `st.richardkentgates.com`.

## API Data Sources

The GCM status endpoint returns (key fields):
- `database` (not `mariadb`!) — `{running, type, version}`
- `disk` — `{used, total, pct}`
- `memory` — `{used, total}` (no pct — compute from sizes)
- `swap` — `{used, total}`
- `backup` — `{date, size, archive_valid, sql_ok}`
- `status_lapses` — array of `{ts, lapsed_seconds}` (monitor timing gaps, not downtime)
- `load_avg` — `{1m, 5m, 15m}`
- `security_scan` — `{last_ts, ok, findings}`
- `site_integrity` — `{index_php, htaccess, homepage_code}`

Downtime incidents are tracked client-side (localStorage) from status transitions.
