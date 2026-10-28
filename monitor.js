document.addEventListener("DOMContentLoaded", () => {
  const POLL_INTERVAL = 60;
  let countdown = POLL_INTERVAL;
  const responseHistory = {};

  // ── Notifications ──
  function hideNotifButtonIfEnabled() {
    if (Notification.permission === "granted")
      document.getElementById("notifBtn").style.display = "none";
  }
  function enableNotifications() {
    const s = document.getElementById("notifStatus");
    s.innerHTML = "Notifications: <strong>Waiting…</strong>";
    Notification.requestPermission().then(p => {
      if (p === "granted") { s.innerHTML = 'Notifications: <strong style="color:#22c55e">Enabled</strong>'; hideNotifButtonIfEnabled(); }
      else if (p === "denied") s.innerHTML = 'Notifications: <strong style="color:#ef4444">Blocked</strong>';
      else s.innerHTML = "Notifications: <strong>Not enabled</strong>";
    });
  }
  function updateNotificationStatus() {
    const s = document.getElementById("notifStatus");
    if (Notification.permission === "granted") s.innerHTML = 'Notifications: <strong style="color:#22c55e">Enabled</strong>';
    else if (Notification.permission === "denied") s.innerHTML = 'Notifications: <strong style="color:#ef4444">Blocked</strong>';
    else s.innerHTML = "Notifications: <strong>Not enabled</strong>";
    hideNotifButtonIfEnabled();
  }
  updateNotificationStatus();

  // ── Data ──
  function normalize(site) {
    return {
      url: site.url || "", user: site.user || "", pass: site.pass || "",
      status: site.status || "Unknown", responseTime: site.responseTime || "N/A",
      apiResponse: site.apiResponse || "—",
      httpCode: site.httpCode || "—",
      lastChecked: site.lastChecked || "Never",
      incidents: site.incidents || [],
      gcm: site.gcm || null, mm: site.mm || null, mxr: site.mxr || null
    };
  }
  const rawSites = JSON.parse(localStorage.getItem("sites") || "[]");
  const sites = rawSites.map(normalize);
  function save() { localStorage.setItem("sites", JSON.stringify(sites)); render(); }

  // ── Add / Remove ──
  window.addSite = function() {
    const url = document.getElementById("urlInput").value.trim().replace(/\/+$/, "");
    const user = document.getElementById("userInput").value.trim();
    const pass = document.getElementById("passInput").value.trim();
    if (!url || !user || !pass) return;
    sites.push(normalize({ url, user, pass }));
    document.getElementById("urlInput").value = "";
    document.getElementById("userInput").value = "";
    document.getElementById("passInput").value = "";
    save();
  };
  window._removeSite = function(i) { sites.splice(i, 1); save(); };

  // ── Import / Export ──
  window.exportSites = function() {
    const blob = new Blob([JSON.stringify(sites, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "sites.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  window.importSites = function() { document.getElementById("importFile").click(); };
  document.getElementById("importFile").addEventListener("change", function() {
    const file = this.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const imported = JSON.parse(e.target.result);
        if (Array.isArray(imported)) {
          sites.length = 0;
          imported.forEach(s => sites.push(normalize(s)));
          save();
        }
      } catch { alert("Invalid JSON file"); }
    };
    reader.readAsText(file);
  });

  // ── Helpers ──
  function esc(str) {
    const d = document.createElement("div");
    d.appendChild(document.createTextNode(String(str ?? "\u2014")));
    return d.innerHTML;
  }
  function formatUptime(s) {
    if (!s) return "\u2014";
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
    return d > 0 ? d + "d " + h + "h" : h + "h " + Math.floor((s % 3600) / 60) + "m";
  }
  function pctClass(pct) {
    if (pct >= 90) return "crit";
    if (pct >= 75) return "warn";
    return "ok";
  }
  function pctNum(str) {
    if (!str) return 0;
    const m = String(str).match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  }
  function parseSize(str) {
    if (!str) return 0;
    const s = String(str).trim();
    const m = s.match(/^([\d.]+)\s*([KMGT]?i?B?)$/i);
    if (!m) return 0;
    const val = parseFloat(m[1]);
    const unit = m[2].toUpperCase().replace("I", "");
    const mult = { "B": 1, "K": 1024, "KB": 1024, "M": 1048576, "MB": 1048576, "G": 1073741824, "GB": 1073741824, "T": 1099511627776, "TB": 1099511627776 }[unit] || 1;
    return val * mult;
  }

  // ── SVG Sparkline ──
  function sparkline(data, color, width = 280, height = 28) {
    if (!data || data.length < 2) return "";
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const step = width / (data.length - 1);
    const points = data.map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return x.toFixed(1) + "," + y.toFixed(1);
    });
    const area = "0," + height + " " + points.join(" ") + " " + width + "," + height;
    return '<svg viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none">' +
      '<polygon points="' + area + '" fill="' + color + '22"/>' +
      '<polyline points="' + points.join(" ") + '" fill="none" stroke="' + color + '" stroke-width="1.5" stroke-linejoin="round"/>' +
      '</svg>';
  }

  // ── SVG Bar Chart (for lapses) ──
  function barChart(data, maxBars = 20, color = "#eab308") {
    if (!data || !data.length) return '<div style="color:#64748b;font-size:11px;padding:8px">No lapses recorded</div>';
    const recent = data.slice(-maxBars);
    const max = Math.max(...recent.map(d => d.lapsed_seconds || 0), 1);
    const w = 280, h = 48, gap = 2;
    const bw = Math.max(2, (w - gap * (recent.length - 1)) / recent.length);
    let bars = "";
    recent.forEach((d, i) => {
      const val = d.lapsed_seconds || 0;
      const bh = Math.max(2, (val / max) * h);
      const x = i * (bw + gap);
      const y = h - bh;
      const c = val > 120 ? "#ef4444" : val > 90 ? "#f97316" : color;
      bars += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) + '" fill="' + c + '" rx="1"/>';
    });
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;height:48px">' + bars + '</svg>';
  }

  // ── Lapse Stats ──
  function lapseStats(lapses) {
    if (!lapses || !lapses.length) return "No lapses recorded";
    const secs = lapses.map(l => l.lapsed_seconds || 0);
    const avg = (secs.reduce((a, b) => a + b, 0) / secs.length).toFixed(1);
    const max = Math.max(...secs);
    const min = Math.min(...secs);
    return "Count: " + lapses.length + " · Avg: " + avg + "s · Min: " + min + "s · Max: " + max + "s";
  }

  // ── Lapse Chart ──
  function lapseChart(lapses) {
    if (!lapses || !lapses.length) return "";
    const recent = lapses.slice(-30);
    const max = Math.max(...recent.map(l => l.lapsed_seconds || 0), 1);
    const w = 280, h = 48, gap = 2;
    const bw = Math.max(3, (w - gap * (recent.length - 1)) / recent.length);
    let bars = "";
    recent.forEach((l, i) => {
      const val = l.lapsed_seconds || 0;
      const bh = Math.max(2, (val / max) * h);
      const x = i * (bw + gap);
      const y = h - bh;
      const c = val > 120 ? "#ef4444" : val > 90 ? "#f97316" : "#3b82f6";
      bars += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) + '" fill="' + c + '" rx="1"/>';
    });
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;height:48px">' + bars + '</svg>';
  }

  // ── Load Average Mini Chart ──
  function loadChart(loadAvg) {
    if (!loadAvg) return "";
    const vals = [loadAvg["1m"], loadAvg["5m"], loadAvg["15m"]].map(Number);
    const max = Math.max(...vals, 1);
    const w = 280, h = 40, labelH = 18;
    const bw = w / 3 - 12;
    const colors = ["#3b82f6", "#22c55e", "#eab308"];
    const labels = ["CPU 1m", "CPU 5m", "CPU 15m"];
    let bars = "";
    vals.forEach((v, i) => {
      const bh = Math.max(2, (v / max) * h);
      const x = i * (bw + 12);
      const y = h - bh;
      bars += '<rect x="' + x + '" y="' + y + '" width="' + bw + '" height="' + bh + '" fill="' + colors[i] + '" rx="2"/>';
      bars += '<text x="' + (x + bw / 2) + '" y="' + (y - 4) + '" text-anchor="middle" fill="#f1f5f9" font-size="11" font-weight="600">' + v + '</text>';
      bars += '<text x="' + (x + bw / 2) + '" y="' + (h + labelH - 2) + '" text-anchor="middle" fill="#94a3b8" font-size="10" font-weight="500">' + labels[i] + '</text>';
    });
    return '<svg viewBox="0 0 ' + w + ' ' + (h + labelH) + '" style="width:100%;height:' + (h + labelH) + 'px">' + bars + '</svg>';
  }

  // ── Gauge ──
  function gauge(pct, color, size = 64) {
    const r = (size - 10) / 2;
    const c = size / 2;
    const circ = 2 * Math.PI * r;
    const offset = circ - (Math.min(pct, 100) / 100) * circ;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' +
      '<circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="none" stroke="#1f2937" stroke-width="6"/>' +
      '<circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="6" ' +
      'stroke-dasharray="' + circ + '" stroke-dashoffset="' + offset + '" stroke-linecap="round" ' +
      'transform="rotate(-90 ' + c + ' ' + c + ')"/>' +
      '<text x="' + c + '" y="' + (c + 4) + '" text-anchor="middle" fill="#f1f5f9" font-size="11" font-weight="600">' + pct + '%</text>' +
      '</svg>';
  }

  // ── Fetch ──
  async function fetchStatus(site, endpoint) {
    const cred = btoa(site.user + ":" + site.pass);
    try {
      const res = await fetch(site.url + "/wp-json/" + endpoint, {
        method: "GET",
        headers: { "Authorization": "Basic " + cred },
        cache: "no-store"
      });
      const httpCode = res.status;
      if (!res.ok) return { _error: true, _code: httpCode, _httpCode: httpCode };
      const data = await res.json();
      data._httpCode = httpCode;
      return data;
    } catch {
      return { _error: true, _code: "\u2014" };
    }
  }

  // ── Check Site ──
  async function measureLatency(site) {
    const start = performance.now();
    try {
      await fetch(site.url, { method: "HEAD", cache: "no-store" });
    } catch {}
    return ((performance.now() - start) / 1000).toFixed(2);
  }

  async function checkSite(site, index) {
    const start = performance.now();
    const [gcm, mm, mxr] = await Promise.all([
      fetchStatus(site, "gcm/v1/status"),
      fetchStatus(site, "metamanager/v1/status"),
      fetchStatus(site, "mxroute/v1/status")
    ]);
    const seconds = ((performance.now() - start) / 1000).toFixed(2);
    const latency = await measureLatency(site);
    const gcmOk = gcm && !gcm._error;
    const mmOk = mm && !mm._error;
    const mxrOk = mxr && !mxr._error;

    let status = "Up";
    if (!gcmOk && !mmOk && !mxrOk) status = "Down";
    else if (!gcmOk || !mmOk || !mxrOk) status = "Partial";

    const prev = sites[index].status;
    if (prev !== "Unknown" && prev !== status && Notification.permission === "granted") {
      new Notification(site.url, { body: "Status: " + prev + " → " + status });
    }

    // Track downtime incidents
    if (status === "Down" && prev !== "Down") {
      sites[index].incidents.push({ start: Date.now(), end: null, httpCode: gcmOk ? (gcm._httpCode || 200) : (gcm._code || "—") });
    } else if (status !== "Down" && prev === "Down") {
      const inc = sites[index].incidents[sites[index].incidents.length - 1];
      if (inc && !inc.end) inc.end = Date.now();
    }

    sites[index].status = status;
    sites[index].responseTime = latency + "s";
    sites[index].apiResponse = seconds + "s";
    sites[index].httpCode = (gcm._httpCode) || (gcm._code !== "—" ? gcm._code : "—") || "—";
    sites[index].lastChecked = new Date().toLocaleTimeString();
    sites[index].gcm = gcmOk ? gcm : null;
    sites[index].mm = mmOk ? mm : null;
    sites[index].mxr = mxrOk ? mxr : null;

    if (!responseHistory[site.url]) responseHistory[site.url] = [];
    responseHistory[site.url].push(parseFloat(latency));
    if (responseHistory[site.url].length > 30) responseHistory[site.url].shift();

    save();
  }

  // ── Card HTML ──
  function cardHtml(site, i) {
    const badgeClass = { Up: "up", Partial: "partial", Down: "down" }[site.status] || "unknown";
    const cardClass = { Down: "is-down", Partial: "is-partial" }[site.status] || "";
    const history = responseHistory[site.url] || [];

    let metrics = "";
    if (site.gcm && site.gcm.disk) {
      const dpct = pctNum(site.gcm.disk.pct);
      metrics += '<div class="metric-row"><span class="metric-label">Disk</span>' +
        '<div class="metric-bar-wrap"><div class="metric-bar ' + pctClass(dpct) + '" style="width:' + dpct + '%"></div></div>' +
        '<span class="metric-val">' + esc(site.gcm.disk.used) + '</span></div>';
    }
    if (site.gcm && site.gcm.memory && site.gcm.memory.pct) {
      const mpct = pctNum(site.gcm.memory.pct);
      metrics += '<div class="metric-row"><span class="metric-label">Mem</span>' +
        '<div class="metric-bar-wrap"><div class="metric-bar ' + pctClass(mpct) + '" style="width:' + mpct + '%"></div></div>' +
        '<span class="metric-val">' + esc(site.gcm.memory.used) + '</span></div>';
    }

    let services = "";
    // MetaManager daemons (compress, meta)
    if (site.mm && !site.mm._error && site.mm.daemons) {
      Object.entries(site.mm.daemons).forEach(([name, d]) => {
        services += '<span class="svc ' + (d.running ? "ok" : "down") + '">' + esc(name) + '</span>';
      });
    }
    // GCM daemon-driven services (backup, cron, upgrade, pending, status, scan)
    if (site.gcm && !site.gcm._error) {
      const g = site.gcm;
      const daemonServices = [
        ["backup", g.backup_timer],
        ["cron", g.wp_cron],
        ["upgrade", g.upgrade_timer],
        ["pending", g.pending_timer],
        ["status", g.gcm_status_timer || null],
        ["scan", g.security_scan ? { active: g.security_scan.ok } : null]
      ];
      daemonServices.forEach(([name, d]) => {
        if (d && d.active !== undefined) {
          services += '<span class="svc ' + (d.active ? "ok" : "down") + '">' + name + '</span>';
        }
      });
    }
    // MXRoute daemon (driven by wp-cron)
    if (site.mxr && !site.mxr._error) {
      const mxrOk = (site.mxr.pending !== undefined || site.mxr.sent !== undefined);
      services += '<span class="svc ' + (mxrOk ? "ok" : "down") + '">mxroute</span>';
    }

    const spark = history.length >= 2
      ? '<div class="sparkline-wrap">' + sparkline(history, "#3b82f6") + '</div>'
      : "";

    return '<div class="site-card ' + cardClass + '">' +
      '<div class="card-top">' +
        '<span class="card-url" title="' + esc(site.url) + '">' + esc(site.url) + '</span>' +
        '<span class="badge ' + badgeClass + '">' + site.status + '</span>' +
      '</div>' +
      spark +
      metrics +
      '<div class="service-row">' + services + '</div>' +
      '<div class="card-bottom">' +
        '<div class="card-stats">' +
          '<span class="stat-pill stat-code-' + (site.httpCode == 200 ? "ok" : site.httpCode == "—" ? "unknown" : "err") + '">HTTP ' + esc(site.httpCode) + '</span>' +
          '<span class="stat-pill stat-time">⏱ ' + esc(site.responseTime) + '</span>' +
        '</div>' +
        '<div class="card-actions">' +
          '<button class="btn btn-ghost btn-sm" onclick="window._openLightbox(' + i + ')">Details</button>' +
          '<button class="btn btn-ghost btn-sm" onclick="window._openHistory(' + i + ')">History</button>' +
          '<button class="btn btn-ghost btn-sm" onclick="window._removeSite(' + i + ')">Remove</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // ── Detail HTML ──
  function detailHtml(site) {
    let html = "";

    if (site.gcm) {
      const g = site.gcm;

      // ── Hardware Gauges ──
      let gauges = "";
      if (g.disk) {
        const dpct = pctNum(g.disk.pct);
        const dc = dpct >= 90 ? "#ef4444" : dpct >= 75 ? "#eab308" : "#22c55e";
        gauges += '<div class="gauge-item">' + gauge(dpct, dc) +
          '<div class="gauge-label">Disk ' + esc(g.disk.used) + '/' + esc(g.disk.total) + '</div></div>';
      }
      if (g.memory && g.memory.total) {
        const mTotal = parseSize(g.memory.total);
        const mUsed = parseSize(g.memory.used);
        const mpct = mTotal > 0 ? Math.round((mUsed / mTotal) * 100) : 0;
        const mc = mpct >= 90 ? "#ef4444" : mpct >= 75 ? "#eab308" : "#22c55e";
        gauges += '<div class="gauge-item">' + gauge(mpct, mc) +
          '<div class="gauge-label">Mem ' + esc(g.memory.used) + '/' + esc(g.memory.total) + '</div></div>';
      }
      if (g.swap && g.swap.total) {
        const sTotal = parseSize(g.swap.total);
        const sUsed = parseSize(g.swap.used);
        const spct = sTotal > 0 ? Math.round((sUsed / sTotal) * 100) : 0;
        const sc = spct >= 90 ? "#ef4444" : spct >= 75 ? "#eab308" : "#22c55e";
        gauges += '<div class="gauge-item">' + gauge(spct, sc) +
          '<div class="gauge-label">Swap ' + esc(g.swap.used) + '/' + esc(g.swap.total) + '</div></div>';
      }
      if (gauges) {
        html += '<div class="detail-card"><h3>Hardware</h3><div class="gauge-row">' + gauges + '</div></div>';
      }

      // ── Load Average ──
      if (g.load_avg) {
        html += '<div class="detail-card"><h3>CPU Load Average</h3>' + loadChart(g.load_avg) + '</div>';
      }

      // ── Backup ──
      if (g.backup || g.backup_timer) {
        html += '<div class="detail-card"><h3>Backup</h3><table class="detail-table">';
        if (g.backup) {
          html += '<tr><td>Last Backup</td><td>' + esc(g.backup.date) + '</td></tr>';
          html += '<tr><td>Size</td><td>' + esc(g.backup.size) + '</td></tr>';
          html += '<tr><td>Archive</td><td>' + (g.backup.archive_valid ? "✓ Valid" : "✗ Corrupt") + '</td></tr>';
          html += '<tr><td>SQL Dump</td><td>' + (g.backup.sql_ok ? "✓ OK" : "✗ Failed") + '</td></tr>';
        }
        if (g.backup_timer) {
          html += '<tr><td>Timer</td><td>' + (g.backup_timer.active ? "✓ Active" : "✗ Inactive") + '</td></tr>';
          if (g.backup_timer.next_run) html += '<tr><td>Next Run</td><td>' + esc(g.backup_timer.next_run) + '</td></tr>';
        }
        if (g.scheduled_backup) {
          html += '<tr><td>Scheduled</td><td>' + esc(g.scheduled_backup.status) + ' — ' + esc(g.scheduled_backup.date) + '</td></tr>';
        }
        html += '</table></div>';
      }

      // ── Versions ──
      html += '<div class="detail-card"><h3>Versions</h3><table class="detail-table">' +
        '<tr><td>GCM</td><td>v' + esc(g.gcm_version) + ' (' + esc(g.gcm_branch) + ')</td></tr>' +
        '<tr><td>WordPress</td><td>v' + esc(g.wp_version) + '</td></tr>' +
        '<tr><td>PHP</td><td>v' + esc(g.php_version) + '</td></tr>' +
        (g.wordpress_updates ? '<tr><td>Updates</td><td>core:' + g.wordpress_updates.core + ' plugins:' + g.wordpress_updates.plugins + ' themes:' + g.wordpress_updates.themes + '</td></tr>' : '') +
        '</table></div>';

      // ── System ──
      html += '<div class="detail-card"><h3>System</h3><table class="detail-table">' +
        '<tr><td>Uptime</td><td>' + formatUptime(g.uptime_seconds) + '</td></tr>' +
        '<tr><td>HTTP Latency</td><td>' + esc(site.responseTime) + '</td></tr>' +
        '<tr><td>API Response</td><td>' + esc(site.apiResponse || "—") + ' (3 endpoints)</td></tr>' +
        (g.disk ? '<tr><td>Disk</td><td>' + esc(g.disk.used) + ' / ' + esc(g.disk.total) + ' (' + esc(g.disk.pct) + ')</td></tr>' : '') +
        (g.memory ? '<tr><td>Memory</td><td>' + esc(g.memory.used) + ' / ' + esc(g.memory.total) + '</td></tr>' : '') +
        (g.swap ? '<tr><td>Swap</td><td>' + esc(g.swap.used) + ' / ' + esc(g.swap.total) + '</td></tr>' : '') +
        '</table></div>';

      // ── Services ──
      html += '<div class="detail-card"><h3>Services</h3><table class="detail-table">' +
        '<tr><td>Apache</td><td>' + (g.apache && g.apache.running ? "✓ Running v" + esc(g.apache.version || "") : "✗ Down") + '</td></tr>' +
        '<tr><td>Database</td><td>' + (g.database && g.database.running ? "✓ " + esc(g.database.type || "MariaDB") + " v" + esc(g.database.version || "") : "✗ Down") + '</td></tr>' +
        '<tr><td>WordPress</td><td>' + (g.wordpress && g.wordpress.running ? "✓ Running" : "✗ Down") + '</td></tr>' +
        (g.ssl ? '<tr><td>SSL</td><td>' + g.ssl.cert_days_left + ' days left</td></tr>' : '') +
        '</table></div>';

      // ── Timers ──
      if (g.backup_timer || g.pending_timer || g.wp_cron || g.upgrade_timer) {
        html += '<div class="detail-card"><h3>Timers</h3><table class="detail-table">' +
          (g.backup_timer ? '<tr><td>Backup</td><td>' + (g.backup_timer.active ? "✓" : "✗") + (g.backup_timer.next_run ? ' ' + esc(g.backup_timer.next_run) : '') + '</td></tr>' : '') +
          (g.upgrade_timer ? '<tr><td>Upgrade</td><td>' + (g.upgrade_timer.active ? "✓" : "✗") + (g.upgrade_timer.next_run ? ' ' + esc(g.upgrade_timer.next_run) : '') + '</td></tr>' : '') +
          (g.pending_timer ? '<tr><td>Deferred</td><td>' + (g.pending_timer.active ? "✓" : "✗") + (g.pending_timer.next_check ? ' ' + esc(g.pending_timer.next_check) : '') + '</td></tr>' : '') +
          (g.wp_cron ? '<tr><td>WP Cron</td><td>' + (g.wp_cron.active ? "✓" : "✗") + (g.wp_cron.next_run ? ' ' + esc(g.wp_cron.next_run) : '') + '</td></tr>' : '') +
          '</table></div>';
      }

      // ── Security ──
      if (g.ufw || g.fail2ban || g.modsecurity || g.maldet || g.site_integrity) {
        html += '<div class="detail-card"><h3>Security</h3><table class="detail-table">' +
          (g.ufw ? '<tr><td>UFW</td><td>' + (g.ufw.active ? "✓ Active" : "✗ Inactive") + ' (' + g.ufw.rules + ' rules)</td></tr>' : '') +
          (g.fail2ban ? '<tr><td>fail2ban</td><td>' + esc(Object.entries(g.fail2ban).map(([k,v]) => k + ":" + v).join(" ")) + '</td></tr>' : '') +
          (g.modsecurity ? '<tr><td>ModSec</td><td>' + (g.modsecurity.installed ? "✓ " + esc(g.modsecurity.engine) + " (" + g.modsecurity.rules + " rules, " + (g.modsecurity.recent_blocks||0) + " blocks)" : "✗ Not installed") + '</td></tr>' : '') +
          (g.maldet ? '<tr><td>Malware</td><td>' + (g.maldet.installed ? "✓ Installed" + (g.maldet.daily_scan ? " (daily)" : "") : "✗ Not installed") + '</td></tr>' : '') +
          (g.site_integrity ? '<tr><td>Integrity</td><td>' +
            (g.site_integrity.index_php ? "✓" : "✗") + ' index.php ' +
            (g.site_integrity.htaccess ? "✓" : "✗") + ' .htaccess ' +
            (g.site_integrity.homepage_code === 200 ? "✓" : "✗") + ' HTTP ' + g.site_integrity.homepage_code +
            '</td></tr>' : '') +
          (g.security_scan ? '<tr><td>Scan</td><td>' + (g.security_scan.ok ? "✓ Clean" : "⚠ Findings") + ' (' + (g.security_scan.findings||0) + ' findings)</td></tr>' : '') +
          '</table></div>';
      }

      // ── Status Lapses ──
      if (g.status_lapses && g.status_lapses.length > 0) {
        html += '<div class="detail-card"><h3>Status Lapses</h3>' +
          '<div style="margin-bottom:4px">' + barChart(g.status_lapses) + '</div>' +
          '<div style="font-size:10px;color:#64748b">' + lapseStats(g.status_lapses) + '</div>' +
          '</div>';
      }

    } else {
      html += '<div class="detail-card"><h3>GCM</h3><p style="color:#64748b;font-size:11px">No data — endpoint unreachable or unauthorized.</p></div>';
    }

    // MetaManager
    if (site.mm && !site.mm._error && (site.mm.plugin_version || site.mm.daemons)) {
      const m = site.mm;
      let daemonRows = "";
      if (m.daemons) {
        Object.entries(m.daemons).forEach(([name, d]) => {
          daemonRows += '<tr><td>' + esc(name) + '</td><td>' + (d.running ? "✓ pid " + d.pid : "✗ Down") + '</td></tr>';
        });
      }
      html += '<div class="detail-card"><h3>MetaManager</h3><table class="detail-table">' +
        (m.plugin_version ? '<tr><td>Plugin</td><td>v' + esc(m.plugin_version) + '</td></tr>' : '') +
        (m.daemon_version ? '<tr><td>Daemon</td><td>v' + esc(m.daemon_version) + '</td></tr>' : '') +
        daemonRows +
        (m.queues ? '<tr><td>Queues</td><td>compress:' + m.queues.compress + ' meta:' + m.queues.meta + ' done:' + m.queues.completed + ' fail:' + m.queues.failed + '</td></tr>' : '') +
        (m.tools ? '<tr><td>Tools</td><td>' + (Object.entries(m.tools).filter(([,v]) => !v).length ? "Missing: " + esc(Object.entries(m.tools).filter(([,v]) => !v).map(([k]) => k).join(", ")) : "✓ All available") + '</td></tr>' : '') +
        '</table></div>';
    } else {
      html += '<div class="detail-card"><h3>MetaManager</h3><p style="color:#64748b;font-size:11px">Not installed or endpoint unavailable on this site.</p></div>';
    }

    // MXRoute
    if (site.mxr && !site.mxr._error && (site.mxr.sent !== undefined || site.mxr.pending !== undefined)) {
      const x = site.mxr;
      const qClass = (x.failed||0) > 0 ? "crit" : (x.pending||0) > 0 ? "warn" : "ok";
      const pendingClass = (x.pending||0) > 0 ? "warn" : "ok";
      html += '<div class="detail-card"><h3>MXRoute Mailer</h3>' +
        '<div class="queue-stats">' +
          '<div class="queue-stat ok"><div class="num">' + (x.sent||0) + '</div><div class="lbl">Sent</div></div>' +
          '<div class="queue-stat ' + pendingClass + '"><div class="num">' + (x.pending||0) + '</div><div class="lbl">Pending</div></div>' +
          '<div class="queue-stat ' + qClass + '"><div class="num">' + (x.failed||0) + '</div><div class="lbl">Failed</div></div>' +
        '</div>' +
        (x.cron ? '<table class="detail-table" style="margin-top:6px">' +
          '<tr><td>Last Run</td><td>' + esc(x.cron.last_run) + '</td></tr>' +
          '<tr><td>Next Run</td><td>' + esc(x.cron.next_scheduled) + '</td></tr>' +
          '</table>' : '') +
        '</div>';
    } else {
      html += '<div class="detail-card"><h3>MXRoute Mailer</h3><p style="color:#64748b;font-size:11px">Not installed or endpoint unavailable on this site.</p></div>';
    }

    return html;
  }

  // ── Lightbox ──
  window._openLightbox = function(i) {
    const site = sites[i];
    document.getElementById("lightboxTitle").textContent = site.url;
    document.getElementById("lightboxContent").innerHTML = detailHtml(site);
    document.getElementById("lightboxOverlay").classList.add("open");
  };

  // ── Downtime History Lightbox ──
  window._openHistory = function(i) {
    const site = sites[i];
    document.getElementById("lightboxTitle").textContent = site.url + " — Downtime History";
    const incidents = site.incidents || [];
    const serverIncidents = (site.gcm && site.gcm.http_incidents) || [];
    let html = "";

    // ── Server-Detected Incidents (GCM HTTP response monitoring) ──
    html += '<div class="detail-card" style="grid-column:1/-1"><h3>Server-Detected Incidents</h3>';
    if (serverIncidents.length > 0) {
      const downCount = serverIncidents.filter(inc => inc.event === "down").length;
      const recCount = serverIncidents.filter(inc => inc.event === "recovered").length;
      html += '<div class="queue-stats" style="margin-bottom:8px">' +
        '<div class="queue-stat ' + (downCount > 0 ? "crit" : "ok") + '" style="flex:1"><div class="num">' + downCount + '</div><div class="lbl">Downtime</div></div>' +
        '<div class="queue-stat ok" style="flex:1"><div class="num">' + recCount + '</div><div class="lbl">Recoveries</div></div>' +
        '<div class="queue-stat ok" style="flex:1"><div class="num">' + serverIncidents.length + '</div><div class="lbl">Total Events</div></div>' +
        '</div>';
      html += '<table class="detail-table" style="width:100%">' +
        '<tr><th style="text-align:left;color:#64748b;font-size:10px;padding:4px 0">Time</th><th style="text-align:right;color:#64748b;font-size:10px;padding:4px 0">Event</th><th style="text-align:right;color:#64748b;font-size:10px;padding:4px 0">Response</th></tr>';
      serverIncidents.slice(-20).reverse().forEach(inc => {
        const t = new Date((inc.ts || 0) * 1000).toLocaleString();
        const ev = inc.event === "down" ? "Down" : "Recovered";
        const evColor = inc.event === "down" ? "var(--red, #ef4444)" : "var(--green, #22c55e)";
        const resp = inc.prev_code + " → " + inc.new_code;
        html += '<tr><td>' + esc(t) + '</td><td style="text-align:right;color:' + evColor + '">' + ev + '</td><td style="text-align:right">' + esc(resp) + '</td></tr>';
      });
      html += '</table>';
    } else {
      html += '<p style="color:#64748b;font-size:11px">No server-detected incidents. GCM monitors homepage HTTP response and logs changes here.</p>';
    }
    html += '</div>';

    // ── Browser-Detected Incidents (Web Monitor polling) ──
    html += '<div class="detail-card" style="grid-column:1/-1"><h3>Browser-Detected Incidents</h3>';
    if (incidents.length > 0) {
      const completed = incidents.filter(inc => inc.end);
      const ongoing = incidents.filter(inc => !inc.end);
      const totalMs = completed.reduce((s, inc) => s + (inc.end - inc.start), 0);
      const avgMin = completed.length ? (totalMs / completed.length / 60000).toFixed(1) : "0";
      const maxMin = completed.length ? Math.max(...completed.map(inc => (inc.end - inc.start) / 60000)).toFixed(1) : "0";

      html += '<div class="queue-stats" style="margin-bottom:8px">' +
        '<div class="queue-stat ' + (incidents.length > 0 ? "warn" : "ok") + '" style="flex:1"><div class="num">' + incidents.length + '</div><div class="lbl">Incidents</div></div>' +
        (ongoing.length ? '<div class="queue-stat crit" style="flex:1"><div class="num">' + ongoing.length + '</div><div class="lbl">Ongoing</div></div>' : '') +
        '<div class="queue-stat ok" style="flex:1"><div class="num">' + Math.round(totalMs / 60000) + 'm</div><div class="lbl">Total Down</div></div>' +
        '<div class="queue-stat ok" style="flex:1"><div class="num">' + avgMin + 'm</div><div class="lbl">Avg</div></div>' +
        '<div class="queue-stat ' + (parseFloat(maxMin) > 10 ? "crit" : parseFloat(maxMin) > 5 ? "warn" : "ok") + '" style="flex:1"><div class="num">' + maxMin + 'm</div><div class="lbl">Longest</div></div>' +
        '</div>';

      html += '<table class="detail-table" style="width:100%">' +
        '<tr><th style="text-align:left;color:#64748b;font-size:10px;padding:4px 0">Time Down</th><th style="text-align:left;color:#64748b;font-size:10px;padding:4px 0">Time Up</th><th style="text-align:right;color:#64748b;font-size:10px;padding:4px 0">Duration</th><th style="text-align:right;color:#64748b;font-size:10px;padding:4px 0">HTTP</th><th style="text-align:right;color:#64748b;font-size:10px;padding:4px 0">Status</th></tr>';

      incidents.slice(-20).reverse().forEach(inc => {
        const startStr = new Date(inc.start).toLocaleString();
        const endStr = inc.end ? new Date(inc.end).toLocaleString() : "—";
        const durMin = inc.end ? ((inc.end - inc.start) / 60000).toFixed(1) + "m" : "ongoing";
        const sev = !inc.end ? "crit" : (inc.end - inc.start) > 600000 ? "crit" : (inc.end - inc.start) > 300000 ? "warn" : "ok";
        const statusLabel = !inc.end ? "Down" : "Resolved";
        html += '<tr>' +
          '<td>' + esc(startStr) + '</td>' +
          '<td>' + esc(endStr) + '</td>' +
          '<td style="text-align:right">' + durMin + '</td>' +
          '<td style="text-align:right">' + esc(inc.httpCode) + '</td>' +
          '<td style="text-align:right;color:var(--' + sev + ',#f1f5f9)">' + statusLabel + '</td>' +
          '</tr>';
      });
      html += '</table>';
    } else {
      html += '<p style="color:#64748b;font-size:11px">No browser-detected incidents. The monitor polls every 60 seconds and records outages here.</p>';
    }
    html += '</div>';

    document.getElementById("lightboxContent").innerHTML = html;
    document.getElementById("lightboxOverlay").classList.add("open");
  };
  window.closeLightbox = function() {
    document.getElementById("lightboxOverlay").classList.remove("open");
  };

  // ── Render ──
  function render() {
    const container = document.getElementById("sites");
    container.innerHTML = sites.map((site, i) => cardHtml(site, i)).join("");
  }

  // ── Polling ──
  async function checkAll() {
    await Promise.all(sites.map((site, i) => checkSite(site, i)));
  }

  setInterval(() => {
    countdown--;
    if (countdown <= 0) { countdown = POLL_INTERVAL; checkAll(); }
    document.getElementById("countdown").textContent = countdown + "s";
  }, 1000);

  render();

  // Expose for manual triggering and testing
  window.checkAll = checkAll;
});
