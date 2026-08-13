import { NextResponse } from "next/server";
import { schema } from "@puno/shared";
import { db } from "@/lib/db";
import { requireAccount } from "@/lib/auth";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

interface CreateAgentBody {
  vaultAddress: string;
  quoteToken: string;
  network: "mainnet" | "testnet";
  agentName: string;
  agentAddress: string;
  offChainLimits: {
    stopLossBps: number | null;
    takeProfitBps: number | null;
    maxReviewIntervalHours: number;
    priceMoveTriggerBps: number;
    maxCallsPerHour: number;
  };
}

/// Called once the wizard's on-chain steps (createVault, setPolicy,
/// setAgent) have all confirmed — this is the DB-side mirror of that vault,
/// which every read path (dashboard, agent detail) depends on. Never called
/// before the chain confirms; there's deliberately no "pending" row.
export async function POST(request: Request) {
  const auth = await requireAccount();
  if (!auth.ok) return auth.response;
  // The vault's owner is whoever is signed in — never a value the caller
  // supplies, or anyone could register vaults against someone else's account.
  const { address: ownerAddress, account } = auth;

  const body = (await request.json().catch(() => null)) as CreateAgentBody | null;
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const { vaultAddress, quoteToken, network, agentName, agentAddress, offChainLimits } = body;

  if (
    !vaultAddress ||
    !ADDRESS_RE.test(vaultAddress) ||
    !quoteToken ||
    !ADDRESS_RE.test(quoteToken) ||
    !agentAddress ||
    !ADDRESS_RE.test(agentAddress) ||
    (network !== "mainnet" && network !== "testnet") ||
    !agentName?.trim()
  ) {
    return NextResponse.json({ error: "missing or invalid fields" }, { status: 400 });
  }

  const [vault] = await db
    .insert(schema.vaults)
    .values({
      address: vaultAddress,
      ownerAddress: ownerAddress.toLowerCase(),
      quoteToken,
      network,
    })
    .returning();

  const [agent] = await db
    .insert(schema.agents)
    .values({
      accountId: account.id,
      vaultId: vault!.id,
      name: agentName.trim(),
      agentAddress,
      status: "armed",
      dryRun: true,
    })
    .returning();

  await db.insert(schema.limits).values({
    agentId: agent!.id,
    stopLossBps: offChainLimits.stopLossBps,
    takeProfitBps: offChainLimits.takeProfitBps,
    maxReviewIntervalHours: offChainLimits.maxReviewIntervalHours,
    priceMoveTriggerBps: offChainLimits.priceMoveTriggerBps,
    maxCallsPerHour: offChainLimits.maxCallsPerHour,
  });

  return NextResponse.json({ agentId: agent!.id });
}
