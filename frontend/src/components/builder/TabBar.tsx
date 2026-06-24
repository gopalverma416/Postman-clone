'use client';

// Horizontal strip of open request tabs. Active tab gets an app-bg fill + orange
// underline. Dirty tabs show a 6px orange dot that becomes an X close on hover.
import { Icon } from '@/components/common/Icon';
import { MethodBadge } from '@/components/common/MethodBadge';
import { useTabsStore } from '@/stores/tabsStore';
import s from '@/styles/builder.module.css';

export function TabBar() {
  const tabs = useTabsStore((st) => st.tabs);
  const activeTabId = useTabsStore((st) => st.activeTabId);
  const setActive = useTabsStore((st) => st.setActive);
  const closeTab = useTabsStore((st) => st.closeTab);
  const openBlank = useTabsStore((st) => st.openBlank);

  return (
    <div className={s.tabStrip} role="tablist">
      {tabs.map((tab) => {
        const title = tab.title || 'Untitled Request';
        const untitled = !tab.title || tab.title === 'Untitled Request';
        return (
          <div
            key={tab.id}
            role="tab"
            tabIndex={0}
            aria-selected={tab.id === activeTabId}
            className={`${s.tab} ${tab.id === activeTabId ? s.tabActive : ''}`}
            onClick={() => setActive(tab.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setActive(tab.id);
            }}
          >
            <MethodBadge method={tab.draft.method} style={{ minWidth: 30, fontSize: 10 }} />
            <span className={`${s.tabTitle} ${untitled ? s.tabTitleUntitled : ''}`}>{title}</span>
            <span className={`${s.tabSlot} ${tab.dirty ? s.tabSlotDirty : s.tabSlotClean}`}>
              {tab.dirty && <span className={s.tabDirtyDot} />}
              <button
                type="button"
                className={s.tabClose}
                aria-label="Close tab"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
              >
                <Icon name="x" size={12} />
              </button>
            </span>
          </div>
        );
      })}
      <button type="button" className={s.addTabBtn} aria-label="New request" onClick={() => openBlank()}>
        <Icon name="plus" size={16} />
      </button>
    </div>
  );
}
