// ============================================================================
// Canonical TypeScript types — the frontend mirror of the backend wire contract
// (backend/app/schemas/*). Field names are camelCase to match the API JSON.
// Keep these byte-aligned with the Pydantic schemas; drift here breaks send/save.
// ============================================================================

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
export const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

export type BodyType = 'none' | 'raw' | 'form-data' | 'x-www-form-urlencoded';
export type RawLang = 'json' | 'text' | 'xml' | 'html' | 'javascript';
export type AuthType = 'none' | 'bearer' | 'basic';

// ---------------------------------------------------------------------------
// Editor row (frontend-only). `id` is a client nanoid, never persisted as a PK.
// ---------------------------------------------------------------------------
export interface KeyValue {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  description?: string;
  /** Distinguishes 'a=' (empty value) from 'a' (no '=') for lossless URL round-trips. */
  hasEquals?: boolean;
  /** form-data only: text vs file part. */
  fieldKind?: 'text' | 'file';
  /** Set by applyAuth/finalizeContentType when an auth/body step overrode this row. */
  _overridden?: boolean;
}

// ---------------------------------------------------------------------------
// Wire shapes sent to POST /api/run (stripped of client-only fields).
// ---------------------------------------------------------------------------
export interface WireKeyValue {
  key: string;
  value: string;
  enabled: boolean;
}

export interface WireFormField {
  key: string;
  value: string;
  type?: 'text' | 'file';
  enabled: boolean;
}

export interface RequestSpec {
  method: HttpMethod;
  url: string;
  params: WireKeyValue[];
  headers: WireKeyValue[];
  body: {
    type: BodyType;
    language?: RawLang;
    raw?: string;
    fields?: WireFormField[];
  };
  auth: {
    type: AuthType;
    config?: { token?: string } | { username?: string; password?: string };
  };
}

export interface RunOptions {
  timeoutMs?: number;
  followRedirects?: boolean;
  maxRedirects?: number;
  maxResponseBytes?: number;
  verifyTls?: boolean;
  blockPrivateHosts?: boolean;
}

export interface RunRequest {
  request: RequestSpec;
  options?: RunOptions;
  recordHistory?: boolean;
  requestId?: string | null;
  environmentId?: string | null;
}

export interface RedirectHop {
  status: number;
  location: string;
  url: string;
}

export interface RunResponse {
  status: number;
  reason: string;
  ok: boolean;
  headers: { key: string; value: string }[];
  contentType?: string | null;
  body?: string | null;
  isBinary: boolean;
  truncated: boolean;
  sizeBytes: number;
  declaredContentLength?: number | null;
  headerBytes: number;
  finalUrl: string;
  redirectChain: RedirectHop[];
  httpVersion: string;
}

export type RunErrorCode =
  | 'INVALID_URL'
  | 'BLOCKED_HOST'
  | 'TIMEOUT'
  | 'CONNECTION_ERROR'
  | 'TLS_ERROR'
  | 'TOO_MANY_REDIRECTS'
  | 'UNSUPPORTED_BODY'
  | 'UPSTREAM_ERROR';

export interface RunError {
  code: RunErrorCode;
  message: string;
  detail?: unknown;
}

export interface RunResult {
  ok: boolean;
  response?: RunResponse;
  error?: RunError;
  timingMs: number;
  sizeBytes: number;
  historyId?: string;
}

// ---------------------------------------------------------------------------
// Frontend-facing response model derived from RunResult.
// ---------------------------------------------------------------------------
export interface ResponseData {
  status: number;
  statusText: string;
  ok: boolean;
  headers: { key: string; value: string }[];
  body: string;
  contentType: string | null;
  timeMs: number;
  sizeBytes: number;
  isBinary: boolean;
  truncated: boolean;
  finalUrl?: string;
  redirectChain?: RedirectHop[];
}

export type RequestErrorKind =
  | 'timeout'
  | 'network'
  | 'invalid_url'
  | 'blocked_host'
  | 'tls'
  | 'too_many_redirects'
  | 'unknown';

export interface RequestError {
  kind: RequestErrorKind;
  message: string;
  detail?: unknown;
}

// ---------------------------------------------------------------------------
// Persisted entities (camelCase API shapes).
// ---------------------------------------------------------------------------
export interface AuthConfig {
  type: AuthType;
  bearer?: { token: string };
  basic?: { username: string; password: string };
}

export interface RequestBody {
  type: BodyType;
  raw?: string;
  rawLang?: RawLang;
  formData?: KeyValue[];
  urlEncoded?: KeyValue[];
}

export interface SavedRequest {
  id: string;
  name: string;
  collectionId: string;
  folderId: string | null;
  method: HttpMethod;
  url: string;
  description?: string;
  params: KeyValue[];
  headers: KeyValue[];
  auth: AuthConfig;
  body: RequestBody;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface RequestSummary {
  id: string;
  name: string;
  method: HttpMethod;
  folderId: string | null;
  sortOrder: number;
}

export interface Folder {
  id: string;
  collectionId: string;
  parentFolderId: string | null;
  name: string;
  description?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  folders: Folder[];
  requests: RequestSummary[];
}

export interface EnvVar {
  key: string;
  value: string;
  enabled: boolean;
  secret?: boolean;
}

export interface Environment {
  id: string;
  name: string;
  isActive: boolean;
  variables: EnvVar[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface HistoryEntry {
  id: string;
  method: HttpMethod;
  url: string;
  status: number | null;
  ok: boolean;
  timeMs: number | null;
  sizeBytes: number | null;
  sentAt: string;
  requestSnapshot: RequestSpec;
  responsePreview?: RunResponse;
}

export interface ListEnvelope<T> {
  items: T[];
  total?: number;
}

export interface ApiErrorBody {
  error: {
    code: 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_ERROR' | 'INTERNAL';
    message: string;
    resource?: string;
    id?: string;
    detail?: unknown;
  };
}

// Merged enabled env vars: name -> value (last-enabled-wins).
export type VariableScope = Record<string, string>;

// ---------------------------------------------------------------------------
// Builder draft state (what a tab edits before save). KeyValue rows carry
// client ids; converted to wire shapes by lib/buildRequest.ts at send time.
// ---------------------------------------------------------------------------
export interface RequestDraft {
  name: string;
  method: HttpMethod;
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  auth: AuthConfig;
  body: RequestBody;
  /** Fragment (#...) preserved for display, stripped at send time. */
  urlFragment?: string;
}

export type RequestSubTab = 'params' | 'authorization' | 'headers' | 'body';
export type ResponseSubTab = 'pretty' | 'raw' | 'headers';

export interface Tab {
  id: string;
  /** Linked saved request id, or null for an unsaved scratch tab. */
  requestId: string | null;
  collectionId: string | null;
  folderId: string | null;
  title: string;
  draft: RequestDraft;
  /** Snapshot of the draft as last saved, to compute dirty state. */
  savedSnapshot: string | null;
  dirty: boolean;
  activeSubTab: RequestSubTab;
  responseSubTab: ResponseSubTab;
  response: ResponseData | null;
  error: RequestError | null;
  loading: boolean;
  sentAt: number | null;
}

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  description?: string;
}

export type Theme = 'light' | 'dark';
export type SidebarTab = 'collections' | 'history';
