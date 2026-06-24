'use client';

import { useEffect, useState } from 'react';

import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';
import { useCollectionsStore } from '@/stores/collectionsStore';
import { useEnvironmentsStore } from '@/stores/environmentsStore';
import { useHistoryStore } from '@/stores/historyStore';
import { hydrateTabs } from '@/stores/tabsStore';
import { hydrateUi } from '@/stores/uiStore';

export default function Page() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    hydrateUi();
    let cancelled = false;
    (async () => {
      // Server is source of truth; load core data before hydrating tabs so that
      // saved-request tabs can re-link to their collections.
      await Promise.all([
        useCollectionsStore.getState().load(),
        useEnvironmentsStore.getState().load(),
        useHistoryStore.getState().load(),
      ]);
      if (cancelled) return;
      hydrateTabs();
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-tertiary)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 24, height: 24, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          <div style={{ fontSize: 13 }}>Loading workspace…</div>
        </div>
      </main>
    );
  }

  return (
    <main>
      <WorkspaceShell />
    </main>
  );
}
