import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { schema } from "@puno/shared";
import { db } from "@/lib/db";
import { requireAccount } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";

/// Stores the key encrypted (see lib/crypto.ts) and returns only whether one
/// is set — the plaintext never comes back out of this route, in a log, or
/// in any other API response.
///
/// Session-gated. The wallet address used to come from the request body, which
/// meant an unauthenticated caller could overwrite or delete any user's stored
/// Anthropic key by naming their address — the sharpest edge of the old
/// trusted-address model.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { apiKey?: string } | null;
  const apiKey = body?.apiKey;

  const auth = await requireAccount();
  if (!auth.ok) return auth.response;

  if (!apiKey || !apiKey.startsWith("sk-ant-")) {
    return NextResponse.json(
      { error: "apiKey doesn't look like an Anthropic key" },
      { status: 400 },
    );
  }

  let encrypted: string;
  try {
    encrypted = encryptSecret(apiKey);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 501 });
  }

  // Storing the key *is* the whole switch — there is no BYOK tier any more.
  // apps/agent's priceFor() reads this column directly and waives model charges
  // whenever it's set, so the two can't drift out of step.
  await db
    .update(schema.accounts)
    .set({ anthropicApiKeyEncrypted: encrypted })
    .where(eq(schema.accounts.id, auth.account.id));

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const auth = await requireAccount();
  if (!auth.ok) return auth.response;
  const { account } = auth;
  await db
    .update(schema.accounts)
    .set({ anthropicApiKeyEncrypted: null })
    .where(eq(schema.accounts.id, account.id));
  return NextResponse.json({ ok: true });
}
