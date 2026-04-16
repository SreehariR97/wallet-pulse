import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { Pool } from "pg";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

// Drizzle's query API is identical across both drivers, so we only branch on
// the client construction and expose a single typed `db`. The union of the
// two return types is sufficient for everything the app does — any Drizzle
// call that works on one works on the other.
type DB = NeonHttpDatabase<typeof schema> | NodePgDatabase<typeof schema>;

let _db: DB | null = null;
let _pool: Pool | null = null;

function isNeonUrl(url: string): boolean {
  // Neon endpoints always match *.neon.tech (pooled hosts include '-pooler.').
  // We prefer the HTTP driver for these because it's serverless-friendly —
  // no long-lived TCP connections to leak on Vercel cold starts.
  return /\.neon\.tech/i.test(url);
}

function getClient(): DB {
  if (_db) return _db;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set.\n" +
        "For local dev: run `docker compose up -d postgres` and make sure .env has the matching URL.\n" +
        "For production: set DATABASE_URL to your Neon/Postgres connection string in Vercel's env config."
    );
  }
  if (!/^postgres(?:ql)?:\/\//.test(connectionString)) {
    throw new Error(
      `DATABASE_URL must be a Postgres connection string (got "${connectionString.slice(0, 20)}...").\n` +
        "Expected format: postgres://user:pass@host:port/dbname"
    );
  }

  if (isNeonUrl(connectionString)) {
    // Neon serverless HTTP — stateless, one request per query, no pool.
    const sql = neon(connectionString);
    _db = drizzleNeon(sql, { schema });
  } else {
    // Standard TCP Postgres (local docker, RDS, Supabase, self-hosted, etc.).
    // Pool handles concurrent queries cleanly for long-lived Node processes.
    _pool = new Pool({ connectionString, max: 10 });
    _db = drizzlePg(_pool, { schema });
  }
  return _db;
}

// Proxy — deferred initialization so importing `db` in a route that doesn't
// actually query the DB (landing page, static pages) never touches the
// connection string. The actual client is built on first property access.
export const db: DB = new Proxy({} as DB, {
  get(_target, prop, receiver) {
    const client = getClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
}) as DB;

export { schema };
