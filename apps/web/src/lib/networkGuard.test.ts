import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getNetwork } from "@puno/shared";
import { describeChain, networkGuardVerdict } from "./networkGuard.js";

const TESTNET = getNetwork("testnet").chainId;
const MAINNET = getNetwork("mainnet").chainId;
const ETHEREUM = 1;

describe("describeChain", () => {
  it("names our own chains", () => {
    assert.equal(describeChain(TESTNET), getNetwork("testnet").name);
    assert.equal(describeChain(MAINNET), getNetwork("mainnet").name);
  });

  it("falls back to the bare number for a chain we do not run", () => {
    // Never "mainnet". The old guard rendered a two-state badge, so a wallet on
    // Ethereum could only be described as one of ours — which is worse than
    // saying nothing, because the user would go looking for the wrong problem.
    assert.equal(describeChain(ETHEREUM), "chain 1");
  });

  it("says something for no chain at all", () => {
    assert.equal(describeChain(undefined), "no chain");
  });
});

describe("networkGuardVerdict", () => {
  it("passes a disconnected visitor through, whatever chain is reported", () => {
    // Every read is pinned to an explicit chainId now, so there is correct data
    // to show. Writes are gated by having no connector.
    for (const walletChainId of [undefined, TESTNET, MAINNET, ETHEREUM]) {
      const verdict = networkGuardVerdict({
        required: "testnet",
        isConnected: false,
        walletChainId,
      });
      assert.equal(verdict.state, "ok");
    }
  });

  it("passes when the wallet is on the required chain", () => {
    const verdict = networkGuardVerdict({
      required: "testnet",
      isConnected: true,
      walletChainId: TESTNET,
    });
    assert.equal(verdict.state, "ok");
  });

  it("asks to switch when the wallet is on our other chain", () => {
    // The case the whole per-surface rework exists for: one account holding a
    // testnet trial agent and a mainnet vault at the same time.
    const verdict = networkGuardVerdict({
      required: "testnet",
      isConnected: true,
      walletChainId: MAINNET,
    });
    assert.equal(verdict.state, "switch");
    assert.equal(verdict.state === "switch" && verdict.requiredChainId, TESTNET);
    assert.equal(verdict.state === "switch" && verdict.walletLabel, getNetwork("mainnet").name);
  });

  it("asks to switch from a chain we do not run, and names it honestly", () => {
    // The case the old guard got wrong in the other direction: useChainId()
    // cannot report chain 1, so a wallet on Ethereum passed as testnet.
    const verdict = networkGuardVerdict({
      required: "mainnet",
      isConnected: true,
      walletChainId: ETHEREUM,
    });
    assert.equal(verdict.state, "switch");
    assert.equal(verdict.state === "switch" && verdict.walletLabel, "chain 1");
  });

  it("treats a connected wallet reporting no chain as wrong, not as fine", () => {
    const verdict = networkGuardVerdict({
      required: "testnet",
      isConnected: true,
      walletChainId: undefined,
    });
    assert.equal(verdict.state, "switch");
  });
});
