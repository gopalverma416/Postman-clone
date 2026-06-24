// Generate cURL / fetch snippets from a resolved RequestSpec (bonus feature).

import type { RequestSpec } from '@/types';

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function buildUrl(spec: RequestSpec): string {
  const enabled = spec.params.filter((p) => p.enabled && (p.key !== '' || p.value !== ''));
  if (enabled.length === 0) return spec.url;
  const qs = enabled.map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
  return spec.url.includes('?') ? `${spec.url}&${qs}` : `${spec.url}?${qs}`;
}

function authHeader(spec: RequestSpec): { key: string; value: string } | null {
  if (spec.auth.type === 'bearer') {
    const cfg = spec.auth.config as { token?: string } | undefined;
    return { key: 'Authorization', value: `Bearer ${cfg?.token ?? ''}` };
  }
  if (spec.auth.type === 'basic') {
    const cfg = spec.auth.config as { username?: string; password?: string } | undefined;
    const token = typeof btoa !== 'undefined' ? btoa(`${cfg?.username ?? ''}:${cfg?.password ?? ''}`) : '';
    return { key: 'Authorization', value: `Basic ${token}` };
  }
  return null;
}

function effectiveHeaders(spec: RequestSpec): { key: string; value: string }[] {
  const headers = spec.headers.filter((h) => h.enabled && h.key !== '').map((h) => ({ key: h.key, value: h.value }));
  const auth = authHeader(spec);
  if (auth) {
    const idx = headers.findIndex((h) => h.key.toLowerCase() === 'authorization');
    if (idx >= 0) headers[idx] = auth;
    else headers.push(auth);
  }
  // Body content-type (only if user didn't set one).
  const hasCt = headers.some((h) => h.key.toLowerCase() === 'content-type');
  if (!hasCt) {
    if (spec.body.type === 'raw') {
      const ct = { json: 'application/json', text: 'text/plain', xml: 'application/xml', html: 'text/html', javascript: 'application/javascript' }[spec.body.language ?? 'text'] ?? 'text/plain';
      headers.push({ key: 'Content-Type', value: ct });
    } else if (spec.body.type === 'x-www-form-urlencoded') {
      headers.push({ key: 'Content-Type', value: 'application/x-www-form-urlencoded' });
    }
  }
  return headers;
}

function bodyString(spec: RequestSpec): string | null {
  if (spec.body.type === 'raw') return spec.body.raw ?? '';
  if (spec.body.type === 'x-www-form-urlencoded') {
    return (spec.body.fields ?? [])
      .filter((f) => f.enabled && f.key !== '')
      .map((f) => `${encodeURIComponent(f.key)}=${encodeURIComponent(f.value)}`)
      .join('&');
  }
  return null;
}

export function toCurl(spec: RequestSpec): string {
  const url = buildUrl(spec);
  const parts: string[] = [`curl --location --request ${spec.method} ${shellQuote(url)}`];
  for (const h of effectiveHeaders(spec)) {
    parts.push(`  --header ${shellQuote(`${h.key}: ${h.value}`)}`);
  }
  if (spec.body.type === 'form-data') {
    for (const f of spec.body.fields ?? []) {
      if (f.enabled && f.key !== '') parts.push(`  --form ${shellQuote(`${f.key}=${f.value}`)}`);
    }
  } else {
    const body = bodyString(spec);
    if (body) parts.push(`  --data ${shellQuote(body)}`);
  }
  return parts.join(' \\\n');
}

export function toFetch(spec: RequestSpec): string {
  const url = buildUrl(spec);
  const headers = effectiveHeaders(spec);
  const headerObj = headers.reduce<Record<string, string>>((acc, h) => {
    acc[h.key] = h.value;
    return acc;
  }, {});
  const init: Record<string, unknown> = { method: spec.method };
  if (Object.keys(headerObj).length) init.headers = headerObj;
  const body = bodyString(spec);
  if (body != null && spec.body.type !== 'form-data') init.body = body;
  if (spec.body.type === 'form-data') {
    const lines = ['const form = new FormData();'];
    for (const f of spec.body.fields ?? []) {
      if (f.enabled && f.key !== '') lines.push(`form.append(${JSON.stringify(f.key)}, ${JSON.stringify(f.value)});`);
    }
    init.body = '__FORM__';
    const initStr = JSON.stringify(init, null, 2).replace('"__FORM__"', 'form');
    return `${lines.join('\n')}\n\nawait fetch(${JSON.stringify(url)}, ${initStr});`;
  }
  return `await fetch(${JSON.stringify(url)}, ${JSON.stringify(init, null, 2)});`;
}
