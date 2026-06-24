// Response rendering decision: pretty-print JSON, detect language for Monaco
// syntax highlighting, with header-lies-tolerant fallbacks (semantics pillar:
// measureAndFormatResponse / decideRendering).

export type RenderMode = 'json' | 'xml' | 'html' | 'text';

export interface RenderDecision {
  mode: RenderMode;
  monacoLanguage: string;
  pretty: string;
  raw: string;
  warn?: 'invalid-json';
}

// Cap pretty-printing to avoid freezing Monaco on huge bodies.
const PRETTY_LIMIT = 5 * 1024 * 1024;

export function decideRendering(contentType: string | null | undefined, bodyText: string): RenderDecision {
  const ct = contentType ?? '';
  const raw = bodyText ?? '';

  if (raw.length > PRETTY_LIMIT) {
    return { mode: 'text', monacoLanguage: 'plaintext', pretty: raw, raw };
  }

  const ctIsJson = /\bapplication\/(json|.*\+json)\b/i.test(ct);
  const looksJson = /^\s*[[{]/.test(raw);
  if (ctIsJson || looksJson) {
    try {
      const parsed = JSON.parse(raw);
      const pretty = JSON.stringify(parsed, null, 2);
      return { mode: 'json', monacoLanguage: 'json', pretty, raw };
    } catch {
      return { mode: 'text', monacoLanguage: 'plaintext', pretty: raw, raw, warn: ctIsJson ? 'invalid-json' : undefined };
    }
  }
  if (/xml/i.test(ct)) return { mode: 'xml', monacoLanguage: 'xml', pretty: raw, raw };
  if (/html/i.test(ct)) return { mode: 'html', monacoLanguage: 'html', pretty: raw, raw };
  return { mode: 'text', monacoLanguage: 'plaintext', pretty: raw, raw };
}

/** Monaco language for the raw-body request editor based on chosen language token. */
export function monacoLangForRaw(lang: string | undefined): string {
  switch (lang) {
    case 'json':
      return 'json';
    case 'xml':
      return 'xml';
    case 'html':
      return 'html';
    case 'javascript':
      return 'javascript';
    default:
      return 'plaintext';
  }
}
