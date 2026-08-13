import "server-only";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { schema } from "@puno/shared";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required — see .env.example");
}

const queryClient = postgres(databaseUrl);
export const db = drizzle(queryClient, { schema });
