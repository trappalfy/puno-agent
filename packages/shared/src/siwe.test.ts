import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { verifyMessage } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { buildSiweMessage, isFreshIssuedAt, SIWE_MAX_AGE_MS, type SiweParams } from "./siwe.js";

const account = privateKeyToAccount(generatePrivateKey());

const base: SiweParams = {
  domain: "puno.app",
  address: account.address,
  uri: "https://puno.app",
  chainId: 46630,
  nonce: "0123456789abcdef0123456789abcdef",
  issuedAt: "2026-08-12T10:00:00.000Z",
};

/**
 * The server rebuilds this message from values it trusts and checks the
 * signature against *that*, so the security property under test is: change any
 * field the server pins, and verification must fail. Each case below is an
 * attack the rebuild-don't-parse design is meant to stop.
 */
describe("SIWE message signing", () => {
  it("verifies a signature over the exact message", async () => {
    const message = buildSiweMessage(base);
    const signature = await account.signMessage({ message });
    assert.equal(await verifyMessage({ address: account.address, message, signature }), true);
  });

  it("fails when the server pins a different nonce", async () => {
    const signature = await account.signMessage({ message: buildSiweMessage(base) });
    const rebuilt = buildSiweMessage({ ...base, nonce: "ffffffffffffffffffffffffffffffff" });
    assert.equal(
      await verifyMessage({ address: account.address, message: rebuilt, signature }),
      false,
    );
  });

  it("fails when the claimed address is not the signer", async () => {
    const other = privateKeyToAccount(generatePrivateKey());
    const message = buildSiweMessage(base);
    const signature = await account.signMessage({ message });
    assert.equal(await verifyMessage({ address: other.address, message, signature }), false);
  });

  it("fails when the chain id differs", async () => {
    const signature = await account.signMessage({ message: buildSiweMessage(base) });
    const rebuilt = buildSiweMessage({ ...base, chainId: 1 });
    assert.equal(
      await verifyMessage({ address: account.address, message: rebuilt, signature }),
      false,
    );
  });

  it("fails when the domain differs — a signature for another site is not reusable here", async () => {
    const signature = await account.signMessage({ message: buildSiweMessage(base) });
    const rebuilt = buildSiweMessage({ ...base, domain: "evil.example" });
    assert.equal(
      await verifyMessage({ address: account.address, message: rebuilt, signature }),
      false,
    );
  });

  it("states plainly that it authorises nothing", () => {
    const message = buildSiweMessage(base);
    assert.match(message, /does not approve any transaction, transfer, or trade/);
  });
});

describe("issuedAt freshness", () => {
  const now = Date.parse("2026-08-12T10:00:00.000Z");

  it("accepts a timestamp from just now", () => {
    assert.equal(isFreshIssuedAt(new Date(now).toISOString(), now), true);
  });

  it("accepts one inside the window", () => {
    assert.equal(isFreshIssuedAt(new Date(now - SIWE_MAX_AGE_MS + 1000).toISOString(), now), true);
  });

  it("rejects one past the window", () => {
    assert.equal(isFreshIssuedAt(new Date(now - SIWE_MAX_AGE_MS - 1000).toISOString(), now), false);
  });

  it("rejects one far in the future", () => {
    assert.equal(isFreshIssuedAt(new Date(now + 10 * 60_000).toISOString(), now), false);
  });

  it("tolerates a little clock skew forward", () => {
    assert.equal(isFreshIssuedAt(new Date(now + 30_000).toISOString(), now), true);
  });

  it("rejects garbage without throwing", () => {
    for (const bad of ["", "not-a-date", "12/08/2026"]) {
      assert.equal(isFreshIssuedAt(bad, now), false, `input: ${bad}`);
    }
  });
});
