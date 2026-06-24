'use client';

import { CollectionsPanel } from '@/components/sidebar/CollectionsPanel';
import { HistoryPanel } from '@/components/sidebar/HistoryPanel';
import { Icon } from '@/components/common/Icon';
import { useCollectionsStore } from '@/stores/collectionsStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useUiStore } from '@/stores/uiStore';
import s from '@/styles/sidebar.module.css';

export function Sidebar() {
  const sidebarTab = useUiStore((st) => st.sidebarTab);
  const setSidebarTab = useUiStore((st) => st.setSidebarTab);

  const collectionsFilter = useCollectionsStore((st) => st.filter);
  const setCollectionsFilter = useCollectionsStore((st) => st.setFilter);
  const historyFilter = useHistoryStore((st) => st.filter);
  const setHistoryFilter = useHistoryStore((st) => st.setFilter);

  const onCollections = sidebarTab === 'collections';

  const searchValue = onCollections ? collectionsFilter : historyFilter;
  const setSearch = onCollections ? setCollectionsFilter : setHistoryFilter;

  return (
    <div className={s.sidebar}>
      <div className={s.tabSwitch} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={onCollections}
          className={`${s.tabBtn} ${onCollections ? s.tabBtnActive : ''}`}
          onClick={() => setSidebarTab('collections')}
        >
          <Icon name="collection" size={14} />
          Collections
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!onCollections}
          className={`${s.tabBtn} ${!onCollections ? s.tabBtnActive : ''}`}
          onClick={() => setSidebarTab('history')}
        >
          <Icon name="history" size={14} />
          History
        </button>
      </div>

      <div className={s.searchRow}>
        <span className={s.searchIcon}>
          <Icon name="search" size={14} />
        </span>
        <input
          id="sidebar-search"
          className={s.searchInput}
          type="text"
          placeholder={onCollections ? 'Search collections' : 'Search history'}
          value={searchValue}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {onCollections ? <CollectionsPanel /> : <HistoryPanel />}
    </div>
  );
}
