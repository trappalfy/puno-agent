import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { schema } from "@puno/shared";
import { db } from "@/lib/db";
import { requireAccount } from "@/lib/auth";
import { dryRunFromPatchBody } from "@/lib/dryRun";

/// Resolves an agent and proves the caller owns the vault behind it. Both
/// handlers below need exactly this, and a second copy of an ownership check is
/// how one of them eventually ends up missing it.
async function loadOwnedAgent(id: string) {
  const auth = await requireAccount();
  if (!auth.ok) return { ok: false as const, response: auth.response };
  const owner = auth.address;

  const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.id, id)).limit(1);
  if (!agent) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "not found" }, { status: 404 }),
    };
  }

  const [vault] = await db
    .select()
    .from(schema.vaults)
    .where(eq(schema.vaults.id, agent.vaultId))
    .limit(1);
  if (!vault) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "not found" }, { status: 404 }),
    };
  }

  // The session proves who is asking; this proves the vault is theirs.
  if (vault.ownerAddress.toLowerCase() !== owner.toLowerCase()) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "not the vault owner" }, { status: 403 }),
    };
  }

  return { ok: true as const, agent, vault };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owned = await loadOwnedAgent(id);
  if (!owned.ok) return owned.response;
  const { agent, vault } = owned;

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

/// The only write path to an agent row, and it writes exactly one column.
///
/// Before this there was none at all: `dryRun` was set to `true` at creation
/// and nothing could ever change it, so an owner who wanted their agent to
/// trade for real had no route to it short of deploying a second vault and
/// paying for every signature again.
///
/// What this grants is narrower than it looks. `runTick` ORs this column with
/// the worker's process-wide DRY_RUN and the per-run option, and `execute.ts`
/// checks the process flag last of all — so clearing this permits a live
/// broadcast, it does not command one. The operator's stop and the vault's own
/// `pause()` both still win, which is the property that makes this safe to hand
/// to the user in the first place.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owned = await loadOwnedAgent(id);
  if (!owned.ok) return owned.response;
  const { agent } = owned;

  // Unreachable today — a trial agent sits on the shared demo vault, so the
  // ownership check above has already refused it. Kept because the consequence
  // if that ever stops being true is someone broadcasting real trades from a
  // vault they do not own, and this costs two lines.
  if (agent.kind === "trial") {
    return NextResponse.json({ error: "the trial agent cannot trade live" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { dryRun?: unknown } | null;
  // Strict here, unlike the create route — lib/dryRun.ts explains why the two
  // read the same field differently.
  const dryRun = dryRunFromPatchBody(body?.dryRun);
  if (dryRun === null) {
    return NextResponse.json({ error: "dryRun must be true or false" }, { status: 400 });
  }

  await db
    .update(schema.agents)
    .set({ dryRun, updatedAt: new Date() })
    .where(eq(schema.agents.id, id));

  return NextResponse.json({ dryRun });
}
