import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { config } from "../config.js";

const here = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const queryClient = postgres(config.databaseUrl, { max: 1 });
  const db = drizzle(queryClient);
  await migrate(db, { migrationsFolder: path.resolve(here, "../../drizzle") });
  await queryClient.end();
  console.log("Migrations applied.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
