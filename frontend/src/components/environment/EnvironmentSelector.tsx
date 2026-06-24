'use client';

import { Dropdown, type DropdownItem } from '@/components/common/Dropdown';
import { Icon } from '@/components/common/Icon';
import { useEnvironmentsStore } from '@/stores/environmentsStore';
import { useUiStore } from '@/stores/uiStore';
import s from '@/styles/workspace.module.css';

/** Active-environment switcher used in the top bar. */
export function EnvironmentSelector() {
  const environments = useEnvironmentsStore((st) => st.environments);
  const activeEnvId = useEnvironmentsStore((st) => st.activeEnvId);
  const setActive = useEnvironmentsStore((st) => st.setActive);
  const openModal = useUiStore((st) => st.openModal);

  const active = environments.find((e) => e.id === activeEnvId) ?? null;

  const items: DropdownItem[] = [
    ...environments.map((env) => ({
      key: env.id,
      label: (
        <span className={s.envItem}>
          <span className={s.envCheck}>{env.id === activeEnvId ? <Icon name="check" size={14} /> : null}</span>
          <span className={s.envItemLabel}>{env.name}</span>
        </span>
      ),
      onSelect: () => void setActive(env.id),
    })),
    {
      key: '__none',
      label: (
        <span className={s.envItem}>
          <span className={s.envCheck}>{activeEnvId === null ? <Icon name="check" size={14} /> : null}</span>
          <span className={s.envItemLabel}>No Environment</span>
        </span>
      ),
      onSelect: () => void setActive(null),
    },
    { key: '__sep', label: null, separator: true },
    {
      key: '__manage',
      label: (
        <span className={s.envItem}>
          <span className={s.envCheck}>
            <Icon name="settings" size={14} />
          </span>
          <span className={s.envItemLabel}>Manage Environments</span>
        </span>
      ),
      onSelect: () => openModal('manageEnvironments'),
    },
  ];

  return (
    <Dropdown
      align="right"
      className={s.envSelector}
      trigger={
        <span className={s.envTrigger}>
          <span className={`${s.envTriggerLabel} ${active ? '' : s.envTriggerMuted}`}>{active ? active.name : 'No Environment'}</span>
          <Icon name="chevron-down" size={14} />
        </span>
      }
      items={items}
    />
  );
}
