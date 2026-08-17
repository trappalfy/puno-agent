import { eq, sql, desc } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema.js";
import type { BillableEvent } from "../pricing.js";

/// Both apps/web and apps/agent debit the same balance, so this lives in shared
/// and takes the caller's drizzle instance rather than importing one. They point
/// at the same database; two divergent copies of this logic would eventually
/// disagree about what someone owes.
///
/// Typed against the driver-agnostic base so the same code runs on postgres-js
/// in production and on an in-process PGlite instance under test — the money
/// paths are only worth testing against real Postgres semantics (transactions,
/// partial unique indexes, FOR UPDATE), not a mock.
export type CreditsDb = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface ChargeResult {
  ok: boolean;
  /// Balance after the operation. On failure, the balance that was insufficient.
  balanceUsd: number;
  /// True when this exact (refType, refId) had already been charged and the
  /// call was a no-op. Callers treat it as success — it means a retry, not a
  /// second sale.
  alreadyCharged: boolean;
  reason: string | null;
}

function toNumber(value: string | number): number {
  return typeof value === "number" ? value : Number(value);
}

/// Money arithmetic stays in Postgres `numeric` throughout. Doing `balance -
/// price` in JavaScript would introduce binary-float error into a value that is
/// summed over thousands of rows and reconciled against a ledger.
function addUsd(column: unknown, amountUsd: number) {
  return sql`${column} + ${amountUsd.toFixed(6)}::numeric`;
}

/// Debits `event`'s price for a single billable action.
///
/// Idempotent on (refType, refId): the worker retries ticks, and a retried
/// charge for the same model call must not bill twice. The unique index does
/// the enforcing — checking first would race.
///
/// `allowNegative` separates the two kinds of charge. A model call is gated
/// before it happens, so an insufficient balance means "don't do it" and the
/// charge is refused. A confirmed trade has already settled on-chain and cost
/// us gas — refusing to record that debt would not undo it, it would just make
/// the money disappear from the books. Those charges are always recorded, and
/// the resulting negative balance blocks the *next* action.
export async function chargeAccount(
  db: CreditsDb,
  params: {
    accountId: string;
    amountUsd: number;
    event: BillableEvent;
    refType: "model_call" | "trade";
    refId: string;
    allowNegative?: boolean;
  },
): Promise<ChargeResult> {
  const { accountId, amountUsd, refType, refId, allowNegative = false } = params;

  if (amountUsd < 0) {
    throw new Error("chargeAccount: amountUsd must not be negative");
  }
  if (amountUsd === 0) {
    const balance = await getBalance(db, accountId);
    return { ok: true, balanceUsd: balance, alreadyCharged: false, reason: null };
  }

  return db.transaction(async (tx) => {
    // FOR UPDATE: two agents belonging to one account can tick concurrently,
    // and without the lock both could read the same balance and each decide it
    // covers them.
    const [account] = await tx
      .select({ balance: schema.accounts.creditBalanceUsd })
      .from(schema.accounts)
      .where(eq(schema.accounts.id, accountId))
      .for("update")
      .limit(1);

    if (!account) {
      return {
        ok: false,
        balanceUsd: 0,
        alreadyCharged: false,
        reason: `account ${accountId} not found`,
      };
    }

    const balanceUsd = toNumber(account.balance);
    if (balanceUsd < amountUsd && !allowNegative) {
      return {
        ok: false,
        balanceUsd,
        alreadyCharged: false,
        reason: `insufficient credit: $${balanceUsd.toFixed(4)} available, $${amountUsd.toFixed(4)} required`,
      };
    }

    const inserted = await tx
      .insert(schema.creditLedger)
      .values({
        accountId,
        kind: "charge",
        amountUsd: (-amountUsd).toFixed(6),
        refType,
        refId,
      })
      .onConflictDoNothing()
      .returning({ id: schema.creditLedger.id });

    if (inserted.length === 0) {
      // Already billed on an earlier attempt. Leaving the balance untouched is
      // the whole point of getting here.
      return { ok: true, balanceUsd, alreadyCharged: true, reason: null };
    }

    await tx
      .update(schema.accounts)
      .set({ creditBalanceUsd: addUsd(schema.accounts.creditBalanceUsd, -amountUsd) })
      .where(eq(schema.accounts.id, accountId));

    return {
      ok: true,
      balanceUsd: balanceUsd - amountUsd,
      alreadyCharged: false,
      reason: null,
    };
  });
}

