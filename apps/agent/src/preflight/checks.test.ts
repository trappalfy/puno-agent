import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { TokenPrice } from "@puno/shared";
import {
  BANNED_ADDRESSES,
  ZERO_ADDRESS,
  checkBannedAddresses,
  checkBytecode,
  checkCreditsToken,
  checkGas,
  checkLedger,
  checkOwnership,
  checkQuoteToken,
  checkRate,
  checkTokenDecimals,
  checkTreasury,
  summarize,
  MIN_GAS_WEI,
} from "./checks.js";

const A = "0xAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaa";
const B = "0xBBBBbbbbBBBBbbbbBBBBbbbbBBBBbbbbBBBBbbbb";
const C = "0xCCCCccccCCCCccccCCCCccccCCCCccccCCCCcccc";
const now = new Date("2026-08-17T12:00:00.000Z");

const rate = (over: Partial<TokenPrice> = {}): TokenPrice => ({
  priceUsd: 0.000001,
  source: "override",
  at: new Date(now.getTime() - 3_600_000),
  usableForCredit: true,
  ...over,
});

/**
 * The distinction this whole file turns on. A two-state table collapses "we
 * could not find out" into the same silence as "there is nothing there", and the
 * first one is the state preflight exists to catch — so it must never reach the
 * verdict as a pass.
 */
describe("summarize", () => {
  it("does not call a run green when something was skipped", () => {
    const s = summarize([
      { name: "a", status: "pass", detail: "" },
      { name: "b", status: "skip", detail: "" },
    ]);
    assert.equal(s.green, false, "a skip is an unanswered question, not a pass");
  });

  it("does call a run green when the only non-passes are n/a", () => {
    const s = summarize([
      { name: "a", status: "pass", detail: "" },
      { name: "b", status: "na", detail: "" },
    ]);
    assert.equal(s.green, true);
    assert.equal(s.na, 1, "and still reports the count, so the reader sees the whole sentence");
  });

  it("never calls a run green with a failure, whatever else passed", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      name: `p${i}`,
      status: "pass" as const,
      detail: "",
    }));
    const s = summarize([...rows, { name: "bad", status: "fail", detail: "" }]);
    assert.equal(s.green, false);
  });
});

/**
 * The single highest-consequence row. Nothing else in the system calls
 * `decimals()`; a mismatch mis-credits every deposit by orders of magnitude, in
 * the direction of giving the service away, and nothing else would notice.
 */
describe("checkTokenDecimals", () => {
  it("fails on a mismatch and says how wrong the money would be", () => {
    const row = checkTokenDecimals({ token: A, configured: 18, onChain: 9 });
    assert.equal(row.status, "fail");
    assert.match(row.detail, /1,000,000,000×/);
  });

  it("passes when the chain agrees", () => {
    assert.equal(checkTokenDecimals({ token: A, configured: 18, onChain: 18 }).status, "pass");
  });

  it("is n/a with no token but skip when the token exists and the call failed", () => {
    // The pair that matters: mainnet before launch has no token, which is a fact
    // about sequencing. A deployed token whose decimals() would not answer is a
    // question nobody answered, and those must not read alike.
    assert.equal(checkTokenDecimals({ token: null, configured: 18, onChain: null }).status, "na");
    assert.equal(checkTokenDecimals({ token: A, configured: 18, onChain: null }).status, "skip");
  });
});

