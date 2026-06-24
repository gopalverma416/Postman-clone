// Collections store: the sidebar tree (collections > folders > requests) with
// optimistic CRUD. Saved-request bodies are loaded on demand via requestsApi.get.
import { create } from 'zustand';

import { collectionsApi, foldersApi, requestsApi, type SaveRequestPayload } from '@/lib/api/client';
import { useUiStore } from '@/stores/uiStore';
import type { Collection, RequestDraft, SavedRequest } from '@/types';
import { draftToSavePayload } from '@/lib/buildRequest';

interface CollectionsState {
  collections: Collection[];
  loading: boolean;
  expanded: Record<string, boolean>;
  filter: string;

  load: () => Promise<void>;
  createCollection: (name: string) => Promise<Collection | null>;
  renameCollection: (id: string, name: string) => Promise<void>;
  deleteCollection: (id: string) => Promise<void>;
  createFolder: (collectionId: string, name: string, parentFolderId?: string | null) => Promise<void>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  saveRequest: (collectionId: string, folderId: string | null, draft: RequestDraft, name: string) => Promise<SavedRequest | null>;
  updateRequest: (id: string, collectionId: string, draft: RequestDraft, name: string) => Promise<SavedRequest | null>;
  deleteRequest: (id: string) => Promise<void>;
  toggleExpand: (id: string) => void;
  setExpanded: (id: string, open: boolean) => void;
  setFilter: (q: string) => void;
}

const toast = () => useUiStore.getState().toast;

export const useCollectionsStore = create<CollectionsState>((set, get) => ({
  collections: [],
  loading: false,
  expanded: {},
  filter: '',

  load: async () => {
    set({ loading: true });
    try {
      const collections = await collectionsApi.list();
      set({ loading: false, collections });
    } catch (e) {
      set({ loading: false });
      toast()('error', 'Failed to load collections', String((e as Error).message));
    }
  },

  createCollection: async (name) => {
    try {
      const col = await collectionsApi.create(name);
      set((s) => ({ collections: [...s.collections, { ...col, folders: col.folders ?? [], requests: col.requests ?? [] }], expanded: { ...s.expanded, [col.id]: true } }));
      toast()('success', `Collection "${name}" created`);
      return col;
    } catch (e) {
      toast()('error', 'Failed to create collection', String((e as Error).message));
      return null;
    }
  },

  renameCollection: async (id, name) => {
    const prev = get().collections;
    set((s) => ({ collections: s.collections.map((c) => (c.id === id ? { ...c, name } : c)) }));
    try {
      await collectionsApi.update(id, { name });
    } catch (e) {
      set({ collections: prev });
      toast()('error', 'Failed to rename collection', String((e as Error).message));
    }
  },

  deleteCollection: async (id) => {
    const prev = get().collections;
    set((s) => ({ collections: s.collections.filter((c) => c.id !== id) }));
    try {
      await collectionsApi.remove(id);
      toast()('success', 'Collection deleted');
    } catch (e) {
      set({ collections: prev });
      toast()('error', 'Failed to delete collection', String((e as Error).message));
    }
  },

  createFolder: async (collectionId, name, parentFolderId = null) => {
    try {
      const folder = await foldersApi.create(collectionId, { name, parentFolderId });
      set((s) => ({
        collections: s.collections.map((c) => (c.id === collectionId ? { ...c, folders: [...c.folders, folder] } : c)),
        expanded: { ...s.expanded, [collectionId]: true, [folder.id]: true },
      }));
    } catch (e) {
      toast()('error', 'Failed to create folder', String((e as Error).message));
    }
  },

  renameFolder: async (id, name) => {
    const prev = get().collections;
    set((s) => ({
      collections: s.collections.map((c) => ({ ...c, folders: c.folders.map((f) => (f.id === id ? { ...f, name } : f)) })),
    }));
    try {
      await foldersApi.update(id, { name });
    } catch (e) {
      set({ collections: prev });
      toast()('error', 'Failed to rename folder', String((e as Error).message));
    }
  },

  deleteFolder: async (id) => {
    const prev = get().collections;
    set((s) => ({
      collections: s.collections.map((c) => ({
        ...c,
        folders: c.folders.filter((f) => f.id !== id),
        requests: c.requests.filter((r) => r.folderId !== id),
      })),
    }));
    try {
      await foldersApi.remove(id);
    } catch (e) {
      set({ collections: prev });
      toast()('error', 'Failed to delete folder', String((e as Error).message));
    }
  },

  saveRequest: async (collectionId, folderId, draft, name) => {
    try {
      const payload: SaveRequestPayload = { ...draftToSavePayload(draft, name), folderId };
      const saved = await requestsApi.create(collectionId, payload);
      set((s) => ({
        collections: s.collections.map((c) =>
          c.id === collectionId
            ? { ...c, requests: [...c.requests, { id: saved.id, name: saved.name, method: saved.method, folderId: saved.folderId, sortOrder: saved.sortOrder }] }
            : c,
        ),
        expanded: { ...s.expanded, [collectionId]: true },
      }));
      toast()('success', `Saved "${name}"`);
      return saved;
    } catch (e) {
      toast()('error', 'Failed to save request', String((e as Error).message));
      return null;
    }
  },

  updateRequest: async (id, collectionId, draft, name) => {
    try {
      const saved = await requestsApi.update(id, { ...draftToSavePayload(draft, name) });
      set((s) => ({
        collections: s.collections.map((c) =>
          c.id === collectionId
            ? { ...c, requests: c.requests.map((r) => (r.id === id ? { id, name: saved.name, method: saved.method, folderId: saved.folderId, sortOrder: saved.sortOrder } : r)) }
            : c,
        ),
      }));
      toast()('success', `Saved "${name}"`);
      return saved;
    } catch (e) {
      toast()('error', 'Failed to update request', String((e as Error).message));
      return null;
    }
  },

  deleteRequest: async (id) => {
    const prev = get().collections;
    set((s) => ({ collections: s.collections.map((c) => ({ ...c, requests: c.requests.filter((r) => r.id !== id) })) }));
    try {
      await requestsApi.remove(id);
    } catch (e) {
      set({ collections: prev });
      toast()('error', 'Failed to delete request', String((e as Error).message));
    }
  },

  toggleExpand: (id) => set((s) => ({ expanded: { ...s.expanded, [id]: !s.expanded[id] } })),
  setExpanded: (id, open) => set((s) => ({ expanded: { ...s.expanded, [id]: open } })),
  setFilter: (filter) => set({ filter }),
}));