/// Credits a confirmed on-chain deposit.
///
/// Idempotent on the contract's depositNonce, which is globally unique and
/// monotonic. Deliberately not the transaction hash: one transaction can carry
/// several deposits, and deduping on the hash would drop all but the first.
export async function creditDeposit(
  db: CreditsDb,
  params: {
    accountId: string;
    amountUsd: number;
    tokenAmount: bigint;
    tokenPriceUsd: number;
    txHash: string;
    depositNonce: bigint;
  },
): Promise<{ credited: boolean; balanceUsd: number }> {
  const { accountId, amountUsd, tokenAmount, tokenPriceUsd, txHash, depositNonce } = params;

  if (!(amountUsd > 0)) {
    throw new Error("creditDeposit: amountUsd must be positive");
  }

  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(schema.creditLedger)
      .values({
        accountId,
        kind: "deposit",
        amountUsd: amountUsd.toFixed(6),
        tokenAmount: tokenAmount.toString(),
        tokenPriceUsd: tokenPriceUsd.toFixed(12),
        refType: "deposit",
        refId: null,
        txHash,
        depositNonce: depositNonce.toString(),
      })
      .onConflictDoNothing()
      .returning({ id: schema.creditLedger.id });

    if (inserted.length === 0) {
      return { credited: false, balanceUsd: await getBalanceTx(tx, accountId) };
    }

    const [updated] = await tx
      .update(schema.accounts)
      .set({ creditBalanceUsd: addUsd(schema.accounts.creditBalanceUsd, amountUsd) })
      .where(eq(schema.accounts.id, accountId))
      .returning({ balance: schema.accounts.creditBalanceUsd });

    return { credited: true, balanceUsd: toNumber(updated!.balance) };
  });
}

/// One-time welcome credit. The partial unique index on (accountId) where
/// kind='grant' means a concurrent double sign-in cannot grant twice — the
/// second insert conflicts instead of racing a read.
export async function grantStarterCredit(
  db: CreditsDb,
  accountId: string,
  amountUsd: number,
): Promise<{ granted: boolean }> {
  if (!(amountUsd > 0)) return { granted: false };

  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(schema.creditLedger)
      .values({ accountId, kind: "grant", amountUsd: amountUsd.toFixed(6) })
      .onConflictDoNothing()
      .returning({ id: schema.creditLedger.id });

    if (inserted.length === 0) return { granted: false };

    await tx
      .update(schema.accounts)
      .set({ creditBalanceUsd: addUsd(schema.accounts.creditBalanceUsd, amountUsd) })
      .where(eq(schema.accounts.id, accountId));

    return { granted: true };
  });
}

async function getBalanceTx(tx: CreditsDb, accountId: string): Promise<number> {
  const [row] = await tx
    .select({ balance: schema.accounts.creditBalanceUsd })
    .from(schema.accounts)
    .where(eq(schema.accounts.id, accountId))
    .limit(1);
  return row ? toNumber(row.balance) : 0;
}

export async function getBalance(db: CreditsDb, accountId: string): Promise<number> {
  return getBalanceTx(db, accountId);
}

export async function recentLedger(db: CreditsDb, accountId: string, limit = 20) {
  return db
    .select()
    .from(schema.creditLedger)
    .where(eq(schema.creditLedger.accountId, accountId))
    .orderBy(desc(schema.creditLedger.createdAt))
    .limit(limit);
}

