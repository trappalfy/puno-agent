import type { Address } from "viem";

/**
 * Does the key this worker holds match the address its vaults are armed with?
 *
 * Every vault the wizard creates calls `setAgent(network.serviceAgent, expiry)`,
 * and `AgentVault` checks `msg.sender == agent` before any trade. So if the
 * worker's `AGENT_PRIVATE_KEY` derives to a different address, nothing is
 * misconfigured in a way anyone would notice quickly: the agent screens,
 * decides, pays for a decision, passes risk, and only then reverts on chain with
 * "not authorized" — per user, per tick, indefinitely. The user is billed for
 * the thinking either way.
 *
 * A failed boot is enormously cheaper than that, so main.ts turns a mismatch
 * into a refusal to start.
 *
 * Returned as a message rather than thrown so the check stays a pure function:
 * the caller decides whether a given combination is fatal, and the wording can
 * be asserted in a test instead of a stack trace.
 */
export function serviceAgentMismatch(
  configured: Address | null,
  workerAddress: Address | null,
  opts: { dryRun: boolean },
): string | null {
  // Nothing to arm against. The wizard already refuses to create agents on a
  // network with no serviceAgent, so this is a worker pointed at a network that
  // is not open for business — not an error in itself.
  if (!configured) return null;

  if (!workerAddress) {
    // Live with no key is caught earlier, in config.ts. In paper mode there is
    // genuinely nothing to check: no key is needed because nothing is signed.
    return opts.dryRun
      ? null
      : `No AGENT_PRIVATE_KEY, but this network arms vaults with ${configured}.`;
  }

  if (workerAddress.toLowerCase() !== configured.toLowerCase()) {
    return (
      `AGENT_PRIVATE_KEY derives to ${workerAddress}, but vaults on this network ` +
      `are armed with ${configured}. Every trade would revert with "not authorized". ` +
      `Either point the worker at the right key, or update serviceAgent in ` +
      `packages/shared/src/network/config.ts if the key was rotated.`
    );
  }

  return null;
}
