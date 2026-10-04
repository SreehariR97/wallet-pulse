"use client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AccountListItemDTO } from "@/types";

const NONE = "__none";

/**
 * Account picker. Lists active accounts, plus `value` if it points at an
 * archived one (an existing link is kept, not silently dropped).
 * `noneLabel` adds a "no account" option that maps to null.
 */
export function AccountSelect({
  id,
  accounts,
  value,
  onChange,
  noneLabel,
  exclude,
  placeholder = "Choose account",
  className,
}: {
  id?: string;
  accounts: AccountListItemDTO[];
  value: string | null;
  onChange: (v: string | null) => void;
  noneLabel?: string;
  /** Hide this account (the other side of a transfer). */
  exclude?: string | null;
  placeholder?: string;
  className?: string;
}) {
  const options = accounts.filter((a) => (a.isActive || a.id === value) && a.id !== exclude);
  return (
    <Select value={value ?? (noneLabel ? NONE : "")} onValueChange={(v) => onChange(v === NONE ? null : v)}>
      <SelectTrigger id={id} className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {noneLabel && <SelectItem value={NONE}>{noneLabel}</SelectItem>}
        {options.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {a.name}
            {!a.isActive ? " (archived)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
