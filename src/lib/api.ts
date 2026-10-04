import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import type { ZodError } from "zod";

export type ApiResponse<T> = { data: T; meta?: Record<string, unknown>; error?: never } | { data?: never; error: string; details?: unknown };

export function ok<T>(data: T, meta?: Record<string, unknown>) {
  return NextResponse.json({ data, ...(meta ? { meta } : {}) } satisfies ApiResponse<T>);
}

export function fail(status: number, error: string, details?: unknown) {
  return NextResponse.json({ error, ...(details !== undefined ? { details } : {}) }, { status });
}

export function zodFail(err: ZodError) {
  return NextResponse.json(
    { error: "Validation failed", details: err.flatten().fieldErrors },
    { status: 400 }
  );
}

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: fail(401, "Unauthorized") } as const;
  }
  return { userId: session.user.id, user: session.user } as const;
}

/**
 * True when a write failed on a unique constraint (Postgres 23505). Works
 * across neon-http, node-postgres and PGlite, which all surface `code`
 * either on the error or on its `cause`.
 */
export function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e && depth < 5; depth++) {
    if (typeof e === "object" && (e as { code?: unknown }).code === "23505") return true;
    e = typeof e === "object" ? (e as { cause?: unknown }).cause : undefined;
  }
  return false;
}
