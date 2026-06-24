// Global keyboard shortcut registry. Returns an unbind function.
//   Cmd/Ctrl+Enter -> send, Cmd+S -> save, Cmd+T -> new tab, Cmd+W -> close tab,
//   Cmd+F -> find/focus sidebar search, Cmd+K -> command palette, Esc -> escape.

export interface ShortcutHandlers {
  send?: () => void;
  save?: () => void;
  newTab?: () => void;
  closeTab?: () => void;
  find?: () => void;
  palette?: () => void;
  escape?: () => void;
}

export function registerShortcuts(handlers: ShortcutHandlers): () => void {
  const onKey = (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;

    if (e.key === 'Escape') {
      handlers.escape?.();
      return;
    }
    if (!mod) return;

    const key = e.key.toLowerCase();
    switch (key) {
      case 'enter':
        if (handlers.send) {
          e.preventDefault();
          handlers.send();
        }
        break;
      case 's':
        if (handlers.save) {
          e.preventDefault();
          handlers.save();
        }
        break;
      case 't':
        if (handlers.newTab) {
          e.preventDefault();
          handlers.newTab();
        }
        break;
      case 'w':
        if (handlers.closeTab) {
          e.preventDefault();
          handlers.closeTab();
        }
        break;
      case 'f':
        if (handlers.find) {
          e.preventDefault();
          handlers.find();
        }
        break;
      case 'k':
        if (handlers.palette) {
          e.preventDefault();
          handlers.palette();
        }
        break;
      default:
        break;
    }
  };

  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}

export const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: '⌘ ↵', label: 'Send request' },
  { keys: '⌘ S', label: 'Save request' },
  { keys: '⌘ T', label: 'New tab' },
  { keys: '⌘ W', label: 'Close tab' },
  { keys: '⌘ F', label: 'Search sidebar' },
  { keys: '⌘ K', label: 'Command palette' },
  { keys: 'Esc', label: 'Close menus/modals' },
];
