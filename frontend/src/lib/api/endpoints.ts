// Absolute URL builders for the FastAPI backend. RUN is '/api/run' (NOT /send).
export const API_BASE =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_BASE_URL) || 'http://localhost:8000';

const u = (path: string) => `${API_BASE}${path}`;

export const endpoints = {
  health: u('/api/health'),
  run: u('/api/run'),

  collections: u('/api/collections'),
  collection: (id: string) => u(`/api/collections/${id}`),
  collectionFolders: (collectionId: string) => u(`/api/collections/${collectionId}/folders`),
  collectionRequests: (collectionId: string) => u(`/api/collections/${collectionId}/requests`),

  folder: (id: string) => u(`/api/folders/${id}`),
  request: (id: string) => u(`/api/requests/${id}`),

  environments: u('/api/environments'),
  environment: (id: string) => u(`/api/environments/${id}`),

  history: u('/api/history'),
  historyItem: (id: string) => u(`/api/history/${id}`),

  importCollection: u('/api/collections/import'),
  exportCollection: (id: string) => u(`/api/collections/${id}/export`),
};
