'use client';

import { CollectionTree } from '@/components/sidebar/CollectionTree';
import { Icon } from '@/components/common/Icon';
import { useCollectionsStore } from '@/stores/collectionsStore';
import { useUiStore } from '@/stores/uiStore';
import s from '@/styles/sidebar.module.css';

export function CollectionsPanel() {
  const collections = useCollectionsStore((st) => st.collections);
  const openModal = useUiStore((st) => st.openModal);

  const isEmpty = collections.length === 0;

  return (
    <div className={s.panel}>
      <div className={s.panelHeader}>
        <span className={s.panelTitle}>Collections</span>
        <button
          type="button"
          className={s.kebab}
          style={{ opacity: 1 }}
          title="New collection"
          aria-label="New collection"
          onClick={() => openModal('createCollection')}
        >
          <Icon name="plus" size={16} />
        </button>
      </div>

      {isEmpty ? (
        <div className={s.panelEmpty}>
          <span className={s.panelEmptyIcon}>
            <Icon name="collection" size={32} />
          </span>
          <span className={s.panelEmptyHeading}>No collections yet</span>
          <span className={s.panelEmptySub}>
            Create a collection to organize and save your requests.
          </span>
          <button type="button" className={s.ctaBtn} onClick={() => openModal('createCollection')}>
            <Icon name="plus" size={14} />
            New Collection
          </button>
        </div>
      ) : (
        <div className={s.panelScroll}>
          <CollectionTree />
        </div>
      )}
    </div>
  );
}
