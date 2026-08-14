import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decisionOutputFormat,
  screenOutputFormat,
  RISK_FLAG_MAX,
  RISK_FLAGS_MAX,
  THESIS_MAX,
  SCREEN_REASON_MAX,
} from "./schemas.js";

const validDecision = {
  action: "buy",
  ticker: "AAPL",
  sizePct: 10,
  confidence: 0.45,
  thesis: "Momentum after the gap up.",
  riskFlags: ["concentration"],
};

function parseDecision(payload: Record<string, unknown>) {
  return decisionOutputFormat().parse(JSON.stringify({ ...validDecision, ...payload }));
}

describe("decisionOutputFormat", () => {
  it("passes a well-formed decision through untouched", () => {
    assert.deepEqual(parseDecision({}), validDecision);
  });

  // The bug this file exists for: on 2026-08-14 Haiku wrote a risk flag longer
  // than 64 characters and zodOutputFormat()'s hard safeParse threw away the
  // entire response — action, ticker, size and confidence included.
  it("clamps an over-long risk flag instead of discarding the decision", () => {
    const long = "s".repeat(RISK_FLAG_MAX + 40);
    const out = parseDecision({ riskFlags: ["ok", long] });
    assert.equal(out.riskFlags.length, 2);
    assert.equal(out.riskFlags[0], "ok");
    assert.equal(out.riskFlags[1]?.length, RISK_FLAG_MAX);
    assert.ok(out.riskFlags[1]?.endsWith("…"));
    // Everything that actually drives a trade survives intact.
    assert.equal(out.action, "buy");
    assert.equal(out.sizePct, 10);
  });

  it("clamps an over-long thesis", () => {
    const out = parseDecision({ thesis: "t".repeat(THESIS_MAX + 100) });
    assert.equal(out.thesis.length, THESIS_MAX);
    assert.ok(out.thesis.endsWith("…"));
  });

  it("drops risk flags past the array limit", () => {
    const flags = Array.from({ length: RISK_FLAGS_MAX + 3 }, (_, i) => `flag-${i}`);
    const out = parseDecision({ riskFlags: flags });
    assert.equal(out.riskFlags.length, RISK_FLAGS_MAX);
    assert.equal(out.riskFlags[0], "flag-0");
  });

  // A UTF-16 slice can split a surrogate pair, and Postgres rejects a lone
  // surrogate on the way into jsonb — a cosmetic overrun must not become a
  // write failure.
  it("never leaves a lone surrogate at the truncation point", () => {
    const flag = `${"a".repeat(RISK_FLAG_MAX - 2)}😀😀😀`;
    const out = parseDecision({ riskFlags: [flag] });
    const truncated = out.riskFlags[0] ?? "";
    assert.ok(truncated.length <= RISK_FLAG_MAX);
    assert.equal(JSON.parse(JSON.stringify(truncated)), truncated);
    assert.ok(!/[\uD800-\uDBFF]$/.test(truncated.slice(0, -1)));
  });

  // Length is cosmetic; meaning is not. These must still fail loudly.
  it("still rejects an unknown action", () => {
    assert.throws(() => parseDecision({ action: "short" }), /action/);
  });

  it("still rejects an out-of-range sizePct", () => {
    assert.throws(() => parseDecision({ sizePct: 140 }), /sizePct/);
  });

  it("still rejects a missing field", () => {
    const { ticker: _ticker, ...rest } = validDecision;
    assert.throws(() => decisionOutputFormat().parse(JSON.stringify(rest)), /ticker/);
  });

  it("reports non-JSON output as such", () => {
    assert.throws(() => decisionOutputFormat().parse("not json at all"), /not valid JSON/);
  });
});

describe("screenOutputFormat", () => {
  it("clamps an over-long reason", () => {
    const out = screenOutputFormat().parse(
      JSON.stringify({ escalate: true, reason: "r".repeat(SCREEN_REASON_MAX + 50) }),
    );
    assert.equal(out.escalate, true);
    assert.equal(out.reason.length, SCREEN_REASON_MAX);
  });

  it("still rejects a non-boolean escalate", () => {
    assert.throws(
      () => screenOutputFormat().parse(JSON.stringify({ escalate: "yes", reason: "ok" })),
      /escalate/,
    );
  });
});
