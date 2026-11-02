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

if (typeof module !== "undefined" && module.exports) {
  module.exports = { gcmHealthRollup };
}
