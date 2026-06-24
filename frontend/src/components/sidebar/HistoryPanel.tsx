'use client';

import { useMemo } from 'react';

import { Icon } from '@/components/common/Icon';
import { MethodBadge } from '@/components/common/MethodBadge';
import { dateGroup, formatRelative, statusClass } from '@/lib/formatters';
import { useHistoryStore } from '@/stores/historyStore';
import { useTabsStore } from '@/stores/tabsStore';
import { useUiStore } from '@/stores/uiStore';
import type { HistoryEntry } from '@/types';
import s from '@/styles/sidebar.module.css';

const STATUS_COLOR: Record<string, string> = {
  success: 'var(--status-success)',
  redirect: 'var(--status-redirect)',
  client: 'var(--status-error)',
  server: 'var(--status-error)',
  none: 'var(--text-tertiary)',
};

export function HistoryPanel() {
  const entries = useHistoryStore((st) => st.entries);
  const filter = useHistoryStore((st) => st.filter);
  const remove = useHistoryStore((st) => st.remove);
  const clear = useHistoryStore((st) => st.clear);
  const openModal = useUiStore((st) => st.openModal);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) => e.url.toLowerCase().includes(q) || e.method.toLowerCase().includes(q),
    );
  }, [entries, filter]);

  // Group entries (already newest-first) into date buckets, preserving order.
  const groups = useMemo(() => {
    const out: { label: string; items: HistoryEntry[] }[] = [];
    let current: { label: string; items: HistoryEntry[] } | null = null;
    for (const e of filtered) {
      const label = dateGroup(e.sentAt);
      if (!current || current.label !== label) {
        current = { label, items: [] };
        out.push(current);
      }
      current.items.push(e);
    }
    return out;
  }, [filtered]);

  const onClear = () => {
    openModal('confirm', {
      title: 'Clear history',
      message: 'Remove all history entries? This cannot be undone.',
      confirmLabel: 'Clear',
      danger: true,
      onConfirm: () => clear(),
    });
  };

  return (
    <div className={s.panel}>
      <div className={s.panelHeader}>
        <span className={s.panelTitle}>History</span>
        {entries.length > 0 ? (
          <button type="button" className={s.clearBtn} onClick={onClear}>
            Clear
          </button>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <div className={s.panelEmpty}>
          <span className={s.panelEmptyIcon}>
            <Icon name="history" size={32} />
          </span>
          <span className={s.panelEmptyHeading}>
            {entries.length === 0 ? 'No history yet' : 'No matches'}
          </span>
          <span className={s.panelEmptySub}>
            {entries.length === 0
              ? 'Requests you send will appear here.'
              : 'No history entries match your search.'}
          </span>
        </div>
      ) : (
        <div className={s.panelScroll}>
          {groups.map((g) => (
            <div className={s.historyGroup} key={g.label}>
              <div className={s.historyGroupHeader}>{g.label}</div>
              {g.items.map((e) => (
                <div
                  className={s.historyRow}
                  key={e.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => useTabsStore.getState().openHistory(e)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault();
                      useTabsStore.getState().openHistory(e);
                    }
                  }}
                >
                  <MethodBadge method={e.method} style={{ minWidth: 34, flex: '0 0 auto' }} />
                  <span className={s.historyUrl} title={e.url}>
                    {e.url}
                  </span>
                  <span className={s.historyMeta}>
                    {e.status != null ? (
                      <span
                        className={s.historyStatus}
                        style={{ color: STATUS_COLOR[statusClass(e.status)] }}
                      >
                        {e.status}
                      </span>
                    ) : null}
                    <span className={s.historyTime}>{formatRelative(e.sentAt)}</span>
                  </span>
                  <button
                    type="button"
                    className={s.historyDelete}
                    title="Delete entry"
                    aria-label="Delete entry"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      void remove(e.id);
                    }}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
