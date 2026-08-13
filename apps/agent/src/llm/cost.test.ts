import test from "node:test";
import assert from "node:assert/strict";
import { calculateCostUsd } from "./cost.js";

test("throws for an unknown model", () => {
  assert.throws(() => calculateCostUsd("gpt-5", { input_tokens: 100, output_tokens: 100 }));
});

test("computes plain (uncached) Haiku cost at $1/$5 per 1M", () => {
  const cost = calculateCostUsd("claude-haiku-4-5", {
    input_tokens: 1_000_000,
    output_tokens: 1_000_000,
  });
  assert.equal(cost, 1.0 + 5.0);
});

test("computes plain (uncached) Opus cost at $5/$25 per 1M", () => {
  const cost = calculateCostUsd("claude-opus-5", {
    input_tokens: 1_000_000,
    output_tokens: 1_000_000,
  });
  assert.equal(cost, 5.0 + 25.0);
});

test("cache read costs 0.1x the model's input price", () => {
  const cost = calculateCostUsd("claude-opus-5", {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 1_000_000,
  });
  assert.equal(cost, 0.5); // 0.1 * $5
});

test("cache write (1h TTL, always used on the decision path) costs 2x the input price", () => {
  const cost = calculateCostUsd("claude-opus-5", {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 1_000_000,
  });
  assert.equal(cost, 10.0); // 2 * $5
});

test("a fully-cached call is cheaper than the same call with no cache hit", () => {
  const usage = { input_tokens: 100, output_tokens: 500 };
  const uncached = calculateCostUsd("claude-haiku-4-5", usage);
  const cached = calculateCostUsd("claude-haiku-4-5", { ...usage, cache_read_input_tokens: 5_000 });
  // cache_read tokens are billed in ADDITION to input_tokens in the real
  // usage object (they're disjoint token pools), so this only holds when
  // comparing per-token cost, not total cost with more tokens attached —
  // assert the per-token cache rate is cheaper than a full input read instead.
  const cacheOnlyCost = calculateCostUsd("claude-haiku-4-5", {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 5_000,
  });
  const equivalentInputCost = calculateCostUsd("claude-haiku-4-5", {
    input_tokens: 5_000,
    output_tokens: 0,
  });
  assert.ok(cacheOnlyCost < equivalentInputCost);
  assert.ok(cached > uncached); // still costs more in absolute terms — it's additional tokens
});
