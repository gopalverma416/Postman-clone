'use client';

// The active tab's editor: a vertical split with the request editor on top and
// the response panel below. Split sizes persist via uiStore panelSizes 'builder'.
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

import { RequestEditor } from '@/components/builder/RequestEditor';
import { RequestUrlBar } from '@/components/builder/RequestUrlBar';
import { Icon } from '@/components/common/Icon';
import { ResponsePanel } from '@/components/response/ResponsePanel';
import { useTabsStore } from '@/stores/tabsStore';
import { useUiStore } from '@/stores/uiStore';
import common from '@/styles/common.module.css';
import s from '@/styles/builder.module.css';

export function RequestBuilderPane() {
  const tabs = useTabsStore((st) => st.tabs);
  const activeTabId = useTabsStore((st) => st.activeTabId);
  const openBlank = useTabsStore((st) => st.openBlank);
  const panelSizes = useUiStore((st) => st.panelSizes.builder);
  const setPanelSizes = useUiStore((st) => st.setPanelSizes);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  if (!activeTab) {
    return (
      <div className={common.emptyState}>
        <Icon name="send" size={40} className={common.emptyIcon} />
        <div className={common.emptyHeading}>No request open</div>
        <div className={common.emptySub}>Open a saved request or create a new one to get started.</div>
        <button type="button" className={common.btnPrimary} onClick={() => openBlank()} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)', height: 'var(--control-h)', padding: '0 var(--sp-4)', borderRadius: 'var(--radius)' }}>
          <Icon name="plus" size={16} />
          New Request
        </button>
      </div>
    );
  }

  const tabId = activeTab.id;
  const initial = panelSizes && panelSizes.length === 2 ? panelSizes : [55, 45];

  return (
    <div className={s.builderPane}>
      <PanelGroup direction="vertical" onLayout={(sizes) => setPanelSizes('builder', sizes)}>
        <Panel defaultSize={initial[0]} minSize={20} className={s.panel}>
          <div className={s.editorArea}>
            <RequestUrlBar tabId={tabId} />
            <RequestEditor tabId={tabId} />
          </div>
        </Panel>
        <PanelResizeHandle className={s.resizeHandle} />
        <Panel defaultSize={initial[1]} minSize={20} className={s.panel}>
          <ResponsePanel tabId={tabId} />
        </Panel>
      </PanelGroup>
    </div>
  );
}
