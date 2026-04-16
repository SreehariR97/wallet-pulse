import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { registerSchema } from "@/lib/validations/auth";
import { seedDefaultCategoriesForUser } from "@/lib/db/seed";
import { fail, zodFail } from "@/lib/api";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) return zodFail(parsed.error);

  const email = parsed.data.email.toLowerCase();
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length) return fail(409, "An account with this email already exists");

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const id = randomUUID();
  await db.insert(users).values({ id, name: parsed.data.name, email, passwordHash }).run();
  seedDefaultCategoriesForUser(id);

  return NextResponse.json({ data: { id, email } }, { status: 201 });
}
