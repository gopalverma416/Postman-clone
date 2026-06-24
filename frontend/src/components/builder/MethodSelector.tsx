'use client';

// Method picker — a Dropdown (not a native select) whose trigger shows the
// current method in its method color with a caret; menu lists all 7 methods.
import { Dropdown } from '@/components/common/Dropdown';
import { Icon } from '@/components/common/Icon';
import { methodColor } from '@/components/common/MethodBadge';
import { useTabsStore } from '@/stores/tabsStore';
import { HTTP_METHODS, type HttpMethod } from '@/types';
import s from '@/styles/builder.module.css';

export function MethodSelector({ tabId }: { tabId: string }) {
  const method = useTabsStore((st) => st.tabs.find((t) => t.id === tabId)?.draft.method ?? 'GET');
  const setMethod = useTabsStore((st) => st.setMethod);

  return (
    <Dropdown
      trigger={
        <span className={s.methodPill} style={{ color: methodColor(method) }}>
          {method}
          <span className={s.caret}>
            <Icon name="chevron-down" size={14} />
          </span>
        </span>
      }
      items={HTTP_METHODS.map((m: HttpMethod) => ({
        key: m,
        label: (
          <span className={s.methodMenuItem} style={{ color: methodColor(m) }}>
            {m}
          </span>
        ),
        onSelect: () => setMethod(tabId, m),
      }))}
    />
  );
}
