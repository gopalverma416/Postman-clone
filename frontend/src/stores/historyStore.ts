// History store: load, optimistic prepend + reconcile (after a send), delete, clear.
import { create } from 'zustand';

import { historyApi } from '@/lib/api/client';
import { useUiStore } from '@/stores/uiStore';
import type { HistoryEntry } from '@/types';

interface HistoryState {
  entries: HistoryEntry[];
  total: number;
  loading: boolean;
  filter: string;

  load: () => Promise<void>;
  prepend: (entry: HistoryEntry) => void;
  reconcile: (tempId: string, realId: string) => void;
  remove: (id: string) => Promise<void>;
  clear: () => Promise<void>;
  setFilter: (q: string) => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  entries: [],
  total: 0,
  loading: false,
  filter: '',

  load: async () => {
    set({ loading: true });
    try {
      const { items, total } = await historyApi.list({ limit: 200 });
      set({ entries: items, total, loading: false });
    } catch (e) {
      set({ loading: false });
      useUiStore.getState().toast('error', 'Failed to load history', String((e as Error).message));
    }
  },

  prepend: (entry) => set((s) => ({ entries: [entry, ...s.entries], total: s.total + 1 })),

  reconcile: (tempId, realId) =>
    set((s) => ({ entries: s.entries.map((e) => (e.id === tempId ? { ...e, id: realId } : e)) })),

  remove: async (id) => {
    const prev = get().entries;
    set((s) => ({ entries: s.entries.filter((e) => e.id !== id), total: Math.max(0, s.total - 1) }));
    try {
      await historyApi.remove(id);
    } catch (e) {
      set({ entries: prev });
      useUiStore.getState().toast('error', 'Failed to delete history entry', String((e as Error).message));
    }
  },

  clear: async () => {
    const prev = get().entries;
    set({ entries: [], total: 0 });
    try {
      await historyApi.clear();
      useUiStore.getState().toast('success', 'History cleared');
    } catch (e) {
      set({ entries: prev });
      useUiStore.getState().toast('error', 'Failed to clear history', String((e as Error).message));
    }
  },

  setFilter: (filter) => set({ filter }),
}));

/** Filtered, newest-first entries based on the current filter string. */
export function selectFilteredHistory(): HistoryEntry[] {
  const { entries, filter } = useHistoryStore.getState();
  if (!filter.trim()) return entries;
  const q = filter.toLowerCase();
  return entries.filter((e) => e.url.toLowerCase().includes(q) || e.method.toLowerCase().includes(q));
}
