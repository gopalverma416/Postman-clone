'use client';

import { useEffect } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

import { CommandPalette } from '@/components/common/CommandPalette';
import { ToastViewport } from '@/components/common/ToastViewport';
import { RequestBuilderPane } from '@/components/builder/RequestBuilderPane';
import { TabBar } from '@/components/builder/TabBar';
import { ModalRoot } from '@/components/modals/ModalRoot';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { TopBar } from '@/components/workspace/TopBar';
import { registerShortcuts } from '@/lib/shortcuts';
import { useEnvironmentsStore } from '@/stores/environmentsStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useTabsStore } from '@/stores/tabsStore';
import { useUiStore } from '@/stores/uiStore';
import s from '@/styles/workspace.module.css';

/** Top-level application layout: top bar, sidebar/builder split, footer. */
export function WorkspaceShell() {
  const mainSizes = useUiStore((st) => st.panelSizes.main);
  const setPanelSizes = useUiStore((st) => st.setPanelSizes);
  const activeEnv = useEnvironmentsStore((st) => st.environments.find((e) => e.id === st.activeEnvId) ?? null);
  const historyTotal = useHistoryStore((st) => st.total);

  useEffect(() => {
    const unbind = registerShortcuts({
      send: () => {
        const { activeTabId } = useTabsStore.getState();
        if (activeTabId) void useTabsStore.getState().send(activeTabId);
      },
      newTab: () => {
        useTabsStore.getState().openBlank();
      },
      closeTab: () => {
        const { activeTabId } = useTabsStore.getState();
        if (activeTabId) useTabsStore.getState().closeTab(activeTabId);
      },
      save: () => {
        const { activeTabId } = useTabsStore.getState();
        if (activeTabId) useUiStore.getState().openModal('saveRequest', { tabId: activeTabId });
      },
      find: () => {
        const el = document.getElementById('sidebar-search');
        if (el) (el as HTMLInputElement).focus();
      },
      palette: () => {
        useUiStore.getState().setCommandPalette(true);
      },
      escape: () => {
        useUiStore.getState().setCommandPalette(false);
      },
    });
    return unbind;
  }, []);

  return (
    <div className={s.shell}>
      <TopBar />

      <PanelGroup
        direction="horizontal"
        className={s.panelGroup}
        onLayout={(sizes) => setPanelSizes('main', sizes)}
      >
        <Panel
          defaultSize={mainSizes?.[0] ?? 22}
          minSize={15}
          maxSize={40}
          order={1}
        >
          <Sidebar />
        </Panel>

        <PanelResizeHandle className={s.resizeHandle} />

        <Panel defaultSize={mainSizes?.[1] ?? 78} order={2}>
          <div className={s.mainArea}>
            <TabBar />
            <div className={s.builderPane}>
              <RequestBuilderPane />
            </div>
          </div>
        </Panel>
      </PanelGroup>

      <footer className={s.footer}>
        <span className={s.footerItem}>
          <span className={s.footerDot} aria-hidden="true" />
          <span className={s.footerEnv}>{activeEnv ? activeEnv.name : 'No Environment'}</span>
        </span>
        <span className={s.footerItem}>Ready</span>
        <span className={s.footerSpacer} />
        <span className={s.footerItem}>{historyTotal} in history</span>
      </footer>

      <ModalRoot />
      <ToastViewport />
      <CommandPalette />
    </div>
  );
}
