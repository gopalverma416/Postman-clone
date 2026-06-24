// Versioned localStorage helpers with safe JSON + debounced writes. SSR-safe
// (no-ops when window is undefined).

export const KEYS = {
  theme: 'postman.theme',
  tabs: 'postman.tabs.v1',
  activeTab: 'postman.activeTab.v1',
  activeEnv: 'postman.activeEnv.v1',
  panels: 'postman.panels.v1',
  sidebarTab: 'postman.sidebarTab.v1',
} as const;

const hasWindow = (): boolean => typeof window !== 'undefined';

const writeTimers: Record<string, ReturnType<typeof setTimeout>> = {};

export const persistence = {
  get<T>(key: string, fallback: T): T {
    if (!hasWindow()) return fallback;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },

  set(key: string, value: unknown): void {
    if (!hasWindow()) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* quota / serialization errors are non-fatal */
    }
  },

  /** Debounced write (default 250ms) for hot paths like tab edits. */
  setDebounced(key: string, value: unknown, delay = 250): void {
    if (!hasWindow()) return;
    if (writeTimers[key]) clearTimeout(writeTimers[key]);
    writeTimers[key] = setTimeout(() => persistence.set(key, value), delay);
  },

  remove(key: string): void {
    if (!hasWindow()) return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
