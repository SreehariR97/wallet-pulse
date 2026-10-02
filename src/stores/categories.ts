"use client";
import { create } from "zustand";
import { apiFetch } from "@/lib/api-client";
import type { CategoryDTO } from "@/types";

interface CategoriesState {
  items: CategoryDTO[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  fetch: (force?: boolean) => Promise<void>;
  upsert: (c: CategoryDTO) => void;
  remove: (id: string) => void;
}

// One request in flight at a time: the form, filters and budgets view all
// call fetch() on mount, and used to fire one request each.
let inFlight: Promise<void> | null = null;

export const useCategories = create<CategoriesState>((set, get) => ({
  items: [],
  loading: false,
  loaded: false,
  error: null,
  fetch(force) {
    if (get().loaded && !force) return Promise.resolve();
    if (inFlight) return inFlight;
    set({ loading: true, error: null });
    inFlight = apiFetch<CategoryDTO[]>("/api/categories")
      .then(({ data }) => set({ items: data, loaded: true }))
      .catch((err: unknown) => {
        // Leave loaded=false so the next caller retries.
        set({ error: err instanceof Error ? err.message : "Failed to load categories" });
      })
      .finally(() => {
        set({ loading: false });
        inFlight = null;
      });
    return inFlight;
  },
  upsert(c) {
    set((s) => {
      const idx = s.items.findIndex((x) => x.id === c.id);
      if (idx === -1) return { items: [...s.items, c] };
      const next = s.items.slice();
      next[idx] = c;
      return { items: next };
    });
  },
  remove(id) {
    set((s) => ({ items: s.items.filter((c) => c.id !== id) }));
  },
}));
