"use client";
import useSWR from "swr";
import type { ApiEnvelope } from "@/lib/api-client";
import type { AccountListItemDTO } from "@/types";

/**
 * The user's accounts with live balances. Archived accounts are included so
 * a transaction that already points at one can still show it; pickers offer
 * only active ones (plus the current value). Shared SWR key, so every form
 * and filter on a page reuses one request.
 */
export function useAccounts() {
  const res = useSWR<ApiEnvelope<AccountListItemDTO[]>>("/api/accounts?includeArchived=1");
  const all = res.data?.data ?? [];
  return { ...res, all, active: all.filter((a) => a.isActive) };
}
