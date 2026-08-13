import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { schema } from "@puno/shared";
import { db } from "@/lib/db";
import { requireAccount } from "@/lib/auth";
import { sumPositionsPnlUsd } from "@/lib/pnl";

// Wallet-as-login, now actually proven: the account comes from a signed
// session cookie issued after an EIP-4361 signature, not from an `owner`
// query param the caller could set to anyone's address.
export async function GET() {
  const auth = await requireAccount();
  if (!auth.ok) return auth.response;
  const { account } = auth;

  const rows = await db
    .select({
      id: schema.agents.id,
      name: schema.agents.name,
      status: schema.agents.status,
      dryRun: schema.agents.dryRun,
      agentAddress: schema.agents.agentAddress,
      lastTickAt: schema.agents.lastTickAt,
      lastActionAt: schema.agents.lastActionAt,
      vaultDbId: schema.vaults.id,
      vaultAddress: schema.vaults.address,
      network: schema.vaults.network,
    })
    .from(schema.agents)
    .innerJoin(schema.vaults, eq(schema.agents.vaultId, schema.vaults.id))
    .where(eq(schema.agents.accountId, account.id));

  const agents = await Promise.all(
    rows.map(async ({ vaultDbId, ...row }) => {
      const positions = await db
        .select()
        .from(schema.positions)
        .where(eq(schema.positions.vaultId, vaultDbId));
      const navUsd = positions.reduce((sum, p) => sum + Number(p.valueUsd), 0);
      const pnlUsd = sumPositionsPnlUsd(positions);
      return { ...row, navUsd, pnlUsd };
    }),
  );

  return NextResponse.json({
    account: { id: account.id, balanceUsd: Number(account.creditBalanceUsd) },
    agents,
  });
}
