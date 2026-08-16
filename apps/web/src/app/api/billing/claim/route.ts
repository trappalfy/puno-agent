import { NextResponse } from "next/server";
import { decodeEventLog } from "viem";
import {
  punoCreditsAbi,
  creditDeposit,
  getPunoUsdPrice,
  tokensToUsd,
  TokenPriceUnavailableError,
  creditsNetwork,
} from "@puno/shared";
import { db } from "@/lib/db";
import { requireAccount } from "@/lib/auth";
import { publicClientFor } from "@/lib/chain";

const TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/;

/// Manual fallback for a deposit the watcher hasn't picked up — an RPC gap, a
/// stale rate that has since been fixed, or simple impatience.
///
/// Everything is re-derived from the receipt: the caller supplies only a
/// transaction hash, never an amount or an address. Crediting is idempotent on
/// the contract's deposit nonce, so racing the watcher is harmless.
export async function POST(request: Request) {
  const auth = await requireAccount();
  if (!auth.ok) return auth.response;
  const { address, account } = auth;

  const body = (await request.json().catch(() => null)) as { txHash?: string } | null;
  const txHash = body?.txHash;
  if (!txHash || !TX_HASH_RE.test(txHash)) {
    return NextResponse.json({ error: "txHash must be a 32-byte hex hash" }, { status: 400 });
  }

  // Exactly one network sells credit at a time — see `creditsNetworkFrom`. The
  // receipt is therefore looked up on that network's RPC and nowhere else: if
  // this ever accepted a receipt from either chain, testnet's *mock* PUNO,
  // which anyone can be sent for free, would buy real USD credit.
  const network = creditsNetwork();
  if (!network) {
    return NextResponse.json(
      { error: "No PunoCredits contract is configured on any network yet." },
      { status: 501 },
    );
  }

  let receipt;
  try {
    receipt = await publicClientFor(network.key).getTransactionReceipt({
      hash: txHash as `0x${string}`,
    });
  } catch {
    return NextResponse.json({ error: "Transaction not found or not yet mined." }, { status: 404 });
  }

  if (receipt.status !== "success") {
    return NextResponse.json({ error: "That transaction reverted." }, { status: 400 });
  }

  const creditsAddress = network.punoCredits.toLowerCase();
  const credited: { nonce: string; amountUsd: number }[] = [];
  let matched = 0;

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== creditsAddress) continue;

    let decoded;
    try {
      decoded = decodeEventLog({ abi: punoCreditsAbi, data: log.data, topics: log.topics });
    } catch {
      continue; // some other event from the same contract
    }
    if (decoded.eventName !== "CreditsPurchased") continue;

    const { payer, tokenAmount, nonce } = decoded.args as unknown as {
      payer: `0x${string}`;
      tokenAmount: bigint;
      nonce: bigint;
    };
    matched++;

    // The signed-in wallet must be the one that paid. Without this, anyone
    // could claim a stranger's deposit by quoting their transaction hash.
    if (payer.toLowerCase() !== address.toLowerCase()) continue;

    let priceUsd: number;
    try {
      priceUsd = (await getPunoUsdPrice(db)).priceUsd;
    } catch (err) {
      if (err instanceof TokenPriceUnavailableError) {
        return NextResponse.json(
          {
            error:
              "The PUNO/USD rate is unavailable right now, so this deposit can't be valued. " +
              "Your tokens are safe on-chain — try again shortly.",
          },
          { status: 503 },
        );
      }
      throw err;
    }

    const amountUsd = tokensToUsd(tokenAmount, priceUsd, network.punoDecimals);
    const result = await creditDeposit(db, {
      accountId: account.id,
      amountUsd,
      tokenAmount,
      tokenPriceUsd: priceUsd,
      txHash,
      depositNonce: nonce,
    });
    if (result.credited) credited.push({ nonce: nonce.toString(), amountUsd });
  }

  if (matched === 0) {
    return NextResponse.json(
      { error: "That transaction contains no PUNO credit purchase." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    credited,
    // Already-indexed deposits land here: nothing new was applied, which is a
    // success from the caller's point of view, not an error.
    alreadyCredited: credited.length === 0,
  });
}
