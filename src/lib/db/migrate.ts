/**
 * Applies pending Drizzle migrations to the Postgres database configured in
 * DATABASE_URL. We use node-postgres here (rather than the Neon HTTP client)
 * because the migrator needs a stateful connection that supports transactions
 * and DDL execution.
 *
 *   pnpm db:migrate
 */
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { config } from "dotenv";

// Ensure .env.local is loaded when running this script directly.
config({ path: ".env.local" });
config({ path: ".env" });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

async function main() {
  const pool = new Pool({ connectionString });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await pool.end();
  console.log("✓ migrations applied");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
