"use client";
import * as React from "react";

/**
 * Mirror a view's state into the query string, so refresh, Back from a
 * detail page and shared links keep it. Uses history.replaceState, which
 * Next 14.2 keeps in sync with useSearchParams without a server round-trip
 * per keystroke; replace (not push) so filtering doesn't flood history.
 *
 * Read initial values with useSearchParams(); empty/undefined entries are
 * left out of the URL, so pass `undefined` for defaults.
 */
export function useSyncToUrl(params: Record<string, string | undefined>) {
  const serialized = new URLSearchParams(
    Object.entries(params).filter((e): e is [string, string] => !!e[1]),
  ).toString();

  React.useEffect(() => {
    const { pathname, search, hash } = window.location;
    const next = serialized ? `?${serialized}` : "";
    if (next !== search) window.history.replaceState(null, "", `${pathname}${next}${hash}`);
  }, [serialized]);
}
