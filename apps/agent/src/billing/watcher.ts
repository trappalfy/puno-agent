import { eq } from "drizzle-orm";
import {
  schema,
  punoCreditsAbi,
  creditDeposit,
  readIndexerCursor,
  writeIndexerCursor,
  getPunoUsdPrice,
  tokensToUsd,
  TokenPriceUnavailableError,
} from "@puno/shared";
import { db } from "../db/client.js";
import { publicClient } from "../chain/client.js";
import { config } from "../config.js";

/// Public RPCs cap how many blocks one eth_getLogs may span. Chunking keeps a
/// long backfill from failing as a single oversized request.
const MAX_BLOCK_RANGE = 2_000n;

/// Blocks behind head we refuse to index. A reorg that unwinds a deposit we
/// already credited would leave free credit on an account, and the ledger has
/// no unwind path — waiting is cheaper than reconciling.
const CONFIRMATIONS = 5n;

function cursorKey(): string {
  return `puno_credits:${config.network.chainId}`;
}

/// Wallet address *is* the account identity (see schema.accounts.walletAddress),
/// so a deposit from an address that never signed in still has an owner — we
/// create the row and the credit is waiting when they arrive. Dropping the
/// event instead would mean taking someone's tokens and recording nothing.
async function accountIdForWallet(wallet: string): Promise<string> {
  const normalized = wallet.toLowerCase();
  const [existing] = await db
    .select({ id: schema.accounts.id })
    .from(schema.accounts)
    .where(eq(schema.accounts.walletAddress, normalized))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(schema.accounts)
    .values({ walletAddress: normalized })
    .onConflictDoNothing({ target: schema.accounts.walletAddress })
    .returning({ id: schema.accounts.id });
  if (created) return created.id;

  // Lost the insert race against a concurrent sign-in; the row exists now.
  const [raced] = await db
    .select({ id: schema.accounts.id })
    .from(schema.accounts)
    .where(eq(schema.accounts.walletAddress, normalized))
    .limit(1);
  if (!raced) throw new Error(`could not resolve account for wallet ${normalized}`);
  return raced.id;
}

export interface WatcherResult {
  scannedTo: bigint;
  credited: number;
  skipped: number;
  stoppedEarly: boolean;
}

/// One pass of the deposit indexer: read CreditsPurchased since the cursor,
/// value each payment, credit it.
///
/// The cursor only advances past events that were actually credited. If the
/// PUNO/USD rate is unavailable we stop and leave the cursor behind the failing
/// event, so the deposit is retried on the next pass rather than silently lost
/// — the tokens are already in the treasury either way.
export async function runDepositWatcher(): Promise<WatcherResult> {
  const creditsAddress = config.network.punoCredits;
  if (!creditsAddress) {
    return { scannedTo: 0n, credited: 0, skipped: 0, stoppedEarly: false };
  }

  const head = await publicClient.getBlockNumber();
  const safeHead = head > CONFIRMATIONS ? head - CONFIRMATIONS : 0n;

  const stored = await readIndexerCursor(db, cursorKey());
  const start = stored ?? config.creditsWatcherStartBlock ?? safeHead;
  let fromBlock = stored === null ? start : start + 1n;

  if (fromBlock > safeHead) {
    return { scannedTo: start, credited: 0, skipped: 0, stoppedEarly: false };
  }

  let credited = 0;
  let skipped = 0;
  let lastGoodBlock = fromBlock - 1n;

  while (fromBlock <= safeHead) {
    const toBlock =
      fromBlock + MAX_BLOCK_RANGE - 1n > safeHead ? safeHead : fromBlock + MAX_BLOCK_RANGE - 1n;

    const logs = await publicClient.getLogs({
      address: creditsAddress,
      event: punoCreditsAbi[0],
      fromBlock,
      toBlock,
    });

    for (const log of logs) {
      const { payer, tokenAmount, nonce } = log.args as {
        payer?: `0x${string}`;
        tokenAmount?: bigint;
        nonce?: bigint;
      };
      if (!payer || tokenAmount === undefined || nonce === undefined) {
        console.error(`[credits] malformed log in block ${log.blockNumber}, skipping`);
        skipped++;
        continue;
      }

      let priceUsd: number;
      try {
        priceUsd = (await getPunoUsdPrice(db)).priceUsd;
      } catch (err) {
        if (err instanceof TokenPriceUnavailableError) {
          console.error(
            `[credits] cannot value deposit #${nonce} from ${payer}: ${err.message} — ` +
              `stopping at block ${log.blockNumber}; it will be retried.`,
          );
          await writeIndexerCursor(db, cursorKey(), lastGoodBlock);
          return { scannedTo: lastGoodBlock, credited, skipped, stoppedEarly: true };
        }
        throw err;
      }

      const amountUsd = tokensToUsd(tokenAmount, priceUsd, config.network.punoDecimals);
      if (!(amountUsd > 0)) {
        console.error(`[credits] deposit #${nonce} values to $0 at rate ${priceUsd} — skipping`);
        skipped++;
        continue;
      }

      const accountId = await accountIdForWallet(payer);
      const result = await creditDeposit(db, {
        accountId,
        amountUsd,
        tokenAmount,
        tokenPriceUsd: priceUsd,
        txHash: log.transactionHash,
        depositNonce: nonce,
      });

      if (result.credited) {
        credited++;
        console.log(
          `[credits] +$${amountUsd.toFixed(4)} to ${payer} (deposit #${nonce}, rate $${priceUsd}) — balance $${result.balanceUsd.toFixed(4)}`,
        );
      }
      lastGoodBlock = log.blockNumber;
    }

    lastGoodBlock = toBlock;
    await writeIndexerCursor(db, cursorKey(), toBlock);
    fromBlock = toBlock + 1n;
  }

  return { scannedTo: lastGoodBlock, credited, skipped, stoppedEarly: false };
}
