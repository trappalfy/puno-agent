import { NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { buildSiweMessage, isFreshIssuedAt } from "@puno/shared";
import {
  NONCE_COOKIE,
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/session";
import { getOrCreateAccountByWallet } from "@/lib/account";
import { resolveSiweChainId } from "@/lib/siweChain";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/**
 * Verifies an EIP-4361 signature and, on success, issues the session cookie
 * that every other route now reads identity from.
 *
 * The message is rebuilt here from values the server already trusts — its own
 * origin and the nonce it put in the cookie — rather than parsed out of anything
 * the client sent. Address, issuedAt and chainId come from the request, and all
 * three are folded into the string the signature has to match, so a mismatch in
 * any of them simply fails verification.
 *
 * `chainId` moved from server-fixed to client-supplied deliberately. It was
 * pinned to testnet, which meant a wallet on mainnet signed a message this route
 * would never reconstruct — sign-in failed with "signature did not match" for a
 * user doing exactly what the product asks. Accepting either of our chains
 * widens the accepted-message set from one string to two and weakens nothing:
 * `domain` and `uri` still come from the request URL, the nonce is still the
 * single-use one from an httpOnly cookie, and the address is still the recovery
 * target. See lib/siweChain.ts for why the *type* check matters.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    address?: string;
    signature?: string;
    issuedAt?: string;
    chainId?: unknown;
  } | null;

  const address = body?.address;
  const signature = body?.signature;
  const issuedAt = body?.issuedAt;

  if (!address || !ADDRESS_RE.test(address) || !signature || !issuedAt) {
    return NextResponse.json(
      { error: "address, signature and issuedAt are required" },
      { status: 400 },
    );
  }
  if (!isFreshIssuedAt(issuedAt)) {
    return NextResponse.json({ error: "sign-in request expired — try again" }, { status: 400 });
  }

  const chainId = resolveSiweChainId(body?.chainId);
  if (chainId === null) {
    return NextResponse.json({ error: "sign-in must be from a chain Puno runs" }, { status: 400 });
  }

  const nonce = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${NONCE_COOKIE}=`))
    ?.slice(NONCE_COOKIE.length + 1);

  if (!nonce) {
    return NextResponse.json(
      { error: "no sign-in in progress — request a nonce first" },
      { status: 400 },
    );
  }

  const url = new URL(request.url);
  const message = buildSiweMessage({
    domain: url.host,
    address,
    uri: url.origin,
    chainId,
    nonce,
    issuedAt,
  });

  let valid = false;
  try {
    valid = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
  } catch {
    valid = false;
  }
  if (!valid) {
    return NextResponse.json({ error: "signature did not match" }, { status: 401 });
  }

  const account = await getOrCreateAccountByWallet(address);

  const res = NextResponse.json({ address: address.toLowerCase(), accountId: account.id });
  res.cookies.set(SESSION_COOKIE, createSessionToken(address), sessionCookieOptions);
  // Burn the nonce so the same signature cannot be replayed.
  res.cookies.set(NONCE_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  return res;
}
