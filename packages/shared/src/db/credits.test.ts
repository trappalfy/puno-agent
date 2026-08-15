import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { sql, eq, and, ne } from "drizzle-orm";
import * as schema from "./schema.js";
import {
  chargeAccount,
  creditDeposit,
  grantStarterCredit,
  getBalance,
  reconcile,
  readIndexerCursor,
  writeIndexerCursor,
  type CreditsDb,
} from "./credits.js";

/**
 * Run against a real Postgres (in-process, via PGlite) rather than a mock,
 * because everything worth testing here *is* Postgres behaviour: transactional
 * balance updates, partial unique indexes enforcing one-grant-per-account, and
 * ON CONFLICT DO NOTHING making retries idempotent. A mock would happily pass
 * while the production database double-charged someone.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
// The migration folder lives with apps/agent's drizzle.config.ts, which is what
// generates it from this very schema. Pointing at it here means these tests
// exercise the SQL that actually ships, not a hand-written approximation.
const MIGRATIONS = path.resolve(here, "../../../../apps/agent/drizzle");

let db: CreditsDb;
let accountId: string;
let otherId: string;

/// Opening balances are journalled, not just stamped on the account. Seeding
/// the column directly would leave every fixture failing reconcile() for a
/// reason that has nothing to do with the code under test — as the first draft
/// of these tests discovered.
async function newAccount(wallet: string, startingUsd = "0"): Promise<string> {
  const [row] = await db
    .insert(schema.accounts)
    .values({ walletAddress: wallet, creditBalanceUsd: startingUsd })
    .returning({ id: schema.accounts.id });
  const id = row!.id;

  if (Number(startingUsd) !== 0) {
    await db.insert(schema.creditLedger).values({
      accountId: id,
      kind: "adjustment",
      amountUsd: startingUsd,
    });
  }
  return id;
}

/// Ledger rows for one account, excluding the opening `adjustment` the fixture
/// writes — assertions here are about what the code under test journalled.
async function ledgerFor(id: string) {
  return db
    .select()
    .from(schema.creditLedger)
    .where(and(eq(schema.creditLedger.accountId, id), ne(schema.creditLedger.kind, "adjustment")));
}

before(async () => {
  const client = new PGlite();
  db = drizzle(client, { schema }) as unknown as CreditsDb;
  await migrate(db as never, { migrationsFolder: MIGRATIONS });
});

beforeEach(async () => {
  await db.execute(sql`truncate table credit_ledger, accounts restart identity cascade`);
  accountId = await newAccount("0x1111111111111111111111111111111111111111", "10.000000");
  otherId = await newAccount("0x2222222222222222222222222222222222222222", "0");
});

describe("chargeAccount", () => {
  it("debits the balance and writes one ledger row", async () => {
    const result = await chargeAccount(db, {
      accountId,
      amountUsd: 0.5,
      event: "decision",
      refType: "model_call",
      refId: "11111111-1111-1111-1111-111111111111",
    });

    assert.equal(result.ok, true);
    assert.equal(result.balanceUsd, 9.5);
    assert.equal(await getBalance(db, accountId), 9.5);

    const rows = await ledgerFor(accountId);
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0]!.amountUsd), -0.5);
    assert.equal(rows[0]!.kind, "charge");
  });

  it("is idempotent on (refType, refId) — a retried tick bills once", async () => {
    const params = {
      accountId,
      amountUsd: 0.5,
      event: "decision" as const,
      refType: "model_call" as const,
      refId: "22222222-2222-2222-2222-222222222222",
    };

    const first = await chargeAccount(db, params);
    const second = await chargeAccount(db, params);

    assert.equal(first.alreadyCharged, false);
    assert.equal(second.alreadyCharged, true);
    assert.equal(second.ok, true, "a repeat charge is success, not failure");
    assert.equal(await getBalance(db, accountId), 9.5, "balance moved exactly once");
    assert.equal((await ledgerFor(accountId)).length, 1);
  });

  it("charges the same refId separately per refType", async () => {
    // A model call and a trade can share a uuid across tables; the index is on
    // the pair, so both must land.
    const refId = "33333333-3333-3333-3333-333333333333";
    await chargeAccount(db, {
      accountId,
      amountUsd: 0.5,
      event: "decision",
      refType: "model_call",
      refId,
    });
    await chargeAccount(db, {
      accountId,
      amountUsd: 0.25,
      event: "trade",
      refType: "trade",
      refId,
    });
    assert.equal(await getBalance(db, accountId), 9.25);
  });

  it("refuses an unaffordable charge and leaves no partial row behind", async () => {
    const result = await chargeAccount(db, {
      accountId: otherId,
      amountUsd: 0.5,
      event: "decision",
      refType: "model_call",
      refId: "44444444-4444-4444-4444-444444444444",
    });

    assert.equal(result.ok, false);
    assert.match(result.reason!, /insufficient credit/);
    assert.equal(await getBalance(db, otherId), 0);
    assert.equal(
      (await ledgerFor(otherId)).length,
      0,
      "a refused charge must not journal anything",
    );
  });

  it("spends a balance down to exactly zero", async () => {
    const exact = await newAccount("0x3333333333333333333333333333333333333333", "0.500000");
    const result = await chargeAccount(db, {
      accountId: exact,
      amountUsd: 0.5,
      event: "decision",
      refType: "model_call",
      refId: "55555555-5555-5555-5555-555555555555",
    });
    assert.equal(result.ok, true);
    assert.equal(await getBalance(db, exact), 0);
  });

  it("allowNegative records a settled trade even when the balance can't cover it", async () => {
    // The swap is already on-chain and the gas already spent. Refusing to book
    // the debt would not undo the trade, it would erase the receivable.
    const thin = await newAccount("0x4444444444444444444444444444444444444444", "0.100000");
    const result = await chargeAccount(db, {
      accountId: thin,
      amountUsd: 0.25,
      event: "trade",
      refType: "trade",
      refId: "66666666-6666-6666-6666-666666666666",
      allowNegative: true,
    });

    assert.equal(result.ok, true);
    assert.equal(await getBalance(db, thin), -0.15);
    const { balanced } = await reconcile(db, thin);
    assert.equal(balanced, true, "a negative balance must still reconcile");
  });

  it("treats a zero price as a free, unjournalled success (BYOK)", async () => {
    const result = await chargeAccount(db, {
      accountId: otherId,
      amountUsd: 0,
      event: "decision",
      refType: "model_call",
      refId: "77777777-7777-7777-7777-777777777777",
    });
    assert.equal(result.ok, true);
    assert.equal((await ledgerFor(otherId)).length, 0);
  });

  it("rejects a negative amount rather than quietly crediting", async () => {
    await assert.rejects(
      () =>
        chargeAccount(db, {
          accountId,
          amountUsd: -5,
          event: "decision",
          refType: "model_call",
          refId: "88888888-8888-8888-8888-888888888888",
        }),
      /must not be negative/,
    );
  });

  it("reports a missing account instead of throwing", async () => {
    const result = await chargeAccount(db, {
      accountId: "99999999-9999-9999-9999-999999999999",
      amountUsd: 0.5,
      event: "decision",
      refType: "model_call",
      refId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    });
    assert.equal(result.ok, false);
    assert.match(result.reason!, /not found/);
  });
});

describe("creditDeposit", () => {
  it("credits the balance and records the rate it was valued at", async () => {
    const result = await creditDeposit(db, {
      accountId: otherId,
      amountUsd: 25,
      tokenAmount: 500n * 10n ** 18n,
      tokenPriceUsd: 0.05,
      txHash: "0xdead",
      depositNonce: 1n,
    });

    assert.equal(result.credited, true);
    assert.equal(result.balanceUsd, 25);

    const [row] = await ledgerFor(otherId);
    assert.equal(row!.kind, "deposit");
    assert.equal(Number(row!.tokenPriceUsd), 0.05);
    assert.equal(row!.tokenAmount, (500n * 10n ** 18n).toString());
  });

  it("is idempotent on the deposit nonce", async () => {
    const params = {
      accountId: otherId,
      amountUsd: 25,
      tokenAmount: 500n * 10n ** 18n,
      tokenPriceUsd: 0.05,
      txHash: "0xdead",
      depositNonce: 7n,
    };
    await creditDeposit(db, params);
    const second = await creditDeposit(db, params);

    assert.equal(second.credited, false);
    assert.equal(await getBalance(db, otherId), 25, "credited exactly once");
  });

  it("credits two deposits that share a transaction hash", async () => {
    // One transaction can carry several deposits — this is precisely why the
    // nonce, not the hash, is the dedupe key.
    const base = {
      accountId: otherId,
      amountUsd: 10,
      tokenAmount: 200n * 10n ** 18n,
      tokenPriceUsd: 0.05,
      txHash: "0xsamehash",
    };
    await creditDeposit(db, { ...base, depositNonce: 10n });
    await creditDeposit(db, { ...base, depositNonce: 11n });

    assert.equal(await getBalance(db, otherId), 20);
  });

  it("refuses a non-positive credit", async () => {
    await assert.rejects(
      () =>
        creditDeposit(db, {
          accountId: otherId,
          amountUsd: 0,
          tokenAmount: 1n,
          tokenPriceUsd: 0.05,
          txHash: "0x0",
          depositNonce: 99n,
        }),
      /must be positive/,
    );
  });
});

describe("grantStarterCredit", () => {
  it("grants once and never again", async () => {
    const first = await grantStarterCredit(db, otherId, 3);
    const second = await grantStarterCredit(db, otherId, 3);

    assert.equal(first.granted, true);
    assert.equal(second.granted, false);
    assert.equal(await getBalance(db, otherId), 3);
  });

  it("survives concurrent first sign-ins", async () => {
    // Two requests for the same wallet arriving together both see "no grant
    // yet"; the partial unique index is what stops both from inserting.
    const results = await Promise.all([
      grantStarterCredit(db, otherId, 3),
      grantStarterCredit(db, otherId, 3),
      grantStarterCredit(db, otherId, 3),
    ]);

    assert.equal(results.filter((r) => r.granted).length, 1);
    assert.equal(await getBalance(db, otherId), 3);
  });

  it("grants each account separately", async () => {
    await grantStarterCredit(db, accountId, 3);
    await grantStarterCredit(db, otherId, 3);
    assert.equal(await getBalance(db, otherId), 3);
    assert.equal(await getBalance(db, accountId), 13);
  });
});

describe("reconcile", () => {
  it("balances after a full grant / deposit / charge sequence", async () => {
    await grantStarterCredit(db, otherId, 3);
    await creditDeposit(db, {
      accountId: otherId,
      amountUsd: 20,
      tokenAmount: 400n * 10n ** 18n,
      tokenPriceUsd: 0.05,
      txHash: "0xabc",
      depositNonce: 42n,
    });
    for (let i = 0; i < 5; i++) {
      await chargeAccount(db, {
        accountId: otherId,
        amountUsd: 0.5,
        event: "decision",
        refType: "model_call",
        refId: `bbbbbbbb-bbbb-bbbb-bbbb-00000000000${i}`,
      });
    }
    await chargeAccount(db, {
      accountId: otherId,
      amountUsd: 0.25,
      event: "trade",
      refType: "trade",
      refId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    });

    const { balanced, cachedUsd, ledgerUsd } = await reconcile(db, otherId);
    assert.equal(balanced, true, `cached ${cachedUsd} vs ledger ${ledgerUsd}`);
    assert.equal(cachedUsd, 3 + 20 - 2.5 - 0.25);
  });

  it("detects drift when the cached balance is tampered with", async () => {
    // Guards the guard: if this passed unconditionally it would hide exactly
    // the bug the check exists to catch.
    await grantStarterCredit(db, otherId, 3);
    await db.execute(sql`update accounts set credit_balance_usd = 999 where id = ${otherId}::uuid`);
    const { balanced } = await reconcile(db, otherId);
    assert.equal(balanced, false);
  });
});

describe("indexer cursor", () => {
  it("round-trips and never moves backwards", async () => {
    assert.equal(await readIndexerCursor(db, "k"), null);

    await writeIndexerCursor(db, "k", 100n);
    assert.equal(await readIndexerCursor(db, "k"), 100n);

    await writeIndexerCursor(db, "k", 250n);
    assert.equal(await readIndexerCursor(db, "k"), 250n);

    // A restarted worker holding a stale in-memory height must not rewind the
    // cursor and force a full re-scan.
    await writeIndexerCursor(db, "k", 50n);
    assert.equal(await readIndexerCursor(db, "k"), 250n);
  });
});
