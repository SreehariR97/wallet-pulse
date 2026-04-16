import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "fs";
import path from "path";

const dbUrl = process.env.DATABASE_URL ?? "file:./data/walletpulse.db";
const dbPath = dbUrl.replace(/^file:/, "");
mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
const sqlite = new Database(dbPath);
const db = drizzle(sqlite);

migrate(db, { migrationsFolder: "./drizzle" });
console.log("✓ migrations applied");
sqlite.close();
