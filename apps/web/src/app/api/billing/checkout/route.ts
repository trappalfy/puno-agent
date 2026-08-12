import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { schema, TIERS, type TierKey } from "@puno/shared";
import { db } from "@/lib/db";
import { getOrCreateAccountByWallet } from "@/lib/account";
import { getStripeClient } from "@/lib/stripe";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    walletAddress?: string;
    tier?: string;
  } | null;
  const walletAddress = body?.walletAddress;
  const tier = body?.tier as TierKey | undefined;

  if (!walletAddress || !ADDRESS_RE.test(walletAddress)) {
    return NextResponse.json({ error: "walletAddress must be a 0x address" }, { status: 400 });
  }
  if (!tier || !(tier in TIERS) || tier === "free") {
    return NextResponse.json({ error: "tier must be solo, pro, or byok" }, { status: 400 });
  }

  const tierConfig = TIERS[tier];
  const priceId = tierConfig.stripePriceEnvVar ? process.env[tierConfig.stripePriceEnvVar] : null;
  if (!priceId) {
    return NextResponse.json(
      { error: `${tierConfig.stripePriceEnvVar} is not configured — billing isn't live yet` },
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
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/app?checkout=success`,
    cancel_url: `${origin}/pricing?checkout=cancelled`,
    metadata: { accountId: account.id, tier },
  });

  return NextResponse.json({ url: session.url });
}
