import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { and, eq, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import { categoryCreateSchema } from "@/lib/validations/category";
import { ok, fail, zodFail, requireUser } from "@/lib/api";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const rows = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, auth.userId))
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  return ok(rows);
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
