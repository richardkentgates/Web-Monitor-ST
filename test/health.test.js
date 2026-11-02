const { test } = require("node:test");
const assert = require("node:assert");
const { gcmHealthRollup } = require("../health.js");

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
