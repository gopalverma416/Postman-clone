'use client';

// Sub-tab nav (Params / Authorization / Headers / Body) + the active sub-editor.
import { AuthEditor } from '@/components/builder/AuthEditor';
import { BodyEditor } from '@/components/builder/BodyEditor';
import { HeadersEditor } from '@/components/builder/HeadersEditor';
import { ParamsEditor } from '@/components/builder/ParamsEditor';
import { useTabsStore } from '@/stores/tabsStore';
import type { KeyValue, RequestSubTab } from '@/types';
import common from '@/styles/common.module.css';
import s from '@/styles/builder.module.css';

function countEnabled(rows: KeyValue[]): number {
  return rows.filter((r) => r.enabled && (r.key !== '' || r.value !== '')).length;
}

export function RequestEditor({ tabId }: { tabId: string }) {
  const tab = useTabsStore((st) => st.tabs.find((t) => t.id === tabId));
  const setActiveSubTab = useTabsStore((st) => st.setActiveSubTab);

  if (!tab) return null;
  const { draft, activeSubTab } = tab;

  const paramCount = countEnabled(draft.params);
  const headerCount = countEnabled(draft.headers);
  const bodyActive = draft.body.type !== 'none';
  const authActive = draft.auth.type !== 'none';

  const tabs: { key: RequestSubTab; label: string; badge?: number; dot?: boolean }[] = [
    { key: 'params', label: 'Params', badge: paramCount || undefined },
    { key: 'authorization', label: 'Authorization', dot: authActive },
    { key: 'headers', label: 'Headers', badge: headerCount || undefined },
    { key: 'body', label: 'Body', dot: bodyActive },
  ];

  return (
    <div className={s.requestEditor}>
      <div className={s.subTabNav} role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={activeSubTab === t.key}
            className={`${s.subTab} ${activeSubTab === t.key ? s.subTabActive : ''}`}
            onClick={() => setActiveSubTab(tabId, t.key)}
          >
            {t.label}
            {t.badge != null && <span className={common.countBadge}>{t.badge}</span>}
            {t.dot && <span className={s.subTabDot} />}
          </button>
        ))}
      </div>

      <div className={s.subEditorBody}>
        {activeSubTab === 'params' && <ParamsEditor tabId={tabId} />}
        {activeSubTab === 'authorization' && <AuthEditor tabId={tabId} />}
        {activeSubTab === 'headers' && <HeadersEditor tabId={tabId} />}
        {activeSubTab === 'body' && <BodyEditor tabId={tabId} />}
      </div>
    </div>
  );
}
