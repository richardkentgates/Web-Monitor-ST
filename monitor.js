document.addEventListener("DOMContentLoaded", () => {
  const POLL_INTERVAL = 60;
  let countdown = POLL_INTERVAL;

  function hideNotifButtonIfEnabled() {
    if (Notification.permission === "granted")
      document.getElementById("notifBtn").style.display = "none";
  }
  function enableNotifications() {
    const s = document.getElementById("notifStatus");
    s.innerHTML = "Notifications: <strong>Waiting\u2026</strong>";
    Notification.requestPermission().then(p => {
      if (p === "granted") { s.innerHTML = 'Notifications: <strong style="color:#4ade80">Enabled</strong>'; hideNotifButtonIfEnabled(); }
      else if (p === "denied") s.innerHTML = 'Notifications: <strong style="color:#f87171">Blocked</strong>';
      else s.innerHTML = "Notifications: <strong>Not enabled</strong>";
    });
  }
  function updateNotificationStatus() {
    const s = document.getElementById("notifStatus");
    if (Notification.permission === "granted") s.innerHTML = 'Notifications: <strong style="color:#4ade80">Enabled</strong>';
    else if (Notification.permission === "denied") s.innerHTML = 'Notifications: <strong style="color:#f87171">Blocked</strong>';
    else s.innerHTML = "Notifications: <strong>Not enabled</strong>";
    hideNotifButtonIfEnabled();
  }
  updateNotificationStatus();

  function normalize(site) {
    return { url: site.url||"", user: site.user||"", pass: site.pass||"", status: site.status||"Unknown",
             responseTime: site.responseTime||"N/A", lastChecked: site.lastChecked||"Never",
             gcm: site.gcm||null, mm: site.mm||null };
  }
  const rawSites = JSON.parse(localStorage.getItem("sites") || "[]");
  const sites = rawSites.map(normalize);
  function save() { localStorage.setItem("sites", JSON.stringify(sites)); render(); }

  function addSite() {
    const url = document.getElementById("urlInput").value.trim().replace(/\/+$/, "");
    const user = document.getElementById("userInput").value.trim();
    const pass = document.getElementById("passInput").value.trim();
    if (!url || !user || !pass) return;
    sites.push(normalize({ url, user, pass }));
    document.getElementById("urlInput").value = "";
    document.getElementById("userInput").value = "";
    document.getElementById("passInput").value = "";
    save();
  }
  function removeSite(i) { sites.splice(i, 1); save(); }

  function exportSites() {
    const blob = new Blob([JSON.stringify(sites, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "sites.json"; a.click();
    URL.revokeObjectURL(url);
  }
  function importSites() { document.getElementById("importFile").click(); }
  document.getElementById("importFile").addEventListener("change", function() {
    const file = this.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const imported = JSON.parse(e.target.result);
        if (Array.isArray(imported)) { sites.length = 0; imported.forEach(s => sites.push(normalize(s))); save(); }
      } catch { alert("Invalid JSON file"); }
    };
    reader.readAsText(file);
  });

  function formatUptime(s) {
    const d = Math.floor(s/86400), h = Math.floor((s%86400)/3600);
    return d > 0 ? d+"d "+h+"h" : h+"h "+Math.floor((s%3600)/60)+"m";
  }
  function esc(str) { const d = document.createElement("div"); d.appendChild(document.createTextNode(String(str))); return d.innerHTML; }

  async function fetchStatus(site, endpoint) {
    const cred = btoa(site.user + ":" + site.pass);
    try {
      const res = await fetch(site.url + "/wp-json/" + endpoint, { method: "GET", headers: { "Authorization": "Basic " + cred }, cache: "no-store" });
      if (!res.ok) return { _error: true, _code: res.status };
      return await res.json();
    } catch { return { _error: true, _code: "\u2014" }; }
  }

  async function checkSite(site, index) {
    const start = performance.now();
    const [gcm, mm] = await Promise.all([
      fetchStatus(site, "gcm/v1/status"),
      fetchStatus(site, "metamanager/v1/status")
    ]);
    const seconds = ((performance.now() - start) / 1000).toFixed(2);
    const gcmOk = gcm && !gcm._error;
    const mmOk = mm && !mm._error;
    let status = "Up";
    if (!gcmOk && !mmOk) status = "Down";
    else if (!gcmOk || !mmOk) status = "Partial";

    const prev = sites[index].status;
    if (prev !== "Unknown" && prev !== status && Notification.permission === "granted") {
      new Notification(site.url, { body: "Status: " + prev + " \u2192 " + status });
    }
    sites[index].status = status;
    sites[index].responseTime = seconds + "s";
    sites[index].lastChecked = new Date().toLocaleString();
    sites[index].gcm = gcmOk ? gcm : null;
    sites[index].mm = mmOk ? mm : null;
    save();
  }

  function openLightbox(i) {
    const site = sites[i];
    document.getElementById("lightboxTitle").textContent = site.url;
    let html = "";

    if (site.gcm) {
      const g = site.gcm;
      html += '<div class="detail-section"><h3>GCM</h3><table class="detail-table">';
      html += "<tr><td>Version</td><td>v" + esc(g.gcm_version||"\u2014") + " (" + esc(g.gcm_branch||"") + ")</td></tr>";
      html += "<tr><td>WordPress</td><td>v" + esc(g.wp_version||"\u2014") + "</td></tr>";
      html += "<tr><td>PHP</td><td>v" + esc(g.php_version||"\u2014") + "</td></tr>";
      if (g.wordpress_updates) html += "<tr><td>Updates</td><td>core:" + g.wordpress_updates.core + " plugins:" + g.wordpress_updates.plugins + " themes:" + g.wordpress_updates.themes + "</td></tr>";
      html += "</table></div>";

      html += '<div class="detail-section"><h3>System</h3><table class="detail-table">';
      html += "<tr><td>Uptime</td><td>" + esc(g.uptime_seconds ? formatUptime(g.uptime_seconds) : "\u2014") + "</td></tr>";
      if (g.load_avg) html += "<tr><td>Load</td><td>" + g.load_avg["1m"] + " / " + g.load_avg["5m"] + " / " + g.load_avg["15m"] + "</td></tr>";
      if (g.disk) html += "<tr><td>Disk</td><td>" + esc(g.disk.used) + " / " + esc(g.disk.total) + " (" + esc(g.disk.pct) + ")</td></tr>";
      if (g.memory) html += "<tr><td>Memory</td><td>" + esc(g.memory.used) + " / " + esc(g.memory.total) + "</td></tr>";
      if (g.swap) html += "<tr><td>Swap</td><td>" + esc(g.swap.used) + " / " + esc(g.swap.total) + "</td></tr>";
      html += "</table></div>";

      html += '<div class="detail-section"><h3>Services</h3><table class="detail-table">';
      html += "<tr><td>Apache</td><td>" + (g.apache && g.apache.running ? "\u2713 Running" : "\u2717 Down") + "</td></tr>";
      html += "<tr><td>MariaDB</td><td>" + (g.mariadb && g.mariadb.running ? "\u2713 Running" : "\u2717 Down") + "</td></tr>";
      html += "<tr><td>WordPress</td><td>" + (g.wordpress && g.wordpress.running ? "\u2713 Running" : "\u2717 Down") + "</td></tr>";
      if (g.ssl) html += "<tr><td>SSL</td><td>" + g.ssl.cert_days_left + " days left</td></tr>";
      html += "</table></div>";

      html += '<div class="detail-section"><h3>Timers</h3><table class="detail-table">';
      if (g.backup_timer) html += "<tr><td>Backup</td><td>" + (g.backup_timer.active ? "\u2713 Active" : "\u2717 Inactive") + (g.backup_timer.next_run ? " \u2014 " + esc(g.backup_timer.next_run) : "") + "</td></tr>";
      if (g.pending_timer) html += "<tr><td>Deferred Ops</td><td>" + (g.pending_timer.active ? "\u2713 Active" : "\u2717 Inactive") + (g.pending_timer.next_check ? " \u2014 " + esc(g.pending_timer.next_check) : "") + "</td></tr>";
      if (g.wp_cron) html += "<tr><td>WP Cron</td><td>" + (g.wp_cron.active ? "\u2713 Active" : "\u2717 Inactive") + (g.wp_cron.next_run ? " \u2014 " + esc(g.wp_cron.next_run) : "") + "</td></tr>";
      if (g.unattended_upgrades) html += "<tr><td>Unattended</td><td>" + (g.unattended_upgrades.active ? "\u2713 Active" : "\u2717 Inactive") + (g.unattended_upgrades.next_run ? " \u2014 " + esc(g.unattended_upgrades.next_run) : "") + "</td></tr>";
      html += "</table></div>";

      html += '<div class="detail-section"><h3>Security</h3><table class="detail-table">';
      if (g.ufw) html += "<tr><td>UFW</td><td>" + (g.ufw.active ? "\u2713 Active" : "\u2717 Inactive") + " (" + g.ufw.rules + " rules)</td></tr>";
      if (g.fail2ban) { const f2b = Object.entries(g.fail2ban).map(([k,v]) => k + ":" + v).join(" "); html += "<tr><td>fail2ban</td><td>" + esc(f2b) + "</td></tr>"; }
      if (g.modsecurity) html += "<tr><td>ModSecurity</td><td>" + (g.modsecurity.installed ? "\u2713 " + g.modsecurity.engine + " (" + g.modsecurity.rules + " rules)" : "\u2717 Not installed") + "</td></tr>";
      html += "</table></div>";

      if (g.reboot_required) html += '<div class="detail-section" style="border-color:var(--yellow)"><h3>Notice</h3><table class="detail-table"><tr><td>Reboot</td><td style="color:var(--yellow)">Required</td></tr></table></div>';
    } else {
      html += '<div class="detail-section"><h3>GCM</h3><p style="color:var(--text-muted);font-size:12px">No data \u2014 endpoint unreachable or unauthorized.</p></div>';
    }

    if (site.mm) {
      const m = site.mm;
      html += '<div class="detail-section"><h3>MetaManager</h3><table class="detail-table">';
      if (m.updater) html += "<tr><td>Daemon</td><td>v" + esc(m.updater.installed_version||"\u2014") + " (" + esc(m.updater.status||"") + ")</td></tr>";
      if (m.queues) html += "<tr><td>Queues</td><td>compress:" + m.queues.compress + " meta:" + m.queues.meta + " completed:" + m.queues.completed + " failed:" + m.queues.failed + "</td></tr>";
      if (m.daemons) {
        Object.entries(m.daemons).forEach(([name, d]) => {
          html += "<tr><td>" + esc(name) + "</td><td>" + (d.running ? "\u2713 Running (pid " + d.pid + ")" : "\u2717 Down") + "</td></tr>";
        });
      }
      if (m.tools) {
        const tools = Object.entries(m.tools).filter(([,v]) => !v).map(([k]) => k);
        html += "<tr><td>Tools</td><td>" + (tools.length ? "Missing: " + esc(tools.join(", ")) : "\u2713 All available") + "</td></tr>";
      }
      html += "</table></div>";
    } else {
      html += '<div class="detail-section"><h3>MetaManager</h3><p style="color:var(--text-muted);font-size:12px">No data \u2014 endpoint unreachable or unauthorized.</p></div>';
    }

    document.getElementById("lightboxContent").innerHTML = html;
    document.getElementById("lightboxOverlay").classList.add("open");
  }

  window.closeLightbox = function() {
    document.getElementById("lightboxOverlay").classList.remove("open");
  };

  function render() {
    const container = document.getElementById("sites");
    container.innerHTML = "";

    sites.forEach((site, i) => {
      const div = document.createElement("div");
      div.className = "site" + (site.status === "Down" ? " unreachable" : site.status === "Partial" ? " partial" : "");

      let badgeClass = "unknown";
      if (site.status === "Up") badgeClass = "up";
      else if (site.status === "Partial") badgeClass = "partial";
      else if (site.status === "Down") badgeClass = "down";

      let summaryHtml = "";
      if (site.gcm) {
        const g = site.gcm;
        summaryHtml += "<tr><td>GCM</td><td>v" + esc(g.gcm_version||"\u2014") + "</td></tr>";
        summaryHtml += "<tr><td>WP</td><td>v" + esc(g.wp_version||"\u2014") + "</td></tr>";
      }
      if (site.mm && site.mm.updater) {
        summaryHtml += "<tr><td>MetaMgr</td><td>v" + esc(site.mm.updater.installed_version||"\u2014") + "</td></tr>";
      }

      div.innerHTML =
        '<div class="site-header">' +
          '<strong>' + esc(site.url) + '</strong>' +
          '<span class="badge ' + badgeClass + '">' + site.status + '</span>' +
        '</div>' +
        (summaryHtml ? '<table class="site-table">' + summaryHtml + '</table>' : '') +
        '<div class="site-footer">' +
          '<span class="last-check">' + esc(site.lastChecked) + ' (' + esc(site.responseTime) + ')</span>' +
          '<div>' +
            '<button class="details-btn" onclick="window._openLightbox(' + i + ')">Details</button> ' +
            '<button class="remove-btn" onclick="window._removeSite(' + i + ')">Remove</button>' +
          '</div>' +
        '</div>';
      container.appendChild(div);
    });
  }

  async function checkAll() {
    await Promise.all(sites.map((site, i) => checkSite(site, i)));
  }

  setInterval(() => {
    countdown--;
    if (countdown <= 0) { countdown = POLL_INTERVAL; checkAll(); }
    document.getElementById("countdown").textContent = "Next check in: " + countdown + "s";
  }, 1000);

  render();

  window.enableNotifications = enableNotifications;
  window._openLightbox = openLightbox;
  window._removeSite = removeSite;
  window.exportSites = exportSites;
  window.importSites = importSites;
  window.addSite = addSite;

});