/// Integrity check: the cached balance must equal the sum of the journal. Any
/// drift means a charge or credit updated one without the other, which is money
/// unaccounted for — run this in tests and from an admin route, not on the hot
/// path.
export async function reconcile(
  db: CreditsDb,
  accountId: string,
): Promise<{ balanced: boolean; cachedUsd: number; ledgerUsd: number }> {
  const [row] = await db
    .select({
      cached: schema.accounts.creditBalanceUsd,
      ledger: sql<string>`coalesce(sum(${schema.creditLedger.amountUsd}), 0)`,
    })
    .from(schema.accounts)
    .leftJoin(schema.creditLedger, eq(schema.creditLedger.accountId, schema.accounts.id))
    .where(eq(schema.accounts.id, accountId))
    .groupBy(schema.accounts.id, schema.accounts.creditBalanceUsd);

  const cachedUsd = row ? toNumber(row.cached) : 0;
  const ledgerUsd = row ? toNumber(row.ledger) : 0;
  return { balanced: Math.abs(cachedUsd - ledgerUsd) < 1e-6, cachedUsd, ledgerUsd };
}

/// The same invariant across every account at once, for `preflight`.
///
/// `reconcile` above needs an account id, which is the wrong shape for the
/// question "is the ledger sound?" — asking it per account means knowing which
/// accounts to ask about, and the account that drifted is exactly the one nobody
/// thought to name. Returns the offenders rather than a bare boolean, because
/// "the ledger does not balance" is not actionable and "account X is $0.50 out"
/// is.
///
/// One query, grouped, so the cost does not grow with a loop over accounts.
export async function reconcileAll(db: CreditsDb): Promise<{
  balanced: boolean;
  accountsChecked: number;
  drifted: { accountId: string; cachedUsd: number; ledgerUsd: number }[];
}> {
  const rows = await db
    .select({
      accountId: schema.accounts.id,
      cached: schema.accounts.creditBalanceUsd,
      ledger: sql<string>`coalesce(sum(${schema.creditLedger.amountUsd}), 0)`,
    })
    .from(schema.accounts)
    .leftJoin(schema.creditLedger, eq(schema.creditLedger.accountId, schema.accounts.id))
    .groupBy(schema.accounts.id, schema.accounts.creditBalanceUsd);

  const drifted = rows
    .map((row) => ({
      accountId: row.accountId,
      cachedUsd: toNumber(row.cached),
      ledgerUsd: toNumber(row.ledger),
    }))
    .filter((row) => Math.abs(row.cachedUsd - row.ledgerUsd) >= 1e-6);

  return { balanced: drifted.length === 0, accountsChecked: rows.length, drifted };
}

/// Latest manually-set PUNO/USD rate, or null if none has ever been set.
export async function latestPriceOverride(
  db: CreditsDb,
): Promise<{ priceUsd: number; at: Date } | null> {
  const [row] = await db
    .select()
    .from(schema.tokenPriceOverrides)
    .orderBy(desc(schema.tokenPriceOverrides.createdAt))
    .limit(1);
  return row ? { priceUsd: toNumber(row.priceUsd), at: row.createdAt } : null;
}

export async function readIndexerCursor(db: CreditsDb, key: string): Promise<bigint | null> {
  const [row] = await db
    .select()
    .from(schema.indexerState)
    .where(eq(schema.indexerState.key, key))
    .limit(1);
  return row ? BigInt(row.lastBlock) : null;
}

export async function writeIndexerCursor(
  db: CreditsDb,
  key: string,
  lastBlock: bigint,
): Promise<void> {
  await db
    .insert(schema.indexerState)
    .values({ key, lastBlock: lastBlock.toString(), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.indexerState.key,
      set: { lastBlock: lastBlock.toString(), updatedAt: new Date() },
      // Never move the cursor backwards: a stale worker restarting with an old
      // in-memory value would otherwise cause the whole range to be re-scanned.
      where: sql`${schema.indexerState.lastBlock} < ${lastBlock.toString()}::numeric`,
    });
}
