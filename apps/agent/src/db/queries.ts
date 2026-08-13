import { and, desc, eq } from "drizzle-orm";
import { schema } from "@puno/shared";
import { db } from "./client.js";

export interface AgentContext {
  agent: typeof schema.agents.$inferSelect;
  vault: typeof schema.vaults.$inferSelect;
  limits: typeof schema.limits.$inferSelect | null;
}

export async function getAgentContext(agentId: string): Promise<AgentContext | null> {
  const [agent] = await db
    .select()
    .from(schema.agents)
    .where(eq(schema.agents.id, agentId))
    .limit(1);
  if (!agent) return null;

  const [vault] = await db
    .select()
    .from(schema.vaults)
    .where(eq(schema.vaults.id, agent.vaultId))
    .limit(1);
  if (!vault) return null;

  const [limitsRow] = await db
    .select()
    .from(schema.limits)
    .where(eq(schema.limits.agentId, agentId))
    .limit(1);

  return { agent, vault, limits: limitsRow ?? null };
}

export async function getPositionsWithEntryPrices(
  vaultId: string,
): Promise<(typeof schema.positions.$inferSelect)[]> {
  return db.select().from(schema.positions).where(eq(schema.positions.vaultId, vaultId));
}

export interface LatestSignalContext {
  createdAt: Date;
  pricesByToken: Map<string, number>;
}

/// marketSnapshot on the most recent signal row doubles as "prices the last
/// time L1 looked at this agent" — reused by triggers.ts to detect
/// significant moves since that read, without a dedicated snapshot table.
export async function getLatestSignalContext(agentId: string): Promise<LatestSignalContext | null> {
  const [row] = await db
    .select({ createdAt: schema.signals.createdAt, marketSnapshot: schema.signals.marketSnapshot })
    .from(schema.signals)
    .where(eq(schema.signals.agentId, agentId))
    .orderBy(desc(schema.signals.createdAt))
    .limit(1);
  if (!row) return null;

  const snapshot = row.marketSnapshot as { token: string; priceUsd: number }[] | null;
  const pricesByToken = new Map<string, number>();
  for (const entry of snapshot ?? []) {
    pricesByToken.set(entry.token.toLowerCase(), entry.priceUsd);
  }
  return { createdAt: row.createdAt, pricesByToken };
}

export async function getLastL1CallTime(agentId: string): Promise<Date | null> {
  const [row] = await db
    .select({ createdAt: schema.modelCalls.createdAt })
    .from(schema.modelCalls)
    .where(
      and(
        eq(schema.modelCalls.agentId, agentId),
        eq(schema.modelCalls.level, "L1"),
        eq(schema.modelCalls.purpose, "decision"),
      ),
    )
    .orderBy(desc(schema.modelCalls.createdAt))
    .limit(1);
  return row?.createdAt ?? null;
}
