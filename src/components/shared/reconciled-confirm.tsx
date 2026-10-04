"use client";
import * as React from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ApiError } from "@/lib/api-client";
import { formatCivilDate } from "@/lib/utils";

/** Header the API accepts to change a reconciled period (src/lib/reconcile-lock.ts). */
const CONFIRM_HEADER = "x-confirm-reconciled";

/** Thrown when the user declines to change a reconciled period. Callers return quietly. */
export class WriteCancelled extends Error {
  constructor() {
    super("Cancelled");
    this.name = "WriteCancelled";
  }
}

type Ask = (accounts: string[]) => Promise<boolean>;
const Ctx = React.createContext<Ask | null>(null);

/** "Checking (reconciled through 2026-10-03)" → "Checking (reconciled through Oct 3, 2026)" */
function pretty(s: string): string {
  return s.replace(/\d{4}-\d{2}-\d{2}/g, (d) => formatCivilDate(d, "MMM d, yyyy"));
}

export function ReconciledConfirmProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = React.useState<string[] | null>(null);
  const resolver = React.useRef<((ok: boolean) => void) | null>(null);
  const confirmed = React.useRef(false);

  const ask = React.useCallback<Ask>((list) => {
    // A second request while one is open resolves the first as declined.
    resolver.current?.(false);
    confirmed.current = false;
    setAccounts(list);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const list = (accounts ?? []).map(pretty);
  return (
    <Ctx.Provider value={ask}>
      {children}
      <ConfirmDialog
        open={accounts !== null}
        onOpenChange={(o) => {
          if (o) return;
          resolver.current?.(confirmed.current);
          resolver.current = null;
          setAccounts(null);
        }}
        title="Change a reconciled period?"
        description={`This changes ${list.length === 1 ? list[0] : list.join(" and ")}. ${
          list.length === 1 ? "That account" : "Those accounts"
        } will stop matching the statement until you reconcile again.`}
        confirmLabel="Change anyway"
        onConfirm={() => {
          confirmed.current = true;
        }}
      />
    </Ctx.Provider>
  );
}

/**
 * Wrap a write that may touch a reconciled period. `write` receives the
 * extra headers to send: none on the first try; the confirmation header on
 * the retry after the user agrees. Throws WriteCancelled if they don't.
 *
 *   const guarded = useReconciledWrite();
 *   await guarded((headers) => apiFetch(url, { ...jsonBody("PUT", body), headers }));
 */
export function useReconciledWrite() {
  const ask = React.useContext(Ctx);
  return React.useCallback(
    async <T,>(write: (headers: Record<string, string>) => Promise<T>): Promise<T> => {
      try {
        return await write({});
      } catch (err) {
        const reconciled = err instanceof ApiError && err.status === 409 ? err.details?.reconciled : undefined;
        if (!reconciled?.length || !ask) throw err;
        if (!(await ask(reconciled))) throw new WriteCancelled();
        return write({ [CONFIRM_HEADER]: "1" });
      }
    },
    [ask],
  );
}
