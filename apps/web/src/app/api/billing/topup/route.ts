import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { schema, TOPUP_PRICE_USD } from "@puno/shared";
import { db } from "@/lib/db";
import { getOrCreateAccountByWallet } from "@/lib/account";
import { getStripeClient } from "@/lib/stripe";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/// One-off purchase — plan 3.2: "$5 за 100 дополнительных Opus-решений."
/// Applied to the account's quota via the webhook (checkout.session.completed
/// with mode "payment", distinguished from a subscription by metadata.kind).
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { walletAddress?: string } | null;
  const walletAddress = body?.walletAddress;
  if (!walletAddress || !ADDRESS_RE.test(walletAddress)) {
    return NextResponse.json({ error: "walletAddress must be a 0x address" }, { status: 400 });
  }

  const priceId = process.env.STRIPE_PRICE_TOPUP;
  if (!priceId) {
    return NextResponse.json(
      { error: "STRIPE_PRICE_TOPUP is not configured — billing isn't live yet" },
      { status: 501 },
    );
  }

  let stripe;
  try {
    stripe = getStripeClient();
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 501 });
  }

  const account = await getOrCreateAccountByWallet(walletAddress);

  let customerId = account.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({ metadata: { accountId: account.id } });
    customerId = customer.id;
    await db
      .update(schema.accounts)
      .set({ stripeCustomerId: customerId })
      .where(eq(schema.accounts.id, account.id));
  }

  const origin = new URL(request.url).origin;
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/app?topup=success`,
    cancel_url: `${origin}/app?topup=cancelled`,
    metadata: { accountId: account.id, kind: "topup", amountUsd: String(TOPUP_PRICE_USD) },
  });

  return NextResponse.json({ url: session.url });
}
