'use client';

import { useState } from 'react';

import { Icon } from '@/components/common/Icon';
import { StatusPill } from '@/components/common/StatusPill';
import { formatSize, formatTime } from '@/lib/formatters';
import { useTabsStore } from '@/stores/tabsStore';
import { useUiStore } from '@/stores/uiStore';
import type { RequestErrorKind, ResponseSubTab } from '@/types';
import s from '@/styles/response.module.css';

import { ResponseBody } from './ResponseBody';
import { ResponseHeaders } from './ResponseHeaders';

const SUB_TABS: { id: ResponseSubTab; label: string }[] = [
  { id: 'pretty', label: 'Pretty' },
  { id: 'raw', label: 'Raw' },
  { id: 'headers', label: 'Headers' },
];

const ERROR_HEADING: Record<RequestErrorKind, string> = {
  timeout: 'Request timed out',
  network: 'Connection error',
  invalid_url: 'Invalid URL',
  blocked_host: 'Host blocked',
  tls: 'TLS error',
  too_many_redirects: 'Too many redirects',
  unknown: 'Request failed',
};

export function ResponsePanel({ tabId }: { tabId: string }) {
  const tab = useTabsStore((st) => st.tabs.find((t) => t.id === tabId));
  const setResponseSubTab = useTabsStore((st) => st.setResponseSubTab);
  const toast = useUiStore((st) => st.toast);
  const [copied, setCopied] = useState(false);

  if (!tab) return null;

  // Loading state.
  if (tab.loading) {
    return (
      <div className={s.loadingResponse}>
        <div className={s.spinner} />
        <span>Sending request…</span>
      </div>
    );
  }

  // Error state.
  if (tab.error) {
    return (
      <div className={s.errorPanel}>
        <div className={s.errorIcon}>
          <Icon name="x" size={28} />
        </div>
        <div className={s.errorHeading}>{ERROR_HEADING[tab.error.kind]}</div>
        <div className={s.errorMessage}>{tab.error.message}</div>
      </div>
    );
  }

  // Empty / collapsed default.
  if (!tab.response) {
    return <div className={s.emptyResponse}>Enter the URL and click Send to get a response</div>;
  }

  const res = tab.response;

  const copyBody = () => {
    void navigator.clipboard?.writeText(res.body).then(
      () => {
        setCopied(true);
        toast('success', 'Response body copied');
        window.setTimeout(() => setCopied(false), 1200);
      },
      () => toast('error', 'Copy failed'),
    );
  };

  return (
    <div className={s.responsePanel}>
      <div className={s.metaRow}>
        <div className={s.metaStats}>
          <StatusPill status={res.status} statusText={res.statusText} />
          <span className={s.metaDot}>·</span>
          <span className={s.metaMuted}>{formatTime(res.timeMs)}</span>
          <span className={s.metaDot}>·</span>
          <span className={s.metaMuted}>{formatSize(res.sizeBytes)}</span>
          {res.truncated && <span className={s.metaTruncated}>(truncated)</span>}
        </div>

        <div className={s.metaRight}>
          <button type="button" className={s.copyBtn} onClick={copyBody} title="Copy response body">
            <Icon name={copied ? 'check' : 'copy'} size={14} />
          </button>
          <nav className={s.respSubTabNav}>
            {SUB_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`${s.respSubTab} ${tab.responseSubTab === t.id ? s.respSubTabActive : ''}`}
                onClick={() => setResponseSubTab(tabId, t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {tab.responseSubTab === 'headers' ? (
        <ResponseHeaders headers={res.headers} />
      ) : (
        <ResponseBody
          body={res.body}
          contentType={res.contentType}
          mode={tab.responseSubTab === 'raw' ? 'raw' : 'pretty'}
          isBinary={res.isBinary}
        />
      )}
    </div>
  );
}
