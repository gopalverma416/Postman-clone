'use client';

import { useMemo, useState } from 'react';

import { Modal } from '@/components/modals/ModalRoot';
import { useCollectionsStore } from '@/stores/collectionsStore';
import { useTabsStore } from '@/stores/tabsStore';
import { useUiStore } from '@/stores/uiStore';
import s from '@/styles/modal.module.css';

export function SaveRequestModal({ tabId }: { tabId: string }) {
  const closeModal = useUiStore((st) => st.closeModal);
  const collections = useCollectionsStore((st) => st.collections);
  const tab = useTabsStore((st) => st.tabs.find((t) => t.id === tabId));

  const [name, setName] = useState(tab?.draft.name ?? 'Untitled Request');
  const [collectionId, setCollectionId] = useState(tab?.collectionId ?? collections[0]?.id ?? '');
  const [folderId, setFolderId] = useState<string>(tab?.folderId ?? '');
  const [busy, setBusy] = useState(false);

  const folders = useMemo(
    () => collections.find((c) => c.id === collectionId)?.folders ?? [],
    [collections, collectionId],
  );

  const canSave = !!tab && name.trim().length > 0 && !!collectionId && !busy;

  const submit = async () => {
    if (!tab || !canSave) return;
    setBusy(true);
    const saved = await useCollectionsStore
      .getState()
      .saveRequest(collectionId, folderId || null, tab.draft, name.trim());
    if (saved) {
      useTabsStore.getState().markSaved(tabId, saved);
      setBusy(false);
      closeModal();
    } else {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Save Request"
      onClose={closeModal}
      footer={
        <>
          <button type="button" className={s.btn} onClick={closeModal}>
            Cancel
          </button>
          <button type="button" className={`${s.btn} ${s.btnPrimary}`} disabled={!canSave} onClick={submit}>
            Save
          </button>
        </>
      }
    >
      {!tab ? (
        <p className={s.message}>This request is no longer open.</p>
      ) : collections.length === 0 ? (
        <p className={s.message}>Create a collection first to save this request.</p>
      ) : (
        <>
          <div className={s.formRow}>
            <label className={s.label} htmlFor="sr-name">
              Request name
            </label>
            <input
              id="sr-name"
              className={s.input}
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
            />
          </div>
          <div className={s.formRow}>
            <label className={s.label} htmlFor="sr-collection">
              Collection
            </label>
            <select
              id="sr-collection"
              className={s.select}
              value={collectionId}
              onChange={(e) => {
                setCollectionId(e.target.value);
                setFolderId('');
              }}
            >
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className={s.formRow}>
            <label className={s.label} htmlFor="sr-folder">
              Folder (optional)
            </label>
            <select id="sr-folder" className={s.select} value={folderId} onChange={(e) => setFolderId(e.target.value)}>
              <option value="">— Collection root —</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
    </Modal>
  );
}
