// Tabs store — the request builder core.
// Owns open tabs (each with a full draft + response), draft editing with URL<->param
// two-way sync (loop-guarded by editSource), the send pipeline (resolve -> run ->
// record history), dirty tracking, and localStorage persistence of open tabs.
import { create } from 'zustand';

import { runRequest } from '@/lib/api/client';
import { draftFingerprint, newDraft, savedRequestToDraft, withPhantomRow } from '@/lib/buildRequest';
import { uuid } from '@/lib/id';
import { KEYS, persistence } from '@/lib/persistence';
import { buildUrlFromParams, parseUrlToParams, urlBase } from '@/lib/queryParams';
import { resolveDraft } from '@/lib/variableResolver';
import { getActiveEnvironment, getScope, useEnvironmentsStore } from '@/stores/environmentsStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useUiStore } from '@/stores/uiStore';
import type {
  HistoryEntry,
  RequestDraft,
  RequestError,
  RequestSubTab,
  ResponseData,
  ResponseSubTab,
  RunResult,
  SavedRequest,
  Tab,
} from '@/types';

interface TabsState {
  tabs: Tab[];
  activeTabId: string | null;

  openBlank: () => string;
  openSavedRequest: (r: SavedRequest) => void;
  openHistory: (entry: HistoryEntry) => void;
  closeTab: (id: string) => void;
  setActive: (id: string) => void;
  reorder: (ids: string[]) => void;

  patchDraft: (id: string, partial: Partial<RequestDraft>) => void;
  setMethod: (id: string, method: RequestDraft['method']) => void;
  setUrl: (id: string, url: string) => void;
  setParams: (id: string, rows: RequestDraft['params']) => void;
  setHeaders: (id: string, rows: RequestDraft['headers']) => void;
  setAuth: (id: string, auth: RequestDraft['auth']) => void;
  setBody: (id: string, body: RequestDraft['body']) => void;
  setActiveSubTab: (id: string, t: RequestSubTab) => void;
  setResponseSubTab: (id: string, t: ResponseSubTab) => void;

  send: (id: string) => Promise<void>;
  cancel: (id: string) => void;
  markSaved: (id: string, saved: SavedRequest) => void;
}

function makeTab(partial: Partial<Tab> = {}): Tab {
  const draft = partial.draft ?? newDraft();
  return {
    id: partial.id ?? uuid(),
    requestId: partial.requestId ?? null,
    collectionId: partial.collectionId ?? null,
    folderId: partial.folderId ?? null,
    title: partial.title ?? 'Untitled Request',
    draft,
    savedSnapshot: partial.savedSnapshot ?? null,
    dirty: partial.dirty ?? false,
    activeSubTab: partial.activeSubTab ?? 'params',
    responseSubTab: partial.responseSubTab ?? 'pretty',
    response: partial.response ?? null,
    error: partial.error ?? null,
    loading: false,
    sentAt: partial.sentAt ?? null,
  };
}

// In-flight AbortControllers per tab (not part of serializable state).
const inflight = new Map<string, AbortController>();

function persistTabs(state: TabsState) {
  // Persist a lean version (no transient response/loading) for restore on reload.
  const serializable = state.tabs.map((t) => ({
    ...t,
    response: null,
    error: null,
    loading: false,
  }));
  persistence.setDebounced(KEYS.tabs, serializable);
  persistence.setDebounced(KEYS.activeTab, state.activeTabId);
}

