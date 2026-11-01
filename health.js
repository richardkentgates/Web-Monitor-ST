// Site health rollup for GCM Web Monitor.
// An endpoint answering 404 means the component is not installed on that
// site (e.g. MetaManager intentionally inactive where a third-party image
// plugin is in use) — neutral, never counted as down.
function gcmHealthRollup(gcm, mm, mxr) {
  const installed = [];
  for (const [name, ep] of [["gcm", gcm], ["metamanager", mm], ["mxroute", mxr]]) {
    if (ep && ep._not_installed) continue;
    installed.push({ name, ok: ep && !ep._error });
  }
  if (installed.length === 0) return "Down";
  const okCount = installed.filter((e) => e.ok).length;
  if (okCount === installed.length) return "Up";
  if (okCount === 0) return "Down";
  return "Partial";
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { gcmHealthRollup };
}
