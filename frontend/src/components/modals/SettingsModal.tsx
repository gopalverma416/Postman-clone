'use client';

import { Icon } from '@/components/common/Icon';
import { Modal } from '@/components/modals/ModalRoot';
import { SHORTCUTS } from '@/lib/shortcuts';
import { useUiStore } from '@/stores/uiStore';
import s from '@/styles/modal.module.css';
import type { Theme } from '@/types';

const COMING_SOON = ['Team Workspaces', 'Mock Servers', 'API Documentation', 'Monitors'];

export function SettingsModal() {
  const closeModal = useUiStore((st) => st.closeModal);
  const theme = useUiStore((st) => st.theme);
  const setTheme = useUiStore((st) => st.setTheme);

  const themeBtn = (value: Theme, icon: 'sun' | 'moon', label: string) => (
    <button
      type="button"
      className={`${s.themeOption} ${theme === value ? s.themeOptionActive : ''}`}
      onClick={() => setTheme(value)}
    >
      <Icon name={icon} size={16} />
      {label}
    </button>
  );

  return (
    <Modal
      title="Settings"
      onClose={closeModal}
      footer={
        <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={closeModal}>
          Done
        </button>
      }
    >
      <div className={s.section}>
        <div className={s.sectionTitle}>
          <Icon name="settings" size={16} /> Appearance
        </div>
        <div className={s.themeToggle}>
          {themeBtn('light', 'sun', 'Light')}
          {themeBtn('dark', 'moon', 'Dark')}
        </div>
      </div>

      <div className={s.section}>
        <div className={s.sectionTitle}>Keyboard Shortcuts</div>
        <div className={s.shortcutList}>
          {SHORTCUTS.map((sc) => (
            <div key={sc.label} className={s.shortcutItem}>
              <span>{sc.label}</span>
              <span className={s.kbd}>{sc.keys}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={s.section}>
        <div className={s.sectionTitle}>More</div>
        {COMING_SOON.map((label) => (
          <div key={label} className={s.comingSoonRow}>
            <span>{label}</span>
            <span className={s.comingSoon}>Coming Soon</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}
