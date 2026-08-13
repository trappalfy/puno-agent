import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { schema } from "@puno/shared";
import { db } from "@/lib/db";
import { requireAccount } from "@/lib/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAccount();
  if (!auth.ok) return auth.response;
  const owner = auth.address;

  const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.id, id)).limit(1);
  if (!agent) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [vault] = await db
    .select()
    .from(schema.vaults)
    .where(eq(schema.vaults.id, agent.vaultId))
    .limit(1);
  if (!vault) return NextResponse.json({ error: "not found" }, { status: 404 });

  // The session proves who is asking; this proves the vault is theirs.
  if (vault.ownerAddress.toLowerCase() !== owner.toLowerCase()) {
    return NextResponse.json({ error: "not the vault owner" }, { status: 403 });
  }

  const [limits, positions, trades, signalRows] = await Promise.all([
    db
      .select()
      .from(schema.limits)
      .where(eq(schema.limits.agentId, id))
      .then((r) => r[0] ?? null),
    db.select().from(schema.positions).where(eq(schema.positions.vaultId, vault.id)),
    db
      .select()
      .from(schema.trades)
      .where(eq(schema.trades.agentId, id))
      .orderBy(desc(schema.trades.createdAt))
      .limit(50),
    db
      .select()
      .from(schema.signals)
      .where(eq(schema.signals.agentId, id))
      .orderBy(desc(schema.signals.createdAt))
      .limit(50),
  ]);

  // One extra query per signal is fine at this list size (<=50) and keeps
  // the accepted/rejected decision trail — the product's primary trust
  // mechanism per DESIGN.md's Reasoning Card — a plain 1:1 read rather than
  // a hand-rolled join across a nullable FK.
  const signals = await Promise.all(
    signalRows.map(async (signal) => {
      const [decision] = await db
        .select()
        .from(schema.decisions)
        .where(eq(schema.decisions.signalId, signal.id))
        .limit(1);
      return { ...signal, decision: decision ?? null };
    }),
  );

  const navUsd = positions.reduce((sum, p) => sum + Number(p.valueUsd), 0);

  return NextResponse.json({
    agent,
    vault,
    limits,
    positions,
    trades,
    signals,
    navUsd,
  });
}
