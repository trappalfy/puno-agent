import { NextResponse } from "next/server";
import { schema, agentVaultAbi, getNetwork, whyClosed } from "@puno/shared";
import { db } from "@/lib/db";
import { requireAccount } from "@/lib/auth";
import { publicClientFor } from "@/lib/chain";
import { dryRunFromCreateBody } from "@/lib/dryRun";
import { createAgentVerdict, parseCreateAgentBody } from "@/lib/createAgent";

/// Called once the wizard's on-chain steps (createVault, setPolicy,
/// setAgent) have all confirmed — this is the DB-side mirror of that vault,
/// which every read path (dashboard, agent detail) depends on. Never called
/// before the chain confirms; there's deliberately no "pending" row.
export async function POST(request: Request) {
  const auth = await requireAccount();
  if (!auth.ok) return auth.response;
  // The vault's owner is whoever is signed in — never a value the caller
  // supplies, or anyone could register vaults against someone else's account.
  // That is only half of it: see the `owner()` read below for why the *vault*
  // address needs proving too.
  const { address: ownerAddress, account } = auth;

  const parsed = parseCreateAgentBody(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const body = parsed.value;

  const network = getNetwork(body.network);

  // The claimed network is checked against the chain, not trusted. Reading
  // `owner()` over *that* network's RPC is what makes both the ownership claim
  // and the network claim unforgeable in one call — see lib/createAgent.ts.
  let onChainOwner: string | null = null;
  try {
    const client = publicClientFor(network.key);
    const code = await client.getCode({ address: body.vaultAddress });
    if (code && code !== "0x") {
      onChainOwner = await client.readContract({
        address: body.vaultAddress,
        abi: agentVaultAbi,
        functionName: "owner",
      });
    }
  } catch {
    // Retryable, never a 400. By this point the vault is already deployed and
    // the user has already paid for every signature — telling them their vault
    // is invalid because our RPC blinked would be a lie about their money.
    return NextResponse.json(
      {
        error:
          `Couldn't reach ${network.name} to verify the vault. ` +
          `It is live on-chain — try again in a moment.`,
      },
      { status: 503 },
    );
  }

  const verdict = createAgentVerdict({
    whyClosed: whyClosed(network),
    sessionAddress: ownerAddress,
    onChainOwner,
    claimedAgentAddress: body.agentAddress,
    serviceAgent: network.serviceAgent,
    networkName: network.name,
  });
  if (!verdict.ok) {
    return NextResponse.json({ error: verdict.error }, { status: verdict.status });
  }

  const [vault] = await db
    .insert(schema.vaults)
    .values({
      address: body.vaultAddress,
      ownerAddress: ownerAddress.toLowerCase(),
      quoteToken: body.quoteToken,
      network: body.network,
    })
    .returning();

  const [agent] = await db
    .insert(schema.agents)
    .values({
      accountId: account.id,
      vaultId: vault!.id,
      name: body.agentName,
      agentAddress: body.agentAddress,
      status: "armed",
      // Was hardcoded `true`, which was not a safe default but a dead end:
      // no other write path to this column existed, so every agent the wizard
      // ever created was paper forever and the product could not execute a real
      // trade for anyone. See lib/dryRun.ts for why absence still means paper.
      dryRun: dryRunFromCreateBody(body.dryRun),
    })
    .returning();

  await db.insert(schema.limits).values({
    agentId: agent!.id,
    stopLossBps: body.offChainLimits.stopLossBps,
    takeProfitBps: body.offChainLimits.takeProfitBps,
    maxReviewIntervalHours: body.offChainLimits.maxReviewIntervalHours,
    priceMoveTriggerBps: body.offChainLimits.priceMoveTriggerBps,
    maxCallsPerHour: body.offChainLimits.maxCallsPerHour,
  });

  return NextResponse.json({ agentId: agent!.id });
}
