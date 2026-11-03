const { test } = require("node:test");
const assert = require("node:assert");
const { gcmHealthRollup, gcmFmtServerTime } = require("../health.js");

const ok = { backup_timer: {} };
const err = { _error: true, _code: 500 };
const absent = { _not_installed: true, _code: 404 };

test("all three healthy is Up", () => {
  assert.strictEqual(gcmHealthRollup(ok, ok, ok), "Up");
});

test("missing component (404) is Partial — detection is the contract", () => {
  assert.strictEqual(gcmHealthRollup(ok, absent, ok), "Partial");
});

test("two missing components is Partial", () => {
  assert.strictEqual(gcmHealthRollup(ok, absent, absent), "Partial");
});

test("one failing installed component is Partial", () => {
  assert.strictEqual(gcmHealthRollup(ok, err, ok), "Partial");
});

test("failing alongside missing is Partial", () => {
  assert.strictEqual(gcmHealthRollup(ok, absent, err), "Partial");
});

test("all components failing is Down", () => {
  assert.strictEqual(gcmHealthRollup(err, err, err), "Down");
});

test("gcm failing and the rest missing is Down", () => {
  assert.strictEqual(gcmHealthRollup(err, absent, absent), "Down");
});

test("missing endpoints count as failing", () => {
  assert.strictEqual(gcmHealthRollup(undefined, undefined, undefined), "Down");
});

test("all components not-detected is Down (zero healthy), not Up", () => {
  assert.strictEqual(gcmHealthRollup(absent, absent, absent), "Down");
});

test("a missing component alongside healthy ones is Partial, never Up", () => {
  assert.strictEqual(gcmHealthRollup(ok, ok, absent), "Partial");
});

// ── gcmFmtServerTime — server strings convert to browser time for display ──

const tz = { name: "Etc/UTC", offset: "+0000" };

test("converts a server-local string to browser time with tz label", () => {
  const out = gcmFmtServerTime("2026-11-03 09:00:29", tz);
  const expected = new Date("2026-11-03T09:00:29+00:00").toLocaleString() + " (Etc/UTC)";
  assert.strictEqual(out, expected);
});

test("parses weekday-prefixed timer strings", () => {
  const out = gcmFmtServerTime("Tue 2026-11-03 16:02:00 UTC", tz);
  const expected = new Date("2026-11-03T16:02:00+00:00").toLocaleString() + " (Etc/UTC)";
  assert.strictEqual(out, expected);
});

test("honors a non-UTC offset", () => {
  const out = gcmFmtServerTime("2026-11-03 09:00:00", { name: "America/Chicago", offset: "-0600" });
  const expected = new Date("2026-11-03T09:00:00-06:00").toLocaleString() + " (America/Chicago)";
  assert.strictEqual(out, expected);
});

test("missing timezone passes the string through unchanged", () => {
  assert.strictEqual(gcmFmtServerTime("2026-11-03 09:00:29", undefined), "2026-11-03 09:00:29");
  assert.strictEqual(gcmFmtServerTime("2026-11-03 09:00:29", {}), "2026-11-03 09:00:29");
});

test("unusable offset or unparseable string passes through — never a wrong guess", () => {
  assert.strictEqual(gcmFmtServerTime("2026-11-03 09:00:29", { name: "X", offset: "UTC" }), "2026-11-03 09:00:29");
  assert.strictEqual(gcmFmtServerTime("not a time", tz), "not a time");
  assert.strictEqual(gcmFmtServerTime("", tz), "");
});
