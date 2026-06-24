'use client';

// Body editor: none | raw | form-data | x-www-form-urlencoded.
import dynamic from 'next/dynamic';

import { KeyValueEditor } from '@/components/builder/KeyValueEditor';
import { monacoLangForRaw } from '@/lib/contentType';
import { useTabsStore } from '@/stores/tabsStore';
import { useUiStore } from '@/stores/uiStore';
import type { BodyType, RawLang, RequestBody } from '@/types';
import s from '@/styles/builder.module.css';

const MonacoEditor = dynamic(() => import('@/components/builder/MonacoEditor'), { ssr: false });

const BODY_TYPES: { type: BodyType; label: string }[] = [
  { type: 'none', label: 'none' },
  { type: 'raw', label: 'raw' },
  { type: 'form-data', label: 'form-data' },
  { type: 'x-www-form-urlencoded', label: 'x-www-form-urlencoded' },
];

const RAW_LANGS: RawLang[] = ['json', 'text', 'xml', 'html', 'javascript'];

export function BodyEditor({ tabId }: { tabId: string }) {
  const body = useTabsStore((st) => st.tabs.find((t) => t.id === tabId)?.draft.body) ?? { type: 'none' as BodyType };
  const setBody = useTabsStore((st) => st.setBody);
  const toast = useUiStore((st) => st.toast);

  const update = (patch: Partial<RequestBody>) => setBody(tabId, { ...body, ...patch });

  const beautify = () => {
    if (body.rawLang !== 'json') return;
    try {
      update({ raw: JSON.stringify(JSON.parse(body.raw ?? ''), null, 2) });
    } catch {
      toast('error', 'Cannot beautify', 'Body is not valid JSON');
    }
  };

  return (
    <div className={s.requestEditor}>
      <div className={s.bodyTypeRow}>
        {BODY_TYPES.map(({ type, label }) => (
          <label key={type} className={`${s.bodyRadio} ${body.type === type ? s.bodyRadioActive : ''}`}>
            <input
              type="radio"
              name={`bodyType-${tabId}`}
              checked={body.type === type}
              onChange={() => update({ type })}
            />
            {label}
          </label>
        ))}
      </div>

      {body.type === 'none' && <div className={s.mutedMsg}>This request has no body.</div>}

      {body.type === 'raw' && (
        <>
          <div className={s.rawToolbar}>
            <select
              className={s.beautifyBtn}
              value={body.rawLang ?? 'json'}
              onChange={(e) => update({ rawLang: e.target.value as RawLang })}
            >
              {RAW_LANGS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            {body.rawLang === 'json' && (
              <button type="button" className={s.beautifyBtn} onClick={beautify}>
                Beautify
              </button>
            )}
          </div>
          <div className={s.monacoWrap}>
            <MonacoEditor
              language={monacoLangForRaw(body.rawLang)}
              value={body.raw ?? ''}
              onChange={(v) => update({ raw: v })}
            />
          </div>
        </>
      )}

      {body.type === 'form-data' && (
        <div className={s.subEditorBody}>
          <KeyValueEditor
            rows={body.formData ?? []}
            onChange={(rows) => update({ formData: rows })}
            showDescription
          />
        </div>
      )}

      {body.type === 'x-www-form-urlencoded' && (
        <div className={s.subEditorBody}>
          <KeyValueEditor
            rows={body.urlEncoded ?? []}
            onChange={(rows) => update({ urlEncoded: rows })}
            showDescription
          />
        </div>
      )}
    </div>
  );
}
