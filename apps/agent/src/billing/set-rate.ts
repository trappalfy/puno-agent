import os from "node:os";
import { latestPriceOverride, schema, MAX_OVERRIDE_AGE_MS } from "@puno/shared";
import { db } from "../db/client.js";
import { config } from "../config.js";
import { parseSetRateArgs, checkRateChange, ratePreview } from "./rate-input.js";

/// Sets the manual PUNO/USD rate.
///
///   pnpm --filter @puno/agent set-rate -- 0.001 --note "launch price"
///
/// A script and not an admin route. Writing this number decides how much credit
/// real money buys; the product has no admin surface at all, and adding one for
/// a single field would mean authenticating, authorising and defending a new
/// endpoint that exists to be used a few times a week.
///
/// `readPoolTwap()` supersedes this the moment PUNO has a pool worth reading —
/// `resolveTokenPrice` already prefers the pool over anything written here. Until
/// then this is the only way a rate enters the system, which is why it prints
/// what it is about to do and refuses more than it accepts.

/// Whole tokens with thousands separators. Fractions are dropped deliberately:
/// this table exists to answer "does 500 PUNO for a decision read sensibly",
/// and trailing decimals are noise against that question.
function formatWholeTokens(raw: bigint, decimals: number): string {
  return (raw / 10n ** BigInt(decimals)).toLocaleString("en-US");
}

async function main(): Promise<void> {
  const parsed = parseSetRateArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`set-rate: ${parsed.error}`);
    console.error("");
    console.error('Usage: pnpm --filter @puno/agent set-rate -- <price-usd> --note "<why>"');
    console.error("       add --force to allow a jump of more than 4x");
    process.exit(1);
  }

  const { priceUsd, note, force } = parsed.value;
  const decimals = config.network.punoDecimals;

  const previous = await latestPriceOverride(db);
  const change = checkRateChange({ priceUsd, previousUsd: previous?.priceUsd ?? null, force });
  if (!change.ok) {
    console.error(`set-rate: ${change.error}`);
    process.exit(1);
  }

  // Printed before the write, not after. The number is abstract on the way in
  // and concrete only as prices — "$0.0001" says nothing about whether a market
  // check should cost 100 PUNO, and that is the judgement actually being made.
  console.log(`Network      ${config.network.name} (chain ${config.network.chainId})`);
  console.log(`PUNO/USD     $${priceUsd}`);
  if (previous) {
    const ageHours = Math.round((Date.now() - previous.at.getTime()) / 3_600_000);
    console.log(`Previous     $${previous.priceUsd}, set ${ageHours}h ago`);
  } else {
    console.log("Previous     none — this is the first rate ever set");
  }
  console.log("");
  console.log("At this rate:");
  for (const row of ratePreview(priceUsd, decimals)) {
    const usd = `$${row.usd.toFixed(2)}`.padStart(8);
    const tokens = `${formatWholeTokens(row.tokens, decimals)} PUNO`.padStart(18);
    console.log(`  ${row.label.padEnd(18)}${usd}  ${tokens}`);
  }
  console.log("");

  if (change.warning) console.warn(`WARNING: ${change.warning}`);

  // Provenance for an append-only table. Not authentication — anyone who can
  // run this already holds DATABASE_URL — just enough to answer "who set this"
  // months later without guessing.
  const setBy = `${os.userInfo().username}@${os.hostname()}`;

  await db.insert(schema.tokenPriceOverrides).values({
    priceUsd: String(priceUsd),
    note,
    setBy,
  });

  console.log(`Written by ${setBy}.`);
  console.log(`Expires in ${MAX_OVERRIDE_AGE_MS / 3_600_000}h — crediting stops when it does.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    // Never print the error object wholesale: a connection failure from the
    // postgres driver carries the DSN, password included.
    console.error("set-rate failed:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
