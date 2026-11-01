const { test } = require("node:test");
const assert = require("node:assert");
const { gcmHealthRollup } = require("../health.js");

const ok = { backup_timer: {} };
const err = { _error: true, _code: 500 };
const absent = { _not_installed: true, _code: 404 };

test("all installed and healthy is Up", () => {
  assert.strictEqual(gcmHealthRollup(ok, ok, ok), "Up");
});

test("not-installed component is neutral", () => {
  assert.strictEqual(gcmHealthRollup(ok, absent, ok), "Up");
});

test("two not-installed components is Up when the rest are healthy", () => {
  assert.strictEqual(gcmHealthRollup(ok, absent, absent), "Up");
});

test("one failing installed component is Partial", () => {
  assert.strictEqual(gcmHealthRollup(ok, err, ok), "Partial");
});

test("failing component alongside not-installed is Partial", () => {
  assert.strictEqual(gcmHealthRollup(ok, absent, err), "Partial");
});

test("all installed components failing is Down", () => {
  assert.strictEqual(gcmHealthRollup(err, err, err), "Down");
});

test("only installed component failing is Down", () => {
  assert.strictEqual(gcmHealthRollup(err, absent, absent), "Down");
});

test("missing endpoints count as failing", () => {
  assert.strictEqual(gcmHealthRollup(undefined, undefined, undefined), "Down");
});
