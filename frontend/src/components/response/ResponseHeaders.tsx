'use client';

import { useUiStore } from '@/stores/uiStore';
import s from '@/styles/response.module.css';

/** Read-only 2-column header table, preserving order and duplicates. */
export function ResponseHeaders({ headers }: { headers: { key: string; value: string }[] }) {
  const toast = useUiStore((st) => st.toast);

  if (!headers.length) {
    return <div className={s.emptyResponse}>No headers</div>;
  }

  const copyValue = (value: string) => {
    void navigator.clipboard?.writeText(value).then(
      () => toast('success', 'Copied'),
      () => toast('error', 'Copy failed'),
    );
  };

  return (
    <div className={s.bodyArea}>
      <table className={s.headersTable}>
        <tbody>
          {headers.map((h, i) => (
            <tr className={s.headerRow} key={`${h.key}-${i}`}>
              <td className={s.headerKey}>{h.key}</td>
              <td className={s.headerValue} onClick={() => copyValue(h.value)} title="Click to copy">
                {h.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
