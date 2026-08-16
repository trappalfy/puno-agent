import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getNetwork } from "@puno/shared";
import { rpcUrlFor } from "./chain.js";

describe("rpcUrlFor", () => {
  it("falls back to the address recorded in the network config", () => {
    assert.equal(rpcUrlFor("mainnet", {}), getNetwork("mainnet").rpcUrl);
    assert.equal(rpcUrlFor("testnet", {}), getNetwork("testnet").rpcUrl);
  });

  it("honours a per-network override", () => {
    assert.equal(
      rpcUrlFor("mainnet", { RPC_URL_MAINNET: "https://paid.example" }),
      "https://paid.example",
    );
  });

  it("keeps the two networks' overrides separate", () => {
    const env = { RPC_URL_TESTNET: "https://only-testnet.example" };
    assert.equal(rpcUrlFor("testnet", env), "https://only-testnet.example");
    assert.equal(rpcUrlFor("mainnet", env), getNetwork("mainnet").rpcUrl);
  });

  it("ignores a bare RPC_URL", () => {
    // The regression lock. `RPC_URL` lives in the monorepo-root `.env` that
    // `next.config.ts` loads, and there it belongs to the worker — it means
    // "the one chain this process talks to". Honouring it here would aim both
    // networks' clients at a single node, and a wrong-chain read at a colliding
    // address returns data rather than failing.
    assert.equal(
      rpcUrlFor("mainnet", { RPC_URL: "http://127.0.0.1:8545" }),
      getNetwork("mainnet").rpcUrl,
    );
    assert.equal(
      rpcUrlFor("testnet", { RPC_URL: "http://127.0.0.1:8545" }),
      getNetwork("testnet").rpcUrl,
    );
  });

  it("treats an empty override as absent", () => {
    // `.env.example` ships keys with empty values; an empty string is a valid
    // string and would survive `??`, leaving the transport with no URL.
    assert.equal(rpcUrlFor("mainnet", { RPC_URL_MAINNET: "" }), getNetwork("mainnet").rpcUrl);
  });
});
