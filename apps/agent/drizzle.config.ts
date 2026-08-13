import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Root .env is shared across the whole monorepo (see .env.example) — resolve
// relative to this file, not process.cwd(), so `db:generate` works regardless
// of which directory it's invoked from.
const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, "../../.env") });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required (see .env.example)");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "../../packages/shared/src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: databaseUrl },
});
