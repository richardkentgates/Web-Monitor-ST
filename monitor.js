document.addEventListener("DOMContentLoaded", () => {

  const POLL_INTERVAL = 60;
  let countdown = POLL_INTERVAL;

  function hideNotifButtonIfEnabled() {
    if (Notification.permission === "granted") {
      document.getElementById("notifBtn").style.display = "none";
    }
  }

  function enableNotifications() {
    const statusEl = document.getElementById("notifStatus");
    statusEl.innerHTML = "Notifications: <strong>Waiting\u2026</strong>";

    Notification.requestPermission().then(permission => {
      if (permission === "granted") {
        statusEl.innerHTML = "Notifications: <strong style=\"color:#4ade80\">Enabled</strong>";
        hideNotifButtonIfEnabled();
      } else if (permission === "denied") {
        statusEl.innerHTML = "Notifications: <strong style=\"color:#f87171\">Blocked</strong>";
      } else {
        statusEl.innerHTML = "Notifications: <strong>Not enabled</strong>";
      }
    });
  }

  function updateNotificationStatus() {
    const statusEl = document.getElementById("notifStatus");

    if (Notification.permission === "granted") {
      statusEl.innerHTML = "Notifications: <strong style=\"color:#4ade80\">Enabled</strong>";
    } else if (Notification.permission === "denied") {
      statusEl.innerHTML = "Notifications: <strong style=\"color:#f87171\">Blocked</strong>";
    } else {
      statusEl.innerHTML = "Notifications: <strong>Not enabled</strong>";
    }

    hideNotifButtonIfEnabled();
  }

  updateNotificationStatus();

  function normalize(site) {
    return {
      url: site.url || "",
      user: site.user || "",
      pass: site.pass || "",
      status: site.status || "Unknown",
      httpCode: site.httpCode || "\u2014",
      gcm: site.gcm || {},
      mm: site.mm || {},
      lastChecked: site.lastChecked || "Never"
    };
  }

  const rawSites = JSON.parse(localStorage.getItem("sites") || "[]");
  const sites = rawSites.map(normalize);

  function save() {
    localStorage.setItem("sites", JSON.stringify(sites));
    render();
  }

  function addSite() {
    var url = document.getElementById("urlInput").value.trim().replace(/\/+$/, "");
    var user = document.getElementById("userInput").value.trim();
    var pass = document.getElementById("passInput").value.trim();
    if (!url || !user || !pass) return;
    sites.push(normalize({ url: url, user: user, pass: pass }));
    document.getElementById("urlInput").value = "";
    document.getElementById("userInput").value = "";
    document.getElementById("passInput").value = "";
    save();
  }

  function removeSite(i) {
    sites.splice(i, 1);
    save();
  }

  function exportSites() {
    var blob = new Blob([JSON.stringify(sites, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "monitor-sites.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function importSites() {
    document.getElementById("importFile").click();
  }

  document.getElementById("importFile").addEventListener("change", function() {
    var file = this.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var imported = JSON.parse(e.target.result);
        if (Array.isArray(imported)) {
          sites.length = 0;
          imported.forEach(function(s) { sites.push(normalize(s)); });
          save();
        }
      } catch (err) {
        alert("Invalid JSON file");
      }
    };
    reader.readAsText(file);
  });

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function formatUptime(seconds) {
    var days = Math.floor(seconds / 86400);
    var hours = Math.floor((seconds % 86400) / 3600);
    if (days > 0) return days + "d " + hours + "h";
    var mins = Math.floor((seconds % 3600) / 60);
    return hours + "h " + mins + "m";
  }

  async function fetchStatus(site, endpoint) {
    var url = site.url + "/wp-json/" + endpoint;
    var cred = btoa(site.user + ":" + site.pass);

    try {
      var res = await fetch(url, {
        method: "GET",
        headers: { "Authorization": "Basic " + cred },
        cache: "no-store"
      });
      if (!res.ok) return { error: true, code: res.status };
      var data = await res.json();
      return data;
    } catch (err) {
      return { error: true, code: "\u2014" };
    }
  }

  async function checkSite(site, index) {
    var start = performance.now();

    var results = await Promise.all([
      fetchStatus(site, "gcm/v1/status"),
      fetchStatus(site, "metamanager/v1/status")
    ]);

    var gcm = results[0];
    var mm = results[1];
    var end = performance.now();
    var seconds = ((end - start) / 1000).toFixed(2);

    var gcmError = gcm && gcm.error;
    var mmError = mm && mm.error;

    var status = "Up";
    if (gcmError && mmError) status = "Down";
    else if (gcmError || mmError) status = "Partial";

    var prevStatus = sites[index].status;
    if (prevStatus !== "Unknown" && prevStatus !== status) {
      if (Notification.permission === "granted") {
        new Notification(site.url, {
          body: "Status changed: " + prevStatus + " \u2192 " + status,
          icon: "icon.png"
        });
      }
    }

    sites[index].status = status;
    sites[index].httpCode = gcmError ? (gcm.code || "\u2014") : "200";
    sites[index].gcm = gcmError ? {} : gcm;
    sites[index].mm = mmError ? {} : mm;
    sites[index].lastChecked = new Date().toLocaleString();
    sites[index].responseTime = seconds + "s";
    save();
  }

  function render() {
    var container = document.getElementById("sites");
    container.innerHTML = "";

    sites.forEach(function(site, i) {
      var div = document.createElement("div");
      div.className = "site" + (site.status === "Down" ? " unreachable" : site.status === "Partial" ? " partial" : "");

      var gcmVersion = site.gcm.gcm_version || "\u2014";
      var gcmBranch = site.gcm.gcm_branch || "\u2014";
      var wpVersion = site.gcm.wp_version || "\u2014";
      var phpVersion = site.gcm.php_version || "\u2014";
      var mmVersion = site.mm.updater ? site.mm.updater.installed_version : "\u2014";
      var mmStatus = site.mm.updater ? site.mm.updater.status : "\u2014";
      var compressQ = site.mm.queues ? site.mm.queues.compress : "\u2014";
      var metaQ = site.mm.queues ? site.mm.queues.meta : "\u2014";
      var sslDays = site.gcm.ssl ? site.gcm.ssl.cert_days_left : "\u2014";
      var uptime = site.gcm.uptime_seconds ? formatUptime(site.gcm.uptime_seconds) : "\u2014";
      var disk = site.gcm.disk ? site.gcm.disk.pct : "\u2014";
      var memory = site.gcm.memory ? site.gcm.memory.used + "/" + site.gcm.memory.total : "\u2014";
      var load = site.gcm.load_avg ? site.gcm.load_avg["1m"] : "\u2014";

      var html = '<div class="site-header">';
      html += '<strong>' + escapeHtml(site.url) + '</strong>';
      html += '<span class="status-badge ' + site.status.toLowerCase() + '">' + site.status + '</span>';
      html += '</div>';

      html += '<table class="site-table">';
      if (gcmVersion !== "\u2014") {
        html += '<tr><td>GCM</td><td>v' + escapeHtml(gcmVersion) + ' (' + escapeHtml(gcmBranch) + ')</td></tr>';
        html += '<tr><td>WordPress</td><td>v' + escapeHtml(wpVersion) + '</td></tr>';
        html += '<tr><td>PHP</td><td>v' + escapeHtml(phpVersion) + '</td></tr>';
        html += '<tr><td>Uptime</td><td>' + escapeHtml(uptime) + '</td></tr>';
        html += '<tr><td>Disk</td><td>' + escapeHtml(disk) + '</td></tr>';
        html += '<tr><td>Memory</td><td>' + escapeHtml(memory) + '</td></tr>';
        html += '<tr><td>Load</td><td>' + escapeHtml(String(load)) + '</td></tr>';
        html += '<tr><td>SSL</td><td>' + escapeHtml(String(sslDays)) + ' days</td></tr>';
      }
      if (mmVersion !== "\u2014") {
        html += '<tr><td>MetaManager</td><td>v' + escapeHtml(mmVersion) + ' (' + escapeHtml(mmStatus) + ')</td></tr>';
        html += '<tr><td>Queues</td><td>compress: ' + escapeHtml(String(compressQ)) + ', meta: ' + escapeHtml(String(metaQ)) + '</td></tr>';
      }
      html += '</table>';

      html += '<div class="site-footer">';
      html += '<span class="last-check">Checked: ' + escapeHtml(site.lastChecked) + ' (' + escapeHtml(site.responseTime) + ')</span>';
      html += '<button class="remove-btn" onclick="removeSite(' + i + ')">Remove</button>';
      html += '</div>';

      div.innerHTML = html;
      container.appendChild(div);
    });
  }

  async function checkAll() {
    await Promise.all(
      sites.map(function(site, i) { return checkSite(site, i); })
    );
  }

  setInterval(function() {
    countdown--;
    if (countdown <= 0) {
      countdown = POLL_INTERVAL;
      checkAll();
    }
    document.getElementById("countdown").textContent = "Next check in: " + countdown + "s";
  }, 1000);

  render();

  window.enableNotifications = enableNotifications;
  window.addSite = addSite;
  window.removeSite = removeSite;
  window.exportSites = exportSites;
  window.importSites = importSites;

});
