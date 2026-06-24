'use client';

import { KeyValueEditor } from '@/components/builder/KeyValueEditor';
import { useTabsStore } from '@/stores/tabsStore';

export function ParamsEditor({ tabId }: { tabId: string }) {
  const params = useTabsStore((st) => st.tabs.find((t) => t.id === tabId)?.draft.params ?? []);
  const setParams = useTabsStore((st) => st.setParams);

  return <KeyValueEditor rows={params} onChange={(rows) => setParams(tabId, rows)} showDescription />;
}
