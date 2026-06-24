// UI store: theme, sidebar tab, toasts, modal, command palette, panel sizes.
import { create } from 'zustand';

import { uuid } from '@/lib/id';
import { KEYS, persistence } from '@/lib/persistence';
import type { SidebarTab, Theme, Toast, ToastKind } from '@/types';

export interface ModalState {
  type: string;
  props?: Record<string, unknown>;
}

interface UiState {
  theme: Theme;
  sidebarTab: SidebarTab;
  toasts: Toast[];
  modal: ModalState | null;
  commandPaletteOpen: boolean;
  panelSizes: Record<string, number[]>;

  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setSidebarTab: (t: SidebarTab) => void;
  toast: (kind: ToastKind, message: string, description?: string) => void;
  dismissToast: (id: string) => void;
  openModal: (type: string, props?: Record<string, unknown>) => void;
  closeModal: () => void;
  setCommandPalette: (open: boolean) => void;
  setPanelSizes: (key: string, sizes: number[]) => void;
}

function applyTheme(theme: Theme) {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = theme;
  }
}

export const useUiStore = create<UiState>((set, get) => ({
  theme: 'dark',
  sidebarTab: 'collections',
  toasts: [],
  modal: null,
  commandPaletteOpen: false,
  panelSizes: {},

  setTheme: (theme) => {
    applyTheme(theme);
    persistence.set(KEYS.theme, theme);
    set({ theme });
  },
  toggleTheme: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
    get().setTheme(next);
  },
  setSidebarTab: (sidebarTab) => {
    persistence.set(KEYS.sidebarTab, sidebarTab);
    set({ sidebarTab });
  },
  toast: (kind, message, description) => {
    const t: Toast = { id: uuid(), kind, message, description };
    set((s) => ({ toasts: [...s.toasts, t] }));
    // Auto-dismiss after 4s.
    setTimeout(() => get().dismissToast(t.id), 4000);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  openModal: (type, props) => set({ modal: { type, props } }),
  closeModal: () => set({ modal: null }),
  setCommandPalette: (commandPaletteOpen) => set({ commandPaletteOpen }),
  setPanelSizes: (key, sizes) => {
    set((s) => {
      const panelSizes = { ...s.panelSizes, [key]: sizes };
      persistence.setDebounced(KEYS.panels, panelSizes);
      return { panelSizes };
    });
  },
}));

/** Hydrate theme + persisted UI prefs (called once on bootstrap). */
export function hydrateUi() {
  const theme = persistence.get<Theme>(KEYS.theme, 'dark');
  const sidebarTab = persistence.get<SidebarTab>(KEYS.sidebarTab, 'collections');
  const panelSizes = persistence.get<Record<string, number[]>>(KEYS.panels, {});
  applyTheme(theme);
  useUiStore.setState({ theme, sidebarTab, panelSizes });
}
