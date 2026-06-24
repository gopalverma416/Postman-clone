'use client';

import { useEffect, useMemo, useState } from 'react';

import { Icon } from '@/components/common/Icon';
import { Modal } from '@/components/modals/ModalRoot';
import { useEnvironmentsStore } from '@/stores/environmentsStore';
import { useUiStore } from '@/stores/uiStore';
import s from '@/styles/modal.module.css';
import type { EnvVar } from '@/types';

/** Ensure a trailing blank row so typing always appends a new one. */
function withBlank(vars: EnvVar[]): EnvVar[] {
  const nonEmpty = vars.filter((v) => v.key !== '' || v.value !== '');
  return [...nonEmpty, { key: '', value: '', enabled: true, secret: false }];
}

export function ManageEnvironmentsModal() {
  const closeModal = useUiStore((st) => st.closeModal);
  const environments = useEnvironmentsStore((st) => st.environments);
  const create = useEnvironmentsStore((st) => st.create);
  const remove = useEnvironmentsStore((st) => st.remove);

  const [selectedId, setSelectedId] = useState<string | null>(environments[0]?.id ?? null);
  const selected = useMemo(() => environments.find((e) => e.id === selectedId) ?? null, [environments, selectedId]);

  const [name, setName] = useState('');
  const [vars, setVars] = useState<EnvVar[]>([]);

  // Sync the editor when the selected env changes (or appears after create).
  useEffect(() => {
    if (selected) {
      setName(selected.name);
      setVars(withBlank(selected.variables));
    } else {
      setName('');
      setVars(withBlank([]));
    }
  }, [selectedId, selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep a valid selection as the list changes.
  useEffect(() => {
    if (selectedId && !environments.some((e) => e.id === selectedId)) {
      setSelectedId(environments[0]?.id ?? null);
    } else if (!selectedId && environments.length) {
      setSelectedId(environments[0].id);
    }
  }, [environments, selectedId]);

  const onNew = async () => {
    const env = await create('New Environment');
    if (env) setSelectedId(env.id);
  };

  const onDelete = (id: string) => {
    void remove(id);
    if (id === selectedId) setSelectedId(null);
  };

  const updateVar = (index: number, patch: Partial<EnvVar>) => {
    setVars((rows) => withBlank(rows.map((r, i) => (i === index ? { ...r, ...patch } : r))));
  };

  const deleteVar = (index: number) => {
    setVars((rows) => withBlank(rows.filter((_, i) => i !== index)));
  };

  const onSave = () => {
    if (!selected) return;
    const cleaned = vars.filter((v) => v.key !== '' || v.value !== '');
    void useEnvironmentsStore.getState().replace(selected.id, name.trim() || 'Untitled', cleaned);
    closeModal();
  };

  return (
    <Modal
      title="Manage Environments"
      size="lg"
      onClose={closeModal}
      footer={
        <>
          <button type="button" className={s.btn} onClick={closeModal}>
            Close
          </button>
          <button type="button" className={`${s.btn} ${s.btnPrimary}`} disabled={!selected} onClick={onSave}>
            Save
          </button>
        </>
      }
    >
      <div className={s.envLayout}>
        <div className={s.envList}>
          {environments.map((env) => (
            <div
              key={env.id}
              className={`${s.envListItem} ${env.id === selectedId ? s.envListItemActive : ''}`}
              onClick={() => setSelectedId(env.id)}
              role="button"
              tabIndex={0}
            >
              <span className={s.envName}>{env.name}</span>
              <button
                type="button"
                className={s.rowDelete}
                aria-label={`Delete ${env.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(env.id);
                }}
              >
                <Icon name="trash" size={14} />
              </button>
            </div>
          ))}
          <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={onNew} style={{ justifyContent: 'flex-start' }}>
            <Icon name="plus" size={14} /> New
          </button>
        </div>

        <div className={s.envEditor}>
          {!selected ? (
            <p className={s.message}>Select an environment, or create one with “+ New”.</p>
          ) : (
            <>
              <div className={s.formRow}>
                <label className={s.label} htmlFor="env-name">
                  Environment name
                </label>
                <input id="env-name" className={s.input} value={name} onChange={(e) => setName(e.target.value)} />
              </div>

              <div className={s.formRow}>
                <span className={s.label}>Variables</span>
                <div className={s.grid}>
                  <div className={s.gridHead}>
                    <span className={s.gridHeadCell} />
                    <span className={s.gridHeadCell}>Variable</span>
                    <span className={s.gridHeadCell}>Value</span>
                    <span className={s.gridHeadCell}>Secret</span>
                    <span className={s.gridHeadCell} />
                  </div>
                  {vars.map((v, i) => {
                    const isPhantom = i === vars.length - 1;
                    return (
                      <div className={s.gridRow} key={i}>
                        <span className={s.gridCheck}>
                          <input
                            type="checkbox"
                            checked={v.enabled}
                            onChange={(e) => updateVar(i, { enabled: e.target.checked })}
                            aria-label="Enabled"
                          />
                        </span>
                        <input
                          className={s.gridInput}
                          value={v.key}
                          placeholder="key"
                          onChange={(e) => updateVar(i, { key: e.target.value })}
                        />
                        <input
                          className={s.gridInput}
                          value={v.value}
                          placeholder="value"
                          type={v.secret ? 'password' : 'text'}
                          onChange={(e) => updateVar(i, { value: e.target.value })}
                        />
                        <label className={s.gridSecret}>
                          <input
                            type="checkbox"
                            checked={!!v.secret}
                            onChange={(e) => updateVar(i, { secret: e.target.checked })}
                            aria-label="Secret"
                          />
                        </label>
                        {isPhantom ? (
                          <span />
                        ) : (
                          <button
                            type="button"
                            className={s.rowDelete}
                            aria-label="Delete variable"
                            onClick={() => deleteVar(i)}
                          >
                            <Icon name="x" size={14} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
