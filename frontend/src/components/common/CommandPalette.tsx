'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { Icon, type IconName } from '@/components/common/Icon';
import { requestsApi } from '@/lib/api/client';
import { useCollectionsStore } from '@/stores/collectionsStore';
import { useEnvironmentsStore } from '@/stores/environmentsStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useTabsStore } from '@/stores/tabsStore';
import { useUiStore } from '@/stores/uiStore';
import s from '@/styles/modal.module.css';

interface Command {
  id: string;
  label: string;
  group: string;
  icon: IconName;
  hint?: string;
  run: () => void;
}

export function CommandPalette() {
  const open = useUiStore((st) => st.commandPaletteOpen);
  const setOpen = useUiStore((st) => st.setCommandPalette);
  const collections = useCollectionsStore((st) => st.collections);
  const environments = useEnvironmentsStore((st) => st.environments);
  const tabs = useTabsStore((st) => st.tabs);

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      // Focus after mount.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const close = () => setOpen(false);
    const ui = useUiStore.getState();

    const actions: Command[] = [
      { id: 'a-new-request', label: 'New Request', group: 'Actions', icon: 'plus', run: () => { useTabsStore.getState().openBlank(); close(); } },
      { id: 'a-new-collection', label: 'New Collection', group: 'Actions', icon: 'collection', run: () => { ui.openModal('createCollection'); close(); } },
      { id: 'a-theme', label: 'Toggle Theme', group: 'Actions', icon: 'sun', run: () => { ui.toggleTheme(); close(); } },
      { id: 'a-environments', label: 'Manage Environments', group: 'Actions', icon: 'settings', run: () => { ui.openModal('manageEnvironments'); close(); } },
      { id: 'a-settings', label: 'Settings', group: 'Actions', icon: 'settings', run: () => { ui.openModal('settings'); close(); } },
      { id: 'a-clear-history', label: 'Clear History', group: 'Actions', icon: 'history', run: () => { void useHistoryStore.getState().clear(); close(); } },
    ];

    const tabCmds: Command[] = tabs.map((t) => ({
      id: `tab-${t.id}`,
      label: t.title || t.draft.url || 'Untitled Request',
      group: 'Open Requests',
      icon: 'file',
      hint: t.draft.method,
      run: () => { useTabsStore.getState().setActive(t.id); close(); },
    }));

    const reqCmds: Command[] = [];
    for (const c of collections) {
      for (const r of c.requests) {
        reqCmds.push({
          id: `req-${r.id}`,
          label: r.name,
          group: 'Collections',
          icon: 'file',
          hint: `${r.method} · ${c.name}`,
          run: () => {
            void (async () => {
              try {
                const full = await requestsApi.get(r.id);
                useTabsStore.getState().openSavedRequest(full);
              } catch (e) {
                useUiStore.getState().toast('error', 'Failed to open request', String((e as Error).message));
              }
            })();
            close();
          },
        });
      }
    }

    const envCmds: Command[] = environments.map((env) => ({
      id: `env-${env.id}`,
      label: `Activate: ${env.name}`,
      group: 'Environments',
      icon: 'check',
      run: () => { void useEnvironmentsStore.getState().setActive(env.id); close(); },
    }));

    return [...actions, ...tabCmds, ...reqCmds, ...envCmds];
  }, [collections, environments, tabs, setOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q) || (c.hint?.toLowerCase().includes(q) ?? false),
    );
  }, [commands, query]);

  // Clamp active index to current results.
  useEffect(() => {
    setActive((a) => (filtered.length ? Math.min(a, filtered.length - 1) : 0));
  }, [filtered.length]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      filtered[active]?.run();
    }
  };

  // Group rendering: track when the group label changes.
  let lastGroup = '';

  return (
    <div className={s.paletteScrim} onMouseDown={() => setOpen(false)} role="presentation">
      <div className={s.palette} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Command palette">
        <input
          ref={inputRef}
          className={s.paletteInput}
          value={query}
          placeholder="Search requests, environments, actions…"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className={s.paletteList} ref={listRef}>
          {filtered.length === 0 ? (
            <div className={s.paletteEmpty}>No matches</div>
          ) : (
            filtered.map((c, i) => {
              const showGroup = c.group !== lastGroup;
              lastGroup = c.group;
              return (
                <div key={c.id}>
                  {showGroup && <div className={s.paletteGroupLabel}>{c.group}</div>}
                  <button
                    type="button"
                    className={`${s.paletteItem} ${i === active ? s.paletteItemActive : ''}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => c.run()}
                  >
                    <Icon name={c.icon} size={16} className={s.paletteItemIcon} />
                    <span className={s.paletteItemLabel}>{c.label}</span>
                    {c.hint && <span className={s.paletteItemHint}>{c.hint}</span>}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
