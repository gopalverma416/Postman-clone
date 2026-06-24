'use client';

// URL row: method selector, URL input, Send (or Cancel while loading), Save.
import { MethodSelector } from '@/components/builder/MethodSelector';
import { Icon } from '@/components/common/Icon';
import { useCollectionsStore } from '@/stores/collectionsStore';
import { useTabsStore } from '@/stores/tabsStore';
import { useUiStore } from '@/stores/uiStore';
import common from '@/styles/common.module.css';
import s from '@/styles/builder.module.css';

export function RequestUrlBar({ tabId }: { tabId: string }) {
  const tab = useTabsStore((st) => st.tabs.find((t) => t.id === tabId));
  const setUrl = useTabsStore((st) => st.setUrl);
  const send = useTabsStore((st) => st.send);
  const cancel = useTabsStore((st) => st.cancel);
  const markSaved = useTabsStore((st) => st.markSaved);
  const updateRequest = useCollectionsStore((st) => st.updateRequest);
  const openModal = useUiStore((st) => st.openModal);

  if (!tab) return null;
  const { draft, loading, requestId } = tab;

  const handleSave = async () => {
    if (requestId && tab.collectionId) {
      const saved = await updateRequest(requestId, tab.collectionId, draft, tab.title);
      if (saved) markSaved(tabId, saved);
    } else {
      openModal('saveRequest', { tabId });
    }
  };

  return (
    <div className={s.urlBar}>
      <MethodSelector tabId={tabId} />
      <input
        className={s.urlInput}
        placeholder="Enter request URL"
        value={draft.url}
        spellCheck={false}
        onChange={(e) => setUrl(tabId, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !loading) send(tabId);
        }}
      />
      {loading ? (
        <button type="button" className={s.sendBtn} onClick={() => cancel(tabId)}>
          <span className={common.spinner} />
          Cancel
        </button>
      ) : (
        <button type="button" className={s.sendBtn} onClick={() => send(tabId)}>
          <Icon name="send" size={15} />
          Send
        </button>
      )}
      <button type="button" className={s.saveBtn} onClick={handleSave}>
        <Icon name="download" size={14} />
        Save
      </button>
    </div>
  );
}