export const useTabsStore = create<TabsState>((set, get) => {
  // Helper to update one tab + recompute dirty + persist.
  const updateTab = (id: string, updater: (t: Tab) => Tab) => {
    set((s) => {
      const tabs = s.tabs.map((t) => {
        if (t.id !== id) return t;
        const next = updater(t);
        const dirty = next.savedSnapshot != null && draftFingerprint(next.draft) !== next.savedSnapshot;
        return { ...next, dirty: next.savedSnapshot == null ? next.dirty : dirty };
      });
      const newState = { ...s, tabs };
      persistTabs(newState as TabsState);
      return { tabs };
    });
  };

  return {
    tabs: [],
    activeTabId: null,

    openBlank: () => {
      const tab = makeTab();
      set((s) => {
        const newState = { tabs: [...s.tabs, tab], activeTabId: tab.id };
        persistTabs({ ...s, ...newState } as TabsState);
        return newState;
      });
      return tab.id;
    },

    openSavedRequest: (r) => {
      // If already open, just focus it.
      const existing = get().tabs.find((t) => t.requestId === r.id);
      if (existing) {
        get().setActive(existing.id);
        return;
      }
      const draft = savedRequestToDraft(r);
      const tab = makeTab({
        requestId: r.id,
        collectionId: r.collectionId,
        folderId: r.folderId,
        title: r.name,
        draft,
        savedSnapshot: draftFingerprint(draft),
      });
      set((s) => {
        const newState = { tabs: [...s.tabs, tab], activeTabId: tab.id };
        persistTabs({ ...s, ...newState } as TabsState);
        return newState;
      });
    },

    openHistory: (entry) => {
      const spec = entry.requestSnapshot;
      const draft = newDraft({
        name: `${entry.method} ${entry.url}`,
        method: entry.method,
        url: spec.url || entry.url,
        params: withPhantomRow(spec.params.map((p) => ({ id: uuid(), key: p.key, value: p.value, enabled: p.enabled }))),
        headers: withPhantomRow(spec.headers.map((h) => ({ id: uuid(), key: h.key, value: h.value, enabled: h.enabled }))),
        auth:
          spec.auth.type === 'bearer'
            ? { type: 'bearer', bearer: { token: (spec.auth.config as { token?: string })?.token ?? '' } }
            : spec.auth.type === 'basic'
              ? { type: 'basic', basic: { username: (spec.auth.config as { username?: string })?.username ?? '', password: (spec.auth.config as { password?: string })?.password ?? '' } }
              : { type: 'none' },
        body: {
          type: spec.body.type,
          raw: spec.body.raw ?? '',
          rawLang: spec.body.language ?? 'json',
          formData: withPhantomRow((spec.body.fields ?? []).map((f) => ({ id: uuid(), key: f.key, value: f.value, enabled: f.enabled, fieldKind: f.type }))),
          urlEncoded: withPhantomRow((spec.body.fields ?? []).map((f) => ({ id: uuid(), key: f.key, value: f.value, enabled: f.enabled }))),
        },
      });
      const tab = makeTab({ title: entry.method + ' ' + shortUrl(entry.url), draft });
      set((s) => {
        const newState = { tabs: [...s.tabs, tab], activeTabId: tab.id };
        persistTabs({ ...s, ...newState } as TabsState);
        return newState;
      });
    },

    closeTab: (id) => {
      inflight.get(id)?.abort();
      inflight.delete(id);
      set((s) => {
        const idx = s.tabs.findIndex((t) => t.id === id);
        const tabs = s.tabs.filter((t) => t.id !== id);
        let activeTabId = s.activeTabId;
        if (s.activeTabId === id) {
          activeTabId = tabs.length ? tabs[Math.max(0, idx - 1)].id : null;
        }
        const newState = { tabs, activeTabId };
        persistTabs({ ...s, ...newState } as TabsState);
        return newState;
      });
    },

    setActive: (id) => {
      set((s) => {
        persistTabs({ ...s, activeTabId: id } as TabsState);
        return { activeTabId: id };
      });
    },

    reorder: (ids) => {
      set((s) => {
        const map = new Map(s.tabs.map((t) => [t.id, t]));
        const tabs = ids.map((i) => map.get(i)).filter(Boolean) as Tab[];
        persistTabs({ ...s, tabs } as TabsState);
        return { tabs };
      });
    },

    patchDraft: (id, partial) => updateTab(id, (t) => ({ ...t, draft: { ...t.draft, ...partial } })),

    setMethod: (id, method) => updateTab(id, (t) => ({ ...t, draft: { ...t.draft, method } })),

    // URL edit -> re-parse params table (editSource = 'url').
    setUrl: (id, url) =>
      updateTab(id, (t) => {
        const parsed = parseUrlToParams(url, t.draft.params);
        return {
          ...t,
          draft: { ...t.draft, url, params: withPhantomRow(parsed.rows), urlFragment: parsed.fragment },
        };
      }),

    // Params edit -> rebuild URL (editSource = 'table').
    setParams: (id, rows) =>
      updateTab(id, (t) => {
        const base = urlBase(t.draft.url);
        const url = buildUrlFromParams(base, rows, t.draft.urlFragment);
        return { ...t, draft: { ...t.draft, params: rows, url } };
      }),

    setHeaders: (id, rows) => updateTab(id, (t) => ({ ...t, draft: { ...t.draft, headers: rows } })),
    setAuth: (id, auth) => updateTab(id, (t) => ({ ...t, draft: { ...t.draft, auth } })),
    setBody: (id, body) => updateTab(id, (t) => ({ ...t, draft: { ...t.draft, body } })),

    setActiveSubTab: (id, activeSubTab) => set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, activeSubTab } : t)) })),
    setResponseSubTab: (id, responseSubTab) => set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, responseSubTab } : t)) })),

    send: async (id) => {
      const tab = get().tabs.find((t) => t.id === id);
      if (!tab) return;

      const scope = getScope();
      const { spec, unresolved } = resolveDraft(tab.draft, scope);
      if (!spec.url.trim()) {
        useUiStore.getState().toast('error', 'Enter a URL before sending');
        return;
      }
      if (unresolved.length) {
        useUiStore.getState().toast('info', `${unresolved.length} unresolved variable${unresolved.length > 1 ? 's' : ''}`, unresolved.join(', '));
      }

      const controller = new AbortController();
      inflight.set(id, controller);
      set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, loading: true, error: null, responseSubTab: 'pretty' } : t)) }));

      const activeEnv = getActiveEnvironment();
      try {
        const result: RunResult = await runRequest({
          request: spec,
          requestId: tab.requestId,
          environmentId: activeEnv?.id ?? null,
          recordHistory: true,
        });
        applyRunResult(set, get, id, result, spec.method, spec.url);

        // Optimistic history prepend + reconcile with returned id.
        if (result.historyId) {
          const entry: HistoryEntry = {
            id: result.historyId,
            method: spec.method,
            url: spec.url,
            status: result.response?.status ?? null,
            ok: result.ok && !!result.response?.ok,
            timeMs: Math.round(result.timingMs),
            sizeBytes: result.sizeBytes,
            sentAt: new Date().toISOString(),
            requestSnapshot: spec,
            responsePreview: result.response,
          };
          useHistoryStore.getState().prepend(entry);
        }
      } catch (e) {
        const message = (e as Error).message || 'Request failed';
        set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, loading: false, response: null, error: { kind: 'unknown', message } } : t)) }));
        useUiStore.getState().toast('error', 'Request failed', message);
      } finally {
        inflight.delete(id);
      }
    },

    cancel: (id) => {
      inflight.get(id)?.abort();
      inflight.delete(id);
      set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, loading: false } : t)) }));
    },

    markSaved: (id, saved) =>
      updateTab(id, (t) => ({
        ...t,
        requestId: saved.id,
        collectionId: saved.collectionId,
        folderId: saved.folderId,
        title: saved.name,
        draft: { ...t.draft, name: saved.name },
        savedSnapshot: draftFingerprint({ ...t.draft, name: saved.name }),
        dirty: false,
      })),
  };
});

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.length > 1 ? u.pathname : u.hostname;
  } catch {
    return url.slice(0, 40);
  }
}

