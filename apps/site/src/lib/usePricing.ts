import { useEffect, useState } from "react";
import { formatTokens, type BillableEvent } from "@puno/shared";
import { links } from "./config";

export interface PublicPricing {
  pricesTokens: Record<BillableEvent, string | null>;
  minDepositTokens: string | null;
  punoDecimals: number;
  tokenPrice: { priceUsd: number; source: "twap" | "override"; at: string } | null;
}

/// The live PUNO prices, or null while loading and whenever they cannot be had.
///
/// A plain fetch rather than a query library: this app has three runtime
/// dependencies and adding react-query for one read on one page would cost more
/// than it returns. One request per page load, cached for a minute at the edge.
///
/// **Null is a normal state, not an error state.** This is a static marketing
/// page reaching across an origin to a separate deployment; it must render
/// something useful when that deployment is down, mid-deploy, or has no rate
/// set. Callers fall back to the USD constants they already import.
export function usePricing(): PublicPricing | null {
  const [pricing, setPricing] = useState<PublicPricing | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(links.pricingApi)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json) setPricing(json as PublicPricing);
      })
      // Swallowed on purpose. A failed price fetch must not surface as a broken
      // landing page, and there is nothing a visitor could do about it.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return pricing;
}

/// What one billable action costs, as a string ready to render.
///
/// Returns the PUNO figure when there is a rate and the dollar figure when
/// there is not. Prices are quoted in PUNO because that is the only way to pay;
/// falling back to USD keeps the page honest rather than blank, since a visitor
/// who sees no price at all learns less than one who sees it in the wrong unit.
export function priceLabel(
  pricing: PublicPricing | null,
  event: BillableEvent,
  usd: number,
): string {
  const raw = pricing?.pricesTokens[event];
  if (!raw) return `$${usd.toFixed(2)}`;
  return `${formatTokens(BigInt(raw), pricing.punoDecimals)} PUNO`;
}
