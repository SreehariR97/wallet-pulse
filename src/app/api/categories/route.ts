import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { eq, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, type Category } from "@/lib/db/schema";
import { categoryCreateSchema } from "@/lib/validations/category";
import { ok, fail, zodFail, requireUser } from "@/lib/api";
import { DEFAULT_CATEGORIES } from "@/lib/db/defaults";

/**
 * Seed any default categories that the user doesn't yet have.
 * Safe to call on every GET — only inserts rows that are missing.
 * This handles users that were created BEFORE new default categories
 * (like the "loan" ones) were introduced.
 */
async function backfillDefaults(userId: string, existing: Category[]) {
  const byKey = new Set(existing.map((c) => `${c.type}::${c.name.toLowerCase()}`));
  const missing = DEFAULT_CATEGORIES.filter(
    (d) => !byKey.has(`${d.type}::${d.name.toLowerCase()}`)
  );
  if (missing.length === 0) return [];

  const rows = missing.map((c, i) => ({
    id: randomUUID(),
    userId,
    name: c.name,
    icon: c.icon,
    color: c.color,
    type: c.type,
    isDefault: true,
    sortOrder: existing.length + i,
  }));
  await db.insert(categories).values(rows).run();
  return rows;
}

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const existing = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, auth.userId))
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  // Only backfill if the user has ANY categories (skip brand-new users who
  // will get defaults via the registration flow). Also backfills on every
  // request but only inserts when something is actually missing.
  if (existing.length > 0) {
    const inserted = await backfillDefaults(auth.userId, existing);
    if (inserted.length > 0) {
      const refreshed = await db
        .select()
        .from(categories)
        .where(eq(categories.userId, auth.userId))
        .orderBy(asc(categories.sortOrder), asc(categories.name));
      return ok(refreshed);
    }
  }

  return ok(existing);
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = categoryCreateSchema.safeParse(body);
  if (!parsed.success) return zodFail(parsed.error);

  const id = randomUUID();
  await db
    .insert(categories)
    .values({
      id,
      userId: auth.userId,
      name: parsed.data.name,
      icon: parsed.data.icon,
      color: parsed.data.color,
      type: parsed.data.type,
      budgetLimit: parsed.data.budgetLimit ?? null,
    })
    .run();

  const [row] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  return NextResponse.json({ data: row }, { status: 201 });
}
