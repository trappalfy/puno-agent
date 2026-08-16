import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_NETWORK, getNetwork } from "@puno/shared";
import { resolveSiweChainId, siweChainIdForWallet } from "./siweChain.js";

const TESTNET = getNetwork("testnet").chainId;
const MAINNET = getNetwork("mainnet").chainId;
const FALLBACK = getNetwork(DEFAULT_NETWORK).chainId;

describe("siweChainIdForWallet", () => {
  it("signs with the wallet's own chain when we run it", () => {
    assert.equal(siweChainIdForWallet(TESTNET), TESTNET);
    assert.equal(siweChainIdForWallet(MAINNET), MAINNET);
  });

  it("falls back rather than refusing on a chain we do not run", () => {
    // Signing in is a read gate. Demanding a chain switch before someone can
    // look at their own dashboard would cost a product step and buy nothing.
    assert.equal(siweChainIdForWallet(1), FALLBACK);
    assert.equal(siweChainIdForWallet(undefined), FALLBACK);
  });
});

describe("resolveSiweChainId", () => {
  it("accepts either of our chains", () => {
    // The mainnet case is the whole point: a user takes the free run on testnet
    // and then creates a paid vault on mainnet, crossing networks mid-journey.
    // Pinned to testnet, the second half of that could never sign in.
    assert.equal(resolveSiweChainId(TESTNET), TESTNET);
    assert.equal(resolveSiweChainId(MAINNET), MAINNET);
  });

  it("refuses a chain we do not run", () => {
    assert.equal(resolveSiweChainId(1), null);
    assert.equal(resolveSiweChainId(0), null);
  });

  it("refuses a chain id that is not an integer number", () => {
    // The injection guard, and the reason this is a test rather than a comment.
    // buildSiweMessage joins its fields with newlines, so a *string* chainId of
    // "46630\nURI: https://evil.example" would append lines to the very message
    // the server then verifies the signature against.
    assert.equal(resolveSiweChainId(String(TESTNET)), null);
    assert.equal(resolveSiweChainId(1.5), null);
    assert.equal(resolveSiweChainId(Number.NaN), null);
    assert.equal(resolveSiweChainId({}), null);
    assert.equal(resolveSiweChainId([TESTNET]), null);
    assert.equal(resolveSiweChainId(true), null);
  });

  it("falls back when the field is absent, so a stale tab still verifies", () => {
    assert.equal(resolveSiweChainId(undefined), FALLBACK);
    assert.equal(resolveSiweChainId(null), FALLBACK);
  });
});
