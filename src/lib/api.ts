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