describe("checkOwnership", () => {
  const base = { credits: A, expectedOwner: B, isTestnet: false };

  it("fails while a transfer is still pending, because the hot key still controls it", () => {
    // Ownable2Step: transferOwnership names a pending owner and changes nothing.
    // Only acceptOwnership, called by that address, moves control.
    const row = checkOwnership({ ...base, owner: C, pendingOwner: B });
    assert.equal(row.status, "fail");
    assert.match(row.detail, /acceptOwnership/);
  });

  it("passes only once the handover is accepted", () => {
    const row = checkOwnership({ ...base, owner: B, pendingOwner: ZERO_ADDRESS });
    assert.equal(row.status, "pass");
  });

  it("fails on mainnet when PUNO_OWNER is not given, rather than passing quietly", () => {
    const row = checkOwnership({
      ...base,
      expectedOwner: null,
      owner: C,
      pendingOwner: ZERO_ADDRESS,
    });
    assert.equal(row.status, "fail");
    assert.match(row.detail, /PUNO_OWNER/);
  });

  it("is n/a on testnet, where there is no cold wallet and no real money", () => {
    const row = checkOwnership({
      credits: A,
      isTestnet: true,
      expectedOwner: null,
      owner: C,
      pendingOwner: ZERO_ADDRESS,
    });
    assert.equal(row.status, "na");
  });

  it("stays n/a on testnet even when PUNO_OWNER names someone else", () => {
    // One `.env` serves both networks, so the mainnet cold wallet has nowhere to
    // live except a variable the testnet run also reads. Failing there would make
    // the testnet verdict permanently red against a contract whose owner is the
    // deployer by design — and a red that everyone expects stops being read.
    const row = checkOwnership({
      credits: A,
      isTestnet: true,
      expectedOwner: B,
      owner: C,
      pendingOwner: ZERO_ADDRESS,
    });
    assert.equal(row.status, "na");
    assert.match(row.detail, /mainnet expectation/);
  });

  it("still fails a mainnet mismatch, which is the case that matters", () => {
    const row = checkOwnership({ ...base, owner: C, pendingOwner: ZERO_ADDRESS });
    assert.equal(row.status, "fail");
    assert.match(row.detail, /expects/);
  });

  it("compares addresses case-insensitively", () => {
    // Config is checksummed, JSON-RPC may not be, and an env var is whatever was
    // typed. Comparing as written is how a correct address reports as a mismatch.
    const row = checkOwnership({
      ...base,
      owner: B.toLowerCase(),
      pendingOwner: ZERO_ADDRESS,
      expectedOwner: B.toUpperCase().replace("0X", "0x"),
    });
    assert.equal(row.status, "pass");
  });
});

describe("checkTreasury", () => {
  it("fails when the treasury is the deployer, because its own deposits revert", () => {
    const row = checkTreasury({ credits: A, treasury: B, deployer: B, owner: C });
    assert.equal(row.status, "fail");
    assert.match(row.detail, /deployer/);
  });

  it("fails when the treasury is the owner — one key receives and redirects", () => {
    const row = checkTreasury({ credits: A, treasury: C, deployer: B, owner: C });
    assert.equal(row.status, "fail");
    assert.match(row.detail, /owner/);
  });

  it("fails on the zero address", () => {
    assert.equal(
      checkTreasury({ credits: A, treasury: ZERO_ADDRESS, deployer: B, owner: C }).status,
      "fail",
    );
  });

  it("still catches a deployer collision through different casing", () => {
    const row = checkTreasury({ credits: A, treasury: B.toLowerCase(), deployer: B, owner: C });
    assert.equal(row.status, "fail");
  });

  it("skips rather than passes when the deployer was not supplied", () => {
    const row = checkTreasury({ credits: A, treasury: B, deployer: null, owner: C });
    assert.equal(row.status, "skip", "unproven is not proven");
  });
});

/**
 * The one check that exists because of the 2026-08-13 clipboard hijack. A human
 * comparing a pasted address against what they meant to paste is comparing two
 * copies of the same substituted string, so this has to be mechanical.
 */
describe("checkBannedAddresses", () => {
  it("catches the attacker's address wherever it appears", () => {
    const attacker = BANNED_ADDRESSES[1]!;
    const row = checkBannedAddresses([
      { label: "config.punoToken", address: A },
      { label: "chain PunoCredits.treasury", address: attacker },
    ]);
    assert.equal(row.status, "fail");
    assert.match(row.detail, /STOP/);
    assert.match(row.detail, /treasury/, "and says which field, so it can be acted on");
  });

  it("catches the old deployer too, and through lowercased casing", () => {
    const row = checkBannedAddresses([
      { label: "env DEPLOYER_ADDRESS", address: BANNED_ADDRESSES[0]!.toLowerCase() },
    ]);
    assert.equal(row.status, "fail");
  });

  it("passes on clean addresses and counts what it looked at", () => {
    const row = checkBannedAddresses([
      { label: "a", address: A },
      { label: "b", address: B },
      { label: "absent", address: null },
    ]);
    assert.equal(row.status, "pass");
    assert.match(row.detail, /2 address/, "nulls are not counted as checked");
  });
});

