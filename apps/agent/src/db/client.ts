import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { schema } from "@puno/shared";
import { config } from "../config.js";

const queryClient = postgres(config.databaseUrl);
export const db = drizzle(queryClient, { schema });
export type Db = typeof db;
