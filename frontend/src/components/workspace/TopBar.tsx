'use client';

import { EnvironmentSelector } from '@/components/environment/EnvironmentSelector';
import { Icon } from '@/components/common/Icon';
import { useUiStore } from '@/stores/uiStore';
import s from '@/styles/workspace.module.css';
import commonStyles from '@/styles/common.module.css';

/** Application top bar: brand, environment selector, and global actions. */
export function TopBar() {
  const theme = useUiStore((st) => st.theme);
  const toggleTheme = useUiStore((st) => st.toggleTheme);
  const openModal = useUiStore((st) => st.openModal);

  return (
    <header className={s.topBar}>
      <div className={s.topBarLeft}>
        <span className={s.logo} aria-hidden="true" />
        <span className={s.wordmark}>API Client</span>
      </div>
      <div className={s.topBarRight}>
        <EnvironmentSelector />
        <button
          type="button"
          className={commonStyles.iconBtn}
          title="Environment variables"
          aria-label="Environment variables"
          onClick={() => openModal('manageEnvironments')}
        >
          <Icon name="eye" />
        </button>
        <button
          type="button"
          className={commonStyles.iconBtn}
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          aria-label="Toggle theme"
          onClick={toggleTheme}
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        </button>
        <button
          type="button"
          className={commonStyles.iconBtn}
          title="Import / Export"
          aria-label="Import or export"
          onClick={() => openModal('importExport')}
        >
          <Icon name="upload" />
        </button>
        <button
          type="button"
          className={commonStyles.iconBtn}
          title="Settings"
          aria-label="Settings"
          onClick={() => openModal('settings')}
        >
          <Icon name="settings" />
        </button>
      </div>
    </header>
  );
}
