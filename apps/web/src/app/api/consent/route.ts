import { NextResponse } from "next/server";
import { recordGeoConsent } from "@/lib/account";
import { requireAccount } from "@/lib/auth";

/**
 * Stamps the durable half of the geo-gate.
 *
 * Now behind the session: the wallet address used to come from the request
 * body, so anyone could record a consent timestamp against any address. A
 * compliance record that any third party can forge for anyone is worse than
 * no record, because it reads as evidence.
 */
export async function POST() {
  const auth = await requireAccount();
  if (!auth.ok) return auth.response;

  await recordGeoConsent(auth.address);
  return NextResponse.json({ ok: true });
}
