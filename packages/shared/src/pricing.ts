// Plan 3.2 — figures are a hypothesis pending the phase-3 cost measurement
// (plan 3.1: "таблица в 3.2 — гипотеза, а не обязательство"), reproduced
// here as the source of truth for apps/web's /pricing + checkout route and
// apps/site's marketing pricing section — one table, not two that can drift.
export const TIERS = {
  free: {
    name: "Free",
    priceUsd: 0,
    agents: 1,
    network: "Testnet only",
    quota: "150 Haiku/mo + 20 one-time Opus comparisons",
    stripePriceEnvVar: null,
  },
  solo: {
    name: "Solo",
    priceUsd: 29,
    agents: 1,
    network: "Mainnet",
    quota: "200 Opus + 1,000 Haiku/mo",
    stripePriceEnvVar: "STRIPE_PRICE_SOLO",
  },
  pro: {
    name: "Pro",
    priceUsd: 99,
    agents: 5,
    network: "Mainnet",
    quota: "800 Opus + 4,000 Haiku/mo",
    stripePriceEnvVar: "STRIPE_PRICE_PRO",
  },
  byok: {
    name: "BYOK",
    priceUsd: 19,
    agents: 5,
    network: "Mainnet",
    quota: "Your own Anthropic key, no Puno-side limit",
    stripePriceEnvVar: "STRIPE_PRICE_BYOK",
  },
} as const;

export type TierKey = keyof typeof TIERS;

export const TOPUP_PRICE_USD = 5;
export const TOPUP_DECISIONS = 100;
// $0.025/decision estimate from plan 3.1 — same figure used to seed a
// quota period's initial budget; pending the phase-3 cost measurement.
export const TOPUP_BUDGET_USD = TOPUP_DECISIONS * 0.025;
