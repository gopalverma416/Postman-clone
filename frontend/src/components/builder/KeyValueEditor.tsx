'use client';

// Reusable key/value grid with a Postman-style trailing phantom row.
// Typing in the phantom row's key or value appends a new blank row.
import { rowId } from '@/lib/id';
import { Icon } from '@/components/common/Icon';
import type { KeyValue } from '@/types';
import s from '@/styles/builder.module.css';

interface KeyValueEditorProps {
  rows: KeyValue[];
  onChange: (rows: KeyValue[]) => void;
  valuePlaceholder?: string;
  showDescription?: boolean;
}

function newRow(): KeyValue {
  return { id: rowId(), key: '', value: '', enabled: true };
}

/** Ensure exactly one trailing blank row so the user can always add another. */
function normalize(rows: KeyValue[]): KeyValue[] {
  const out = [...rows];
  const last = out[out.length - 1];
  if (!last || last.key !== '' || last.value !== '') {
    out.push(newRow());
  }
  return out;
}

export function KeyValueEditor({ rows, onChange, valuePlaceholder = 'Value', showDescription = false }: KeyValueEditorProps) {
  const display = normalize(rows);

  const patchRow = (id: string, patch: Partial<KeyValue>) => {
    onChange(normalize(display.map((r) => (r.id === id ? { ...r, ...patch } : r))));
  };

  const deleteRow = (id: string) => {
    onChange(normalize(display.filter((r) => r.id !== id)));
  };

  const realRows = display.filter((r) => r.key !== '' || r.value !== '');
  const allEnabled = realRows.length > 0 && realRows.every((r) => r.enabled);

  const toggleAll = (enabled: boolean) => {
    onChange(normalize(display.map((r) => (r.key !== '' || r.value !== '' ? { ...r, enabled } : r))));
  };

  return (
    <div className={s.kvTable}>
      <div className={s.kvHeaderRow}>
        <div className={s.kvCheckbox}>
          <input
            type="checkbox"
            aria-label="Enable all"
            checked={allEnabled}
            onChange={(e) => toggleAll(e.target.checked)}
          />
        </div>
        <div className={`${s.kvCell} ${s.kvHeaderCell}`}>Key</div>
        <div className={`${s.kvCell} ${s.kvHeaderCell}`}>Value</div>
        {showDescription && <div className={`${s.kvCell} ${s.kvHeaderCell}`}>Description</div>}
        <div className={s.kvDeleteSlot} />
      </div>

      {display.map((row) => {
        const isPhantom = row.key === '' && row.value === '';
        return (
          <div key={row.id} className={`${s.kvRow} ${row.enabled ? '' : s.kvRowDisabled}`}>
            <div className={s.kvCheckbox}>
              {!isPhantom && (
                <input
                  type="checkbox"
                  aria-label="Enabled"
                  checked={row.enabled}
                  onChange={(e) => patchRow(row.id, { enabled: e.target.checked })}
                />
              )}
            </div>
            <div className={s.kvCell}>
              <input
                className={s.kvCellInput}
                placeholder="Key"
                value={row.key}
                onChange={(e) => patchRow(row.id, { key: e.target.value })}
              />
            </div>
            <div className={s.kvCell}>
              <input
                className={s.kvCellInput}
                placeholder={valuePlaceholder}
                value={row.value}
                onChange={(e) => patchRow(row.id, { value: e.target.value })}
              />
            </div>
            {showDescription && (
              <div className={s.kvCell}>
                <input
                  className={s.kvCellInput}
                  placeholder="Description"
                  value={row.description ?? ''}
                  onChange={(e) => patchRow(row.id, { description: e.target.value })}
                />
              </div>
            )}
            <div className={s.kvDeleteSlot}>
              {!isPhantom && (
                <button
                  type="button"
                  className={s.kvDelete}
                  aria-label="Delete row"
                  onClick={() => deleteRow(row.id)}
                >
                  <Icon name="trash" size={14} />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
