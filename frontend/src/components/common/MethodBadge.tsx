'use client';

import type { CSSProperties } from 'react';

import type { HttpMethod } from '@/types';

const METHOD_VAR: Record<HttpMethod, string> = {
  GET: 'var(--method-get)',
  POST: 'var(--method-post)',
  PUT: 'var(--method-put)',
  PATCH: 'var(--method-patch)',
  DELETE: 'var(--method-delete)',
  HEAD: 'var(--method-head)',
  OPTIONS: 'var(--method-options)',
};

export function methodColor(method: HttpMethod): string {
  return METHOD_VAR[method] ?? 'var(--text-secondary)';
}

/** Small uppercase method label, colored, fixed-width so labels align in trees/tabs. */
export function MethodBadge({ method, style }: { method: HttpMethod; style?: CSSProperties }) {
  // Abbreviate long method names like Postman (DELETE -> DEL) for tree alignment.
  const label = method === 'DELETE' ? 'DEL' : method === 'OPTIONS' ? 'OPTS' : method;
  return (
    <span
      style={{
        color: methodColor(method),
        fontWeight: 700,
        fontSize: 11,
        letterSpacing: '0.04em',
        fontFamily: 'var(--font-mono)',
        minWidth: 36,
        display: 'inline-block',
        textAlign: 'left',
        ...style,
      }}
    >
      {label}
    </span>
  );
}
