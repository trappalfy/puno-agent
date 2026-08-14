import { NextResponse } from "next/server";
import { schema } from "@puno/shared";
import { db } from "@/lib/db";
import { requireAccount } from "@/lib/auth";
import { checkTrialAvailability } from "@/lib/trial";

/// Queues the one free run.
///
/// Nothing is executed here. The row is picked up by the worker, which is the
/// only process that ever runs agent logic — the alternative, a second copy of
/// the pipeline inside Next.js, would mean two implementations of the thing the
/// whole product is, drifting apart from the first change onward.
export async function POST() {
  const auth = await requireAccount();
  if (!auth.ok) return auth.response;
  const { account } = auth;

  const availability = await checkTrialAvailability(
    account.id,
    Number(account.creditBalanceUsd),
  );

  if (!availability.available) {
    // 402 for "used up" as well as "too little credit": both mean the same
    // thing to the client — this is where the paywall goes — and the `reason`
    // is what decides the wording.
    const status = availability.reason === "no_demo_vault" ? 503 : 402;
    return NextResponse.json({ error: availability.reason }, { status });
  }

  const [run] = await db
    .insert(schema.trialRuns)
    .values({ accountId: account.id, agentId: availability.agentId })
    .returning({ id: schema.trialRuns.id });

  return NextResponse.json({ runId: run!.id, status: "pending" });
}
