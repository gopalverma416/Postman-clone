'use client';

import { useRef, useState, type ChangeEvent } from 'react';

import { Modal } from '@/components/modals/ModalRoot';
import { importExportApi } from '@/lib/api/client';
import { useCollectionsStore } from '@/stores/collectionsStore';
import { useUiStore } from '@/stores/uiStore';
import s from '@/styles/modal.module.css';

type Tab = 'import' | 'export';

export function ImportExportModal() {
  const closeModal = useUiStore((st) => st.closeModal);
  const toast = useUiStore((st) => st.toast);
  const collections = useCollectionsStore((st) => st.collections);

  const [tab, setTab] = useState<Tab>('import');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [exportId, setExportId] = useState(collections[0]?.id ?? '');
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ''));
    reader.readAsText(file);
  };

  const doImport = async () => {
    if (!text.trim() || busy) return;
    let doc: unknown;
    try {
      doc = JSON.parse(text);
    } catch {
      toast('error', 'Invalid JSON', 'Could not parse the pasted collection.');
      return;
    }
    setBusy(true);
    try {
      await importExportApi.importCollection(doc);
      await useCollectionsStore.getState().load();
      toast('success', 'Collection imported');
      closeModal();
    } catch (e) {
      toast('error', 'Import failed', String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const doExport = async () => {
    if (!exportId || busy) return;
    setBusy(true);
    try {
      const doc = await importExportApi.exportCollection(exportId);
      const col = collections.find((c) => c.id === exportId);
      const fileName = `${(col?.name ?? 'collection').replace(/[^a-z0-9-_]+/gi, '_')}.postman_collection.json`;
      const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast('success', 'Collection exported');
    } catch (e) {
      toast('error', 'Export failed', String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const footer =
    tab === 'import' ? (
      <>
        <button type="button" className={s.btn} onClick={closeModal}>
          Cancel
        </button>
        <button type="button" className={`${s.btn} ${s.btnPrimary}`} disabled={!text.trim() || busy} onClick={doImport}>
          Import
        </button>
      </>
    ) : (
      <>
        <button type="button" className={s.btn} onClick={closeModal}>
          Cancel
        </button>
        <button type="button" className={`${s.btn} ${s.btnPrimary}`} disabled={!exportId || busy} onClick={doExport}>
          Export
        </button>
      </>
    );

  return (
    <Modal title="Import / Export" onClose={closeModal} footer={footer}>
      <div className={s.tabRow}>
        <button
          type="button"
          className={`${s.tab} ${tab === 'import' ? s.tabActive : ''}`}
          onClick={() => setTab('import')}
        >
          Import
        </button>
        <button
          type="button"
          className={`${s.tab} ${tab === 'export' ? s.tabActive : ''}`}
          onClick={() => setTab('export')}
        >
          Export
        </button>
      </div>

      {tab === 'import' ? (
        <>
          <div className={s.formRow}>
            <span className={s.label}>Paste Postman v2.1 collection JSON</span>
            <textarea
              className={s.textarea}
              value={text}
              placeholder='{ "info": { "schema": "...v2.1.0..." }, "item": [] }'
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <div className={s.formRow}>
            <button type="button" className={s.btn} onClick={() => fileRef.current?.click()} style={{ alignSelf: 'flex-start' }}>
              Choose file…
            </button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={onFile} />
            <span className={s.helpText}>Or load a .json file from disk.</span>
          </div>
        </>
      ) : (
        <div className={s.formRow}>
          <label className={s.label} htmlFor="ie-collection">
            Collection to export
          </label>
          {collections.length === 0 ? (
            <p className={s.message}>No collections to export yet.</p>
          ) : (
            <select id="ie-collection" className={s.select} value={exportId} onChange={(e) => setExportId(e.target.value)}>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </Modal>
  );
}
