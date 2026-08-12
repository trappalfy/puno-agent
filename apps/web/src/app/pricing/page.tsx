"use client";

import { useAccount } from "wagmi";
import { Nav } from "@/components/poster/Nav";
import { Footer } from "@/components/poster/Footer";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SectionEyebrow } from "@/components/ui/SectionEyebrow";
import { TIERS, type TierKey } from "@puno/shared";

export default function PricingPage() {
  const { address, isConnected } = useAccount();

  async function subscribe(tier: TierKey) {
    if (!isConnected || !address) {
      alert("Connect a wallet first.");
      return;
    }
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ walletAddress: address, tier }),
    });
    const json = await res.json();
    if (json.url) window.location.href = json.url;
    else alert(json.error ?? "Checkout isn't available yet.");
  }

  return (
    <div data-density="poster">
      <Nav />
      <section className="mx-auto max-w-(--layout-max-width) px-[var(--spacing-24)] py-[var(--spacing-80)]">
        <SectionEyebrow>Pricing</SectionEyebrow>
        <h1 className="mt-[var(--spacing-24)] max-w-3xl text-heading-sm font-denim-ink font-bold text-white md:text-heading">
          Priced by quota, not by promise.
        </h1>
        <p className="mt-[var(--spacing-32)] max-w-xl text-body text-white">
          Every tier&rsquo;s margin is sized against its quota ceiling, not typical usage — see the
          project&rsquo;s own economics writeup for why that matters.
        </p>

        <div className="mt-[var(--spacing-72)] grid grid-cols-1 gap-[var(--spacing-24)] md:grid-cols-4">
          {(Object.entries(TIERS) as [TierKey, (typeof TIERS)[TierKey]][]).map(([key, tier]) => (
            <Card key={key} elevated={key === "pro"}>
              <div className="text-body-sm font-denim-ink text-white">{tier.name}</div>
              <div className="mt-[var(--spacing-16)] text-subheading font-denim-ink font-semibold text-lime-phosphor">
                {tier.priceUsd === 0 ? "Free" : `$${tier.priceUsd}/mo`}
              </div>
              <ul className="mt-[var(--spacing-24)] flex flex-col gap-[var(--spacing-8)] text-body-sm text-white">
                <li>
                  {tier.agents} agent{tier.agents > 1 ? "s" : ""}
                </li>
                <li>{tier.network}</li>
                <li>{tier.quota}</li>
              </ul>
              <div className="mt-[var(--spacing-24)]">
                {key === "free" ? (
                  <span className="text-body-sm text-white">Default tier — no signup needed</span>
                ) : (
                  <Button variant="primary" className="w-full" onClick={() => subscribe(key)}>
                    Subscribe
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      </section>
      <Footer />
    </div>
  );
}
