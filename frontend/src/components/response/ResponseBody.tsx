'use client';

import dynamic from 'next/dynamic';

import { decideRendering } from '@/lib/contentType';
import { formatSize } from '@/lib/formatters';
import s from '@/styles/response.module.css';

const MonacoEditor = dynamic(() => import('@/components/builder/MonacoEditor'), { ssr: false });

interface ResponseBodyProps {
  body: string;
  contentType: string | null;
  mode: 'pretty' | 'raw';
  isBinary?: boolean;
}

export function ResponseBody({ body, contentType, mode, isBinary }: ResponseBodyProps) {
  if (isBinary) {
    return (
      <div className={s.emptyResponse}>
        Binary response — not previewed ({formatSize(body.length)})
      </div>
    );
  }

  const decision = decideRendering(contentType, body);

  if (mode === 'raw') {
    return (
      <div className={s.bodyArea}>
        <MonacoEditor value={body} language="plaintext" readOnly />
      </div>
    );
  }

  return (
    <div className={s.bodyArea}>
      {decision.warn === 'invalid-json' && (
        <div className={s.bodyWarning}>Content-Type is JSON but the body could not be parsed — showing as plain text.</div>
      )}
      <div className={s.bodyEditor}>
        <MonacoEditor value={decision.pretty} language={decision.monacoLanguage} readOnly />
      </div>
    </div>
  );
}
