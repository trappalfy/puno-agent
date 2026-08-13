import test from "node:test";
import assert from "node:assert/strict";
import { evaluateBalance, evaluateRateLimit } from "./gate.js";

test("evaluateBalance allows a charge the balance covers", () => {
  const result = evaluateBalance(5, 0.5);
  assert.equal(result.allowed, true);
});

test("evaluateBalance blocks a charge the balance does not cover", () => {
  const result = evaluateBalance(0.4, 0.5);
  assert.equal(result.allowed, false);
  assert.ok(result.reason);
});

test("evaluateBalance allows spending the balance down to exactly zero", () => {
  const result = evaluateBalance(0.5, 0.5);
  assert.equal(result.allowed, true);
});

test("evaluateBalance blocks an empty or negative balance", () => {
  assert.equal(evaluateBalance(0, 0.01).allowed, false);
  assert.equal(evaluateBalance(-1, 0.01).allowed, false);
});

test("evaluateBalance allows a free action even at zero balance", () => {
  // BYOK waives model charges by passing a price of 0; that must not be
  // blocked by an empty balance.
  assert.equal(evaluateBalance(0, 0).allowed, true);
});

test("evaluateRateLimit allows calls under the hourly cap", () => {
  const result = evaluateRateLimit(5, 6);
  assert.equal(result.allowed, true);
});

test("evaluateRateLimit blocks at the hourly cap", () => {
  const result = evaluateRateLimit(6, 6);
  assert.equal(result.allowed, false);
  assert.ok(result.reason);
});

test("evaluateRateLimit blocks above the hourly cap", () => {
  const result = evaluateRateLimit(50, 6);
  assert.equal(result.allowed, false);
});
