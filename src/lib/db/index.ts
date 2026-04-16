import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and set it to your Neon/Postgres connection string."
  );
}

// neon() returns an HTTP-based SQL client that's serverless-friendly.
// It opens a new short-lived connection per query — no pool exhaustion on
// cold starts, works great on Vercel edge/serverless functions.
const sql = neon(connectionString);

export const db = drizzle(sql, { schema });
export { schema };
