import { NextResponse } from "next/server";
import { and, eq, gte, lte } from "drizzle-orm";
import { schema, TOPUP_BUDGET_USD, type TierKey } from "@puno/shared";
import { db } from "@/lib/db";
import { getStripeClient } from "@/lib/stripe";

/// Adds a topped-up amount to whatever quota period is active right now for
/// this account, creating one if the account has no agent (and therefore no
/// period) yet. Recurring monthly budget provisioning on subscription
/// renewal (invoice.paid) is a separate, not-yet-built piece — see the
/// module comment on why: it needs live Stripe testing this repo doesn't
/// have credentials for.
async function applyTopup(accountId: string, amountUsd: number): Promise<void> {
  const now = new Date();
  const [existing] = await db
    .select()
    .from(schema.quotaPeriods)
    .where(
      and(
        eq(schema.quotaPeriods.accountId, accountId),
        lte(schema.quotaPeriods.periodStart, now),
        gte(schema.quotaPeriods.periodEnd, now),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(schema.quotaPeriods)
      .set({ budgetUsd: (Number(existing.budgetUsd) + amountUsd).toFixed(6) })
      .where(eq(schema.quotaPeriods.id, existing.id));
    return;
  }

  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  await db.insert(schema.quotaPeriods).values({
    accountId,
    periodStart,
    periodEnd,
    budgetUsd: amountUsd.toFixed(6),
  });
}

/// Stripe requires the raw, unparsed body to verify the signature — Next.js
/// route handlers give us that via request.text() as long as nothing
/// upstream has already parsed it as JSON.
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "webhook not configured" }, { status: 501 });
  }

  const rawBody = await request.text();

  let event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    return NextResponse.json(
      { error: `signature verification failed: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const accountId = session.metadata?.accountId;
      if (!accountId) break;

      if (session.metadata?.kind === "topup") {
        await applyTopup(accountId, TOPUP_BUDGET_USD);
        break;
      }

      const tier = session.metadata?.tier as TierKey | undefined;
      if (tier) {
        await db.update(schema.accounts).set({ tier }).where(eq(schema.accounts.id, accountId));
      }
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id;
      await db
        .update(schema.accounts)
        .set({ tier: "free" })
        .where(eq(schema.accounts.stripeCustomerId, customerId));
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
