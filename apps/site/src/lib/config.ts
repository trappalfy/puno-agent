// See .env.example — Vite only loads .env files from this app's own
// directory, not the monorepo root apps/web reads.
const APP_URL = (import.meta.env.VITE_APP_URL as string | undefined) ?? "http://localhost:3000";

export const links = {
  createAgent: `${APP_URL}/app/agents/new`,
  dashboard: `${APP_URL}/app`,
  pricing: `${APP_URL}/pricing`,
} as const;
