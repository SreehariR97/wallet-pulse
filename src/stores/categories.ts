"use client";
import { create } from "zustand";
import type { CategoryDTO } from "@/types";

interface CategoriesState {
  items: CategoryDTO[];
  loading: boolean;
  loaded: boolean;
  fetch: (force?: boolean) => Promise<void>;
  upsert: (c: CategoryDTO) => void;
  remove: (id: string) => void;
}

export const useCategories = create<CategoriesState>((set, get) => ({
  items: [],
  loading: false,
  loaded: false,
  async fetch(force) {
    if (get().loaded && !force) return;
    set({ loading: true });
    const res = await fetch("/api/categories");
    const json = await res.json();
    set({ items: (json.data as CategoryDTO[]) ?? [], loading: false, loaded: true });
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
