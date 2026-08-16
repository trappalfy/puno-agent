// See .env.example — Vite only loads .env files from this app's own
// directory, not the monorepo root apps/web reads.
const APP_URL = (import.meta.env.VITE_APP_URL as string | undefined) ?? "http://localhost:3000";

export const links = {
  // The primary call to action. Every CTA used to point at createAgent, which
  // asks a first-time visitor for four signed transactions, testnet ETH and a
  // funded vault before they have seen the agent do anything. This asks for a
  // wallet connection and nothing else.
  tryAgent: `${APP_URL}/app/try`,
  // Read-only, no wallet, no connection prompt. `tryAgent` above still asks for
  // a wallet before anything happens, which left a visitor who simply wants to
  // see whether the thing works with nothing to look at — the second-largest
  // gap in the competitive review. This is the answer to "show me first".
  demo: `${APP_URL}/demo`,
  createAgent: `${APP_URL}/app/agents/new`,
  dashboard: `${APP_URL}/app`,
  pricing: `${APP_URL}/pricing`,
} as const;
