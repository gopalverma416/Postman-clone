'use client';

// Renders a string with {{var}} tokens highlighted. Resolved (in scope) tokens are
// orange; unresolved tokens are red. Used as an overlay-style read display.
import { Fragment } from 'react';

import { TOKEN_RE } from '@/lib/variableResolver';
import { getScope } from '@/stores/environmentsStore';
import s from '@/styles/common.module.css';

export function highlightVariables(text: string, scope: Record<string, string>): JSX.Element[] {
  const out: JSX.Element[] = [];
  const re = new RegExp(TOKEN_RE.source, 'g');
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(<Fragment key={`t${i}`}>{text.slice(last, m.index)}</Fragment>);
    const name = m[1].trim();
    const resolved = Object.prototype.hasOwnProperty.call(scope, name);
    out.push(
      <span
        key={`v${i}`}
        className={resolved ? s.varToken : s.varTokenUnresolved}
        title={resolved ? `${name} = ${scope[name]}` : `${name} is not defined in the active environment`}
      >
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
    i += 1;
  }
  if (last < text.length) out.push(<Fragment key="tail">{text.slice(last)}</Fragment>);
  return out;
}

/** Inline highlighted display of a value containing {{variables}}. */
export function VariableText({ text }: { text: string }) {
  const scope = getScope();
  return <span className={s.varText}>{highlightVariables(text, scope)}</span>;
}
