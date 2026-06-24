'use client';

import { KeyValueEditor } from '@/components/builder/KeyValueEditor';
import { useTabsStore } from '@/stores/tabsStore';
import s from '@/styles/builder.module.css';

export function HeadersEditor({ tabId }: { tabId: string }) {
  const headers = useTabsStore((st) => st.tabs.find((t) => t.id === tabId)?.draft.headers ?? []);
  const setHeaders = useTabsStore((st) => st.setHeaders);

  return (
    <>
      <div className={s.hint}>Headers for content type and authorization are added automatically at send time.</div>
      <KeyValueEditor rows={headers} onChange={(rows) => setHeaders(tabId, rows)} showDescription />
    </>
  );
}
