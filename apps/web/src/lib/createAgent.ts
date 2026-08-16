import { type NetworkKey } from "@puno/shared";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export interface ParsedCreateBody {
  vaultAddress: `0x${string}`;
  quoteToken: `0x${string}`;
  network: NetworkKey;
  agentName: string;
  agentAddress: `0x${string}`;
  dryRun: unknown;
  offChainLimits: {
    stopLossBps: number | null;
    takeProfitBps: number | null;
    maxReviewIntervalHours: number;
    priceMoveTriggerBps: number;
    maxCallsPerHour: number;
  };
}

function isAddress(v: unknown): v is `0x${string}` {
  return typeof v === "string" && ADDRESS_RE.test(v);
}

/// Shape-checks the request body and narrows `network` to a `NetworkKey`.
///
/// Split out from the route so the parsing rules can be tested without a
/// database, a session or a chain — and so the route reads as the three
/// decisions it actually makes rather than as a validation expression.
export function parseCreateAgentBody(
  body: unknown,
): { ok: true; value: ParsedCreateBody } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid body" };
  const b = body as Record<string, unknown>;

  if (!isAddress(b.vaultAddress)) return { ok: false, error: "vaultAddress must be an address" };
  if (!isAddress(b.quoteToken)) return { ok: false, error: "quoteToken must be an address" };
  if (!isAddress(b.agentAddress)) return { ok: false, error: "agentAddress must be an address" };
  if (b.network !== "mainnet" && b.network !== "testnet") {
    return { ok: false, error: "network must be mainnet or testnet" };
  }
  const agentName = typeof b.agentName === "string" ? b.agentName.trim() : "";
  if (!agentName) return { ok: false, error: "agentName is required" };

  const limits = b.offChainLimits;
  if (!limits || typeof limits !== "object") {
    return { ok: false, error: "offChainLimits is required" };
  }

  return {
    ok: true,
    value: {
      vaultAddress: b.vaultAddress,
      quoteToken: b.quoteToken,
      network: b.network,
      agentName,
      agentAddress: b.agentAddress,
      dryRun: b.dryRun,
      offChainLimits: limits as ParsedCreateBody["offChainLimits"],
    },
  };
}

export type CreateAgentVerdict = { ok: true } | { ok: false; status: number; error: string };

/**
 * Whether this account may register this vault.
 *
 * **This is the fix for a live authorization hole.** The route previously took
 * `vaultAddress` from the request body and wrote `ownerAddress` from the
 * session without ever asking the chain whether the two belonged together. Its
 * comment guarded the mirror-image case — someone else's account named as owner
 * of your vault — and nothing guarded this one.
 *
 * What that allowed, with only a legitimate sign-in of one's own wallet: POST
 * any vault address, including the shared demo vault or a stranger's, and get a
 * `vaults` row naming yourself as owner. Every read path authorizes on exactly
 * that column (`api/agents/[id]/route.ts`), agents default to `kind = 'live'`,
 * and `PATCH { dryRun: false }` then tells the worker to broadcast real trades
 * on a vault the caller does not own. The unique index on `(address, network)`
 * makes it a land-grab as well: first registrant wins.
 *
 * `owner()` read from the claimed network closes both halves at once — it
 * proves ownership *and* that the vault exists on the network the caller named,
 * because the same address on the other chain is either not a contract or a
 * different one whose owner is somebody else.
 */
export function createAgentVerdict(input: {
  /// `whyClosed()` for the claimed network; null means open.
  whyClosed: string | null;
  sessionAddress: string;
  /// `owner()` read from the claimed network, or null when nothing is deployed there.
  onChainOwner: string | null;
  claimedAgentAddress: string;
  serviceAgent: string | null;
  networkName: string;
}): CreateAgentVerdict {
  if (input.whyClosed !== null) {
    return { ok: false, status: 403, error: input.whyClosed };
  }
  if (input.onChainOwner === null) {
    return {
      ok: false,
      status: 400,
      error: `There is no vault at that address on ${input.networkName}.`,
    };
  }
  if (input.onChainOwner.toLowerCase() !== input.sessionAddress.toLowerCase()) {
    return { ok: false, status: 403, error: "That vault belongs to another wallet." };
  }
  // Compared, not re-read. The worker's own `guard()` catches on-chain drift,
  // and reading `agent()` here would race the `setAgent` receipt the wizard has
  // only just waited on.
  if (
    !input.serviceAgent ||
    input.claimedAgentAddress.toLowerCase() !== input.serviceAgent.toLowerCase()
  ) {
    return {
      ok: false,
      status: 400,
      error: `An agent on ${input.networkName} must be armed with Puno's worker key.`,
    };
  }
  return { ok: true };
}
