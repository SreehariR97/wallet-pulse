import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "fs";
import path from "path";
import * as schema from "./schema";

const dbUrl = process.env.DATABASE_URL ?? "file:./data/walletpulse.db";
const dbPath = dbUrl.replace(/^file:/, "");
const dir = path.dirname(path.resolve(dbPath));
mkdirSync(dir, { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { schema };
