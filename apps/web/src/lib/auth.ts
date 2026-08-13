import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getOrCreateAccountByWallet } from "./account";
import { SESSION_COOKIE, readSessionToken } from "./session";

/**
 * The single place a route handler learns who is calling.
 *
 * Every route used to take the wallet address from its own request body or
 * query string and trust it, which meant any caller could act as any address
 * — read another wallet's trade history, or overwrite its stored Anthropic
 * key. Identity now comes only from a signed cookie the server issued, and
 * request bodies are no longer consulted for it.
 */

/** Lowercased address of the signed-in wallet, or null. */
export async function getSessionAddress(): Promise<string | null> {
  const store = await cookies();
  return readSessionToken(store.get(SESSION_COOKIE)?.value);
}

export type AuthResult =
  | { ok: true; address: string; account: Awaited<ReturnType<typeof getOrCreateAccountByWallet>> }
  | { ok: false; response: NextResponse };

/**
 * Resolves the caller's account, or hands back the 401 to return. Written as a
 * returned response rather than a thrown error so each handler's early-exit is
 * visible at its call site.
 */
export async function requireAccount(): Promise<AuthResult> {
  const address = await getSessionAddress();
  if (!address) {
    return {
      ok: false,
      response: NextResponse.json({ error: "not signed in" }, { status: 401 }),
    };
  }
  const account = await getOrCreateAccountByWallet(address);
  return { ok: true, address, account };
}