describe("checkRate", () => {
  it("fails when a rate exists but is too stale to credit against", () => {
    // The state the two windows created: fresh enough for the public pricing page,
    // too old to value a deposit. Billing has stopped and every page looks right.
    const row = checkRate(rate({ usableForCredit: false }), now);
    assert.equal(row.status, "fail");
    assert.match(row.detail, /set-rate/);
  });

  it("fails when no rate was ever set", () => {
    assert.equal(checkRate(null, now).status, "fail");
  });

  it("passes a fresh rate and reports its age and source", () => {
    const row = checkRate(rate(), now);
    assert.equal(row.status, "pass");
    assert.match(row.detail, /1\.0h old/);
    assert.match(row.detail, /override/);
  });
});

describe("checkLedger", () => {
  it("fails on drift and names the accounts", () => {
    const row = checkLedger({
      balanced: false,
      accountsChecked: 3,
      drifted: [{ accountId: "acct_7" }],
    });
    assert.equal(row.status, "fail");
    assert.match(row.detail, /acct_7/);
  });

  it("passes an empty database — nothing to reconcile is not a failure", () => {
    assert.equal(checkLedger({ balanced: true, accountsChecked: 0, drifted: [] }).status, "pass");
  });

  it("skips when the query itself failed", () => {
    assert.equal(checkLedger(null).status, "skip");
  });
});

describe("checkBytecode", () => {
  it("separates the three ways an address can fail to hold a contract", () => {
    assert.equal(checkBytecode("x", null, null).status, "na", "not deployed here");
    assert.equal(checkBytecode("x", A, null).status, "skip", "RPC would not say");
    assert.equal(checkBytecode("x", A, false).status, "fail", "address holds no code");
    assert.equal(checkBytecode("x", A, true).status, "pass");
  });
});

describe("checkGas", () => {
  it("fails an empty address, which cannot transact at all", () => {
    const row = checkGas("worker", A, 0n);
    assert.equal(row.status, "fail");
    assert.match(row.detail, /no ETH/);
  });

  it("fails below the floor without rounding the balance up to it", () => {
    // One wei short. `toFixed` rounded this to "0.001000 ETH, under the 0.001
    // floor" — a sentence that contradicts itself exactly where someone is
    // deciding whether to send more ETH. Balances are truncated, never rounded.
    const row = checkGas("worker", A, MIN_GAS_WEI - 1n);
    assert.equal(row.status, "fail");
    assert.match(row.detail, /0\.000999 ETH/);
    assert.doesNotMatch(row.detail, /holds 0\.001000/);
  });

  it("passes at the floor exactly", () => {
    assert.equal(checkGas("worker", A, MIN_GAS_WEI).status, "pass");
  });
});

describe("checkCreditsToken and checkQuoteToken", () => {
  it("fails a credits contract pointing at a token the config does not know", () => {
    const row = checkCreditsToken({ credits: A, configuredToken: B, onChainToken: C });
    assert.equal(row.status, "fail");
    assert.match(row.detail, /redeploy/, "the field is immutable, so this is not a config fix");
  });

  it("fails when the contract has a token and the config has null", () => {
    const row = checkCreditsToken({ credits: A, configuredToken: null, onChainToken: C });
    assert.equal(row.status, "fail");
  });

  it("passes a factory quoting the configured USDG, whatever the casing", () => {
    const row = checkQuoteToken({ factory: A, configuredUsdg: B, onChain: B.toLowerCase() });
    assert.equal(row.status, "pass");
  });

  it("fails a factory quoting something else", () => {
    assert.equal(checkQuoteToken({ factory: A, configuredUsdg: B, onChain: C }).status, "fail");
  });
});
