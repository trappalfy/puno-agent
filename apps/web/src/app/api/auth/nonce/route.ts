import { NextResponse } from "next/server";
import { NONCE_COOKIE, createNonce, nonceCookieOptions } from "@/lib/session";

/**
 * Issues the single-use nonce that goes into the sign-in message.
 *
 * Kept in an httpOnly cookie rather than a database table: it only has to
 * survive the round trip to the wallet prompt, and a cookie the client cannot
 * read gives the same replay protection without a table to migrate, index and
 * garbage-collect.
 */
export async function GET() {
  const nonce = createNonce();
  const res = NextResponse.json({ nonce });
  res.cookies.set(NONCE_COOKIE, nonce, nonceCookieOptions);
  return res;
}
