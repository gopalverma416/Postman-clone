// Typed fetch wrapper around the FastAPI backend. Non-2xx responses throw an
// ApiClientError carrying the parsed {error:{code,message}} body when available.

import { endpoints } from '@/lib/api/endpoints';
import type {
  Collection,
  Environment,
  EnvVar,
  Folder,
  HistoryEntry,
  RunRequest,
  RunResult,
  SavedRequest,
} from '@/types';

export class ApiClientError extends Error {
  code: string;
  status: number;
  detail?: unknown;
  constructor(message: string, code: string, status: number, detail?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    });
  } catch (e) {
    throw new ApiClientError(
      'Could not reach the API server. Is the backend running?',
      'NETWORK',
      0,
      String(e),
    );
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? safeJson(text) : undefined;

  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; detail?: unknown } })?.error;
    throw new ApiClientError(
      err?.message || `Request failed (${res.status})`,
      err?.code || 'ERROR',
      res.status,
      err?.detail,
    );
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// --- Run (the proxy/runner) ---
export async function runRequest(body: RunRequest): Promise<RunResult> {
  return request<RunResult>(endpoints.run, { method: 'POST', body: JSON.stringify(body) });
}

// --- Collections ---
interface ListEnvelope<T> {
  items: T[];
  total?: number;
}

export const collectionsApi = {
  list: async (): Promise<Collection[]> =>
    (await request<ListEnvelope<Collection>>(endpoints.collections)).items,
  create: (name: string, description?: string): Promise<Collection> =>
    request(endpoints.collections, { method: 'POST', body: JSON.stringify({ name, description }) }),
  get: (id: string): Promise<Collection> => request(endpoints.collection(id)),
  update: (id: string, patch: Partial<Pick<Collection, 'name' | 'description' | 'sortOrder'>>): Promise<Collection> =>
    request(endpoints.collection(id), { method: 'PATCH', body: JSON.stringify(patch) }),
  remove: (id: string): Promise<void> => request(endpoints.collection(id), { method: 'DELETE' }),
};

// --- Folders ---
export const foldersApi = {
  create: (
    collectionId: string,
    payload: { name: string; parentFolderId?: string | null },
  ): Promise<Folder> =>
    request(endpoints.collectionFolders(collectionId), {
      method: 'POST',
      body: JSON.stringify({ collectionId, ...payload }),
    }),
  update: (
    id: string,
    patch: Partial<Pick<Folder, 'name' | 'description' | 'parentFolderId' | 'sortOrder'>>,
  ): Promise<Folder> => request(endpoints.folder(id), { method: 'PATCH', body: JSON.stringify(patch) }),
  remove: (id: string): Promise<void> => request(endpoints.folder(id), { method: 'DELETE' }),
};

// --- Requests (SavedRequest nested shape) ---
export interface SaveRequestPayload {
  collectionId?: string;
  folderId?: string | null;
  name: string;
  method: SavedRequest['method'];
  url: string;
  description?: string;
  params: SavedRequest['params'];
  headers: SavedRequest['headers'];
  auth: SavedRequest['auth'];
  body: SavedRequest['body'];
}

export const requestsApi = {
  get: (id: string): Promise<SavedRequest> => request(endpoints.request(id)),
  create: (collectionId: string, payload: SaveRequestPayload): Promise<SavedRequest> =>
    request(endpoints.collectionRequests(collectionId), {
      method: 'POST',
      body: JSON.stringify({ ...payload, collectionId }),
    }),
  update: (id: string, patch: Partial<SaveRequestPayload>): Promise<SavedRequest> =>
    request(endpoints.request(id), { method: 'PATCH', body: JSON.stringify(patch) }),
  remove: (id: string): Promise<void> => request(endpoints.request(id), { method: 'DELETE' }),
};

// --- Environments ---
export const environmentsApi = {
  list: async (): Promise<Environment[]> =>
    (await request<ListEnvelope<Environment>>(endpoints.environments)).items,
  create: (name: string, variables: EnvVar[] = []): Promise<Environment> =>
    request(endpoints.environments, { method: 'POST', body: JSON.stringify({ name, variables }) }),
  get: (id: string): Promise<Environment> => request(endpoints.environment(id)),
  replace: (id: string, payload: { name: string; variables: EnvVar[] }): Promise<Environment> =>
    request(endpoints.environment(id), { method: 'PUT', body: JSON.stringify(payload) }),
  patch: (id: string, patch: { isActive?: boolean; name?: string; sortOrder?: number }): Promise<Environment> =>
    request(endpoints.environment(id), { method: 'PATCH', body: JSON.stringify(patch) }),
  remove: (id: string): Promise<void> => request(endpoints.environment(id), { method: 'DELETE' }),
};

// --- History ---
export const historyApi = {
  list: async (params?: { limit?: number; offset?: number; q?: string; method?: string }): Promise<{ items: HistoryEntry[]; total: number }> => {
    const qs = new URLSearchParams();
    if (params?.limit != null) qs.set('limit', String(params.limit));
    if (params?.offset != null) qs.set('offset', String(params.offset));
    if (params?.q) qs.set('q', params.q);
    if (params?.method) qs.set('method', params.method);
    const url = qs.toString() ? `${endpoints.history}?${qs}` : endpoints.history;
    const env = await request<ListEnvelope<HistoryEntry>>(url);
    return { items: env.items, total: env.total ?? env.items.length };
  },
  get: (id: string): Promise<HistoryEntry> => request(endpoints.historyItem(id)),
  remove: (id: string): Promise<void> => request(endpoints.historyItem(id), { method: 'DELETE' }),
  clear: (): Promise<void> => request(endpoints.history, { method: 'DELETE' }),
};

// --- Import / Export (bonus) ---
export const importExportApi = {
  importCollection: (doc: unknown): Promise<Collection> =>
    request(endpoints.importCollection, { method: 'POST', body: JSON.stringify(doc) }),
  exportCollection: (id: string): Promise<unknown> => request(endpoints.exportCollection(id)),
};
