import "server-only";
import { eq } from "drizzle-orm";
import { schema, grantStarterCredit, STARTER_GRANT_USD } from "@puno/shared";
import { db } from "./db";

/// A connected wallet *is* the login (see schema.ts's comment on
/// accounts.walletAddress) — this is the one place that identity gets
/// resolved, so every route handler that needs "the current account" goes
/// through it rather than querying accounts directly.
export async function getOrCreateAccountByWallet(walletAddress: string) {
  const normalized = walletAddress.toLowerCase();
  const [existing] = await db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.walletAddress, normalized))
    .limit(1);

  // The account may already exist without ever having signed in: the deposit
  // watcher creates one when a stranger's payment lands. Those accounts still
  // deserve the welcome grant, and grantStarterCredit is idempotent, so this
  // runs on every resolution rather than only on insert.
  const account = existing ?? (await insertAccount(normalized));
  await grantStarterCredit(db, account.id, STARTER_GRANT_USD);

  if (!existing) return account;

  // Re-read so the caller sees the granted balance rather than the pre-grant
  // snapshot taken above.
  const [fresh] = await db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.id, account.id))
    .limit(1);
  return fresh ?? account;
}

async function insertAccount(normalized: string) {
  const [created] = await db
    .insert(schema.accounts)
    .values({ walletAddress: normalized })
    .onConflictDoNothing({ target: schema.accounts.walletAddress })
    .returning();
  if (created) return created;

  // Lost an insert race with a concurrent request for the same wallet.
  const [raced] = await db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.walletAddress, normalized))
    .limit(1);
  if (!raced) throw new Error(`could not resolve account for wallet ${normalized}`);
  return raced;
}

/// Stamps geo-gate consent (DESIGN.md #25) the first time it's called for an
/// account — a no-op on repeat calls, since geoConsentAt is never overwritten.
export async function recordGeoConsent(walletAddress: string): Promise<void> {
  const account = await getOrCreateAccountByWallet(walletAddress);
  if (account.geoConsentAt) return;
  await db
    .update(schema.accounts)
    .set({ geoConsentAt: new Date() })
    .where(eq(schema.accounts.id, account.id));
}
