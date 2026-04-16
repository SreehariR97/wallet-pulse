import type { Config } from "drizzle-kit";
import { config } from "dotenv";

// Load .env.local first, then fall back to .env, so `drizzle-kit generate` /
// `drizzle-kit push` / `drizzle-kit studio` all see DATABASE_URL.
config({ path: ".env.local" });
config({ path: ".env" });

export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
} satisfies Config;
