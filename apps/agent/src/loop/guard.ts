import type { Address } from "viem";
import { publicClient } from "../chain/client.js";
import { readVaultIdentity, type VaultIdentity } from "../chain/vault.js";

export interface GuardResult {
  ok: boolean;
  rpcHealthy: boolean;
  reasons: string[];
  identity: VaultIdentity | null;
}

/// Plan 2.3 step 1. This worker only ever signs as the agent (never the
/// owner — the owner's key never leaves the user's wallet), so "ok" here
/// means specifically "this agent key may currently call executeTrade",
/// not "the vault is healthy in some general sense".
export async function guard(vault: Address, agentAddress: Address): Promise<GuardResult> {
  const reasons: string[] = [];
  let rpcHealthy = true;
  let identity: VaultIdentity | null = null;

  try {
    await publicClient.getBlockNumber();
  } catch (err) {
    rpcHealthy = false;
    reasons.push(`rpc unreachable: ${(err as Error).message}`);
  }

  if (rpcHealthy) {
    try {
      identity = await readVaultIdentity(vault);
    } catch (err) {
      reasons.push(`failed to read vault identity: ${(err as Error).message}`);
    }
  }

  if (identity) {
    if (identity.paused) reasons.push("vault is paused");
    if (identity.agent.toLowerCase() !== agentAddress.toLowerCase()) {
      reasons.push("configured agent address does not match vault.agent (revoked or reassigned)");
    } else {
      const nowSec = BigInt(Math.floor(Date.now() / 1000));
      if (identity.agentExpiry <= nowSec) reasons.push("agent key expired");
    }
  }

  return { ok: rpcHealthy && reasons.length === 0, rpcHealthy, reasons, identity };
}
