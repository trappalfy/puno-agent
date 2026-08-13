import { NextResponse } from "next/server";
import { getSessionAddress } from "@/lib/auth";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

/// Who the cookie says you are — the client uses this to decide whether a
/// connected wallet still needs to sign in, so a page reload does not prompt
/// the wallet again while the session is still good.
export async function GET() {
  const address = await getSessionAddress();
  return NextResponse.json({ address });
}

/// Sign out. Clearing the cookie is the whole operation: sessions are signed
/// rather than stored, so there is no server-side record to revoke.
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  return res;
}