const ERROR_KIND: Record<string, RequestError['kind']> = {
  INVALID_URL: 'invalid_url',
  BLOCKED_HOST: 'blocked_host',
  TIMEOUT: 'timeout',
  CONNECTION_ERROR: 'network',
  TLS_ERROR: 'tls',
  TOO_MANY_REDIRECTS: 'too_many_redirects',
  UNSUPPORTED_BODY: 'unknown',
  UPSTREAM_ERROR: 'unknown',
};

function applyRunResult(
  set: (fn: (s: TabsState) => Partial<TabsState>) => void,
  _get: () => TabsState,
  id: string,
  result: RunResult,
  _method: string,
  _url: string,
) {
  if (result.ok && result.response) {
    const r = result.response;
    const response: ResponseData = {
      status: r.status,
      statusText: r.reason,
      ok: r.ok,
      headers: r.headers,
      body: r.body ?? '',
      contentType: r.contentType ?? null,
      timeMs: Math.round(result.timingMs),
      sizeBytes: r.sizeBytes,
      isBinary: r.isBinary,
      truncated: r.truncated,
      finalUrl: r.finalUrl,
      redirectChain: r.redirectChain,
    };
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, loading: false, response, error: null, sentAt: Date.now() } : t)) }));
  } else {
    const err = result.error;
    const error: RequestError = {
      kind: err ? ERROR_KIND[err.code] ?? 'unknown' : 'unknown',
      message: err?.message ?? 'Request failed',
      detail: err?.detail,
    };
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, loading: false, response: null, error, sentAt: Date.now() } : t)) }));
  }
}

/** Hydrate open tabs from localStorage (called AFTER collections load). */
export function hydrateTabs() {
  const saved = persistence.get<Tab[] | null>(KEYS.tabs, null);
  const activeTabId = persistence.get<string | null>(KEYS.activeTab, null);
  if (saved && saved.length) {
    const tabs = saved.map((t) => makeTab({ ...t, response: null, error: null, loading: false }));
    useTabsStore.setState({ tabs, activeTabId: activeTabId && tabs.some((t) => t.id === activeTabId) ? activeTabId : tabs[0].id });
  } else {
    // Start with one blank tab.
    useTabsStore.getState().openBlank();
  }
}
