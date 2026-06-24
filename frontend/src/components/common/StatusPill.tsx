'use client';

import { statusClass } from '@/lib/formatters';
import s from '@/styles/common.module.css';

const CLASS_COLOR: Record<string, string> = {
  success: 'var(--status-success)',
  redirect: 'var(--status-redirect)',
  client: 'var(--status-error)',
  server: 'var(--status-error)',
  none: 'var(--text-secondary)',
};

/** Color-coded status badge: "200 OK". */
export function StatusPill({ status, statusText }: { status: number | null; statusText?: string }) {
  const cls = statusClass(status);
  const color = CLASS_COLOR[cls];
  return (
    <span className={s.statusPill} style={{ color }}>
      {status ?? '—'}
      {statusText ? ` ${statusText}` : ''}
    </span>
  );
}
