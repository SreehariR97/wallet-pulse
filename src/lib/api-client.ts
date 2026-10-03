"use client";
import { mutate } from "swr";

/** A non-2xx API response, carrying the server's `{ error, details }` envelope. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: Record<string, string[] | undefined>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type ApiEnvelope<T> = { data: T; meta?: Record<string, unknown> };

let redirectingToLogin = false;

/**
 * fetch() for our own API routes. Resolves to the `{ data, meta }` envelope
 * and throws ApiError for any non-2xx response, so a failed request can
 * never be mistaken for "no data". A 401 means the session expired or was
 * revoked: send the user to sign in (once, however many requests failed)
 * and come back to the same page afterwards.
 */
export async function apiFetch<T>(url: string, init?: RequestInit): Promise<ApiEnvelope<T>> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });
  if (res.status === 401 && typeof window !== "undefined" && !redirectingToLogin) {
    redirectingToLogin = true;
    const back = window.location.pathname + window.location.search;
    window.location.assign(`/login?callbackUrl=${encodeURIComponent(back)}`);
  }
  const json = (await res.json().catch(() => null)) as
    | (ApiEnvelope<T> & { error?: string; details?: Record<string, string[]> })
    | null;
  if (!res.ok) {
    throw new ApiError(res.status, json?.error ?? `Request failed (${res.status})`, json?.details);
  }
  return json as ApiEnvelope<T>;
}

/** JSON body helper: `apiFetch(url, jsonBody("POST", payload))`. */
export function jsonBody(method: "POST" | "PUT" | "PATCH" | "DELETE", body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) };
}

/** SWR fetcher: the cache key is the URL. */
export function swrFetcher<T>(url: string): Promise<ApiEnvelope<T>> {
  return apiFetch<T>(url);
}

/**
 * Re-fetch every cached API response. Call after any write: a new
 * transaction changes the dashboard, budgets, analytics and card balances
 * at once, so per-key invalidation would be easy to get wrong.
 */
export function revalidateAll(): Promise<unknown> {
  return mutate(() => true);
}

/** Message for a toast from anything a write might throw. */
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  return fallback;
}
