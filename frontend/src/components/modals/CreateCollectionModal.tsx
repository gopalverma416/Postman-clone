'use client';

import { useState } from 'react';

import { Modal } from '@/components/modals/ModalRoot';
import { useCollectionsStore } from '@/stores/collectionsStore';
import { useUiStore } from '@/stores/uiStore';
import s from '@/styles/modal.module.css';

export function CreateCollectionModal() {
  const closeModal = useUiStore((st) => st.closeModal);
  const createCollection = useCollectionsStore((st) => st.createCollection);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const canCreate = name.trim().length > 0 && !busy;

  const submit = async () => {
    if (!canCreate) return;
    setBusy(true);
    const col = await createCollection(name.trim());
    setBusy(false);
    if (col) closeModal();
  };

  return (
    <Modal
      title="Create Collection"
      size="sm"
      onClose={closeModal}
      footer={
        <>
          <button type="button" className={s.btn} onClick={closeModal}>
            Cancel
          </button>
          <button type="button" className={`${s.btn} ${s.btnPrimary}`} disabled={!canCreate} onClick={submit}>
            Create
          </button>
        </>
      }
    >
      <div className={s.formRow}>
        <label className={s.label} htmlFor="cc-name">
          Name
        </label>
        <input
          id="cc-name"
          className={s.input}
          value={name}
          autoFocus
          placeholder="My Collection"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
      </div>
    </Modal>
  );
}
