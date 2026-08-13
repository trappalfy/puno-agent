import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

// Set before importing: getSecret() reads process.env at call time, but keeping
// this above the import makes the dependency obvious to anyone adding a case.
process.env.SESSION_SECRET = "test-secret-that-is-definitely-long-enough";

const { createSessionToken, readSessionToken, createNonce } = await import("./session.js");

/**
 * These cover the tampering paths, not the happy path alone — this module is
 * the only thing standing between a request and someone else's account, so a
 * forged or expired token being *silently accepted* is the failure that
 * matters. Every rejection route returns null rather than throwing, so a bad
 * token can never be mistaken for an absent one.
 */
describe("session tokens", () => {
  it("round-trips an address, lowercased", () => {
    const token = createSessionToken("0xAbCdEf0123456789AbCdEf0123456789AbCdEf01");
    assert.equal(readSessionToken(token), "0xabcdef0123456789abcdef0123456789abcdef01");
  });

  it("rejects a token whose payload was edited", () => {
    const victim = "0x1111111111111111111111111111111111111111";
    const attacker = "0x2222222222222222222222222222222222222222";
    const token = createSessionToken(victim);
    const [, mac] = token.split(".");

    // Swap in a payload for a different address, keep the original signature.
    const forgedBody = Buffer.from(JSON.stringify({ a: attacker, t: Date.now() })).toString(
      "base64url",
    );
    assert.equal(readSessionToken(`${forgedBody}.${mac}`), null);
  });

  it("rejects a token signed with a different secret", () => {
    const token = createSessionToken("0x3333333333333333333333333333333333333333");
    const [body] = token.split(".");
    assert.equal(readSessionToken(`${body}.notavalidsignatureatall`), null);
  });

  it("rejects an expired token", () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const body = Buffer.from(
      JSON.stringify({ a: "0x4444444444444444444444444444444444444444", t: eightDaysAgo }),
    ).toString("base64url");
    // Sign it properly — expiry must be enforced independently of the signature.
    const mac = createHmac("sha256", Buffer.from(process.env.SESSION_SECRET!, "utf8"))
      .update(body)
      .digest("base64url");
    assert.equal(readSessionToken(`${body}.${mac}`), null);
  });

  it("rejects malformed input without throwing", () => {
    for (const bad of [undefined, "", "nodot", "a.b.c", "....", "!!!.???"]) {
      assert.equal(readSessionToken(bad as string | undefined), null, `input: ${String(bad)}`);
    }
  });
});

describe("nonces", () => {
  it("are 32 hex chars and do not repeat", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const n = createNonce();
      assert.match(n, /^[0-9a-f]{32}$/);
      assert.ok(!seen.has(n), "nonce repeated");
      seen.add(n);
    }
  });
});
