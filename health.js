// Site health rollup for GCM Web Monitor.
// Detection is the contract: ALL three components (gcm, metamanager,
// mxroute) must answer healthy for Up. A component that answers 404 is
// NOT DETECTED (not installed / not active) — the site is Partial, never
// silently promoted to Up. All failing = Down.
function gcmHealthRollup(gcm, mm, mxr) {
  const endpoints = [gcm, mm, mxr];
  const ok = endpoints.filter((ep) => ep && !ep._error && !ep._not_installed).length;
  if (ok === endpoints.length) return "Up";
  if (ok === 0) return "Down";
  return "Partial";
}

// Convert a server-reported local time string to browser time for display.
// The status report is never converted — the server sends its own local
// strings plus its timezone; only this function converts, only for display.
// tz = { name, offset } from the status report. Missing/unusable tz or an
// unparseable string passes through unchanged (never a wrong guess).
function gcmFmtServerTime(str, tz) {
  if (!str) return str;
  const off = tz && tz.offset;
  if (!off || !/^[+-][0-9]{4}$/.test(off)) return str;
  const m = String(str).match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/);
  if (!m) return str;
  const hhmmss = m[2].length === 5 ? m[2] + ":00" : m[2];
  const iso = m[1] + "T" + hhmmss + off.slice(0, 3) + ":" + off.slice(3);
  const d = new Date(iso);
  if (isNaN(d.getTime())) return str;
  return d.toLocaleString() + " (" + tz.name + ")";
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { gcmHealthRollup, gcmFmtServerTime };
}
