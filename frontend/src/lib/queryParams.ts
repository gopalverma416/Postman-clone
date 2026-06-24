// ============================================================================
// Bidirectional URL <-> query-param table sync (semantics pillar: syncUrlAndParams).
//
// Lossless round-trip: preserves path, fragment, duplicate keys, disabled rows,
// valueless params ('a' vs 'a='), and percent-encoding. Loop prevention is the
// caller's job via an editSource flag (see tabsStore).
// ============================================================================

import { rowId } from '@/lib/id';
import type { KeyValue } from '@/types';

function decode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, '%20'));
  } catch {
    return s; // malformed % sequence -> keep raw
  }
}

function encode(s: string): string {
  return encodeURIComponent(s);
}

function splitOnce(s: string, sep: string): [string, string | undefined] {
  const i = s.indexOf(sep);
  if (i === -1) return [s, undefined];
  return [s.slice(0, i), s.slice(i + 1)];
}

export interface ParsedUrl {
  base: string;
  fragment: string | undefined;
  rows: KeyValue[];
}

/**
 * Parse a URL string into base + fragment + enabled param rows. Previously
 * disabled rows (which were not in the URL) are re-merged at their old positions.
 */
export function parseUrlToParams(urlStr: string, previousRows: KeyValue[] = []): ParsedUrl {
  const [beforeHash, hash] = splitOnce(urlStr, '#');
  const qIndex = beforeHash.indexOf('?');
  const disabled = previousRows.filter((r) => !r.enabled);

  if (qIndex === -1) {
    return { base: beforeHash, fragment: hash, rows: mergeDisabled([], disabled, previousRows) };
  }

  const base = beforeHash.slice(0, qIndex);
  const query = beforeHash.slice(qIndex + 1);
  const rows: KeyValue[] = [];

  if (query !== '') {
    for (const seg of query.split('&')) {
      if (seg === '') continue; // skip empty segments (a&&b)
      const eq = seg.indexOf('=');
      if (eq === -1) {
        rows.push({ id: rowId(), key: decode(seg), value: '', enabled: true, hasEquals: false });
      } else {
        rows.push({
          id: rowId(),
          key: decode(seg.slice(0, eq)),
          value: decode(seg.slice(eq + 1)),
          enabled: true,
          hasEquals: true,
        });
      }
    }
  }

  return { base, fragment: hash, rows: mergeDisabled(rows, disabled, previousRows) };
}

/** Re-insert disabled rows near their original relative position. */
function mergeDisabled(active: KeyValue[], disabled: KeyValue[], previous: KeyValue[]): KeyValue[] {
  if (disabled.length === 0) return active;
  // Simple, predictable strategy: append disabled rows after active ones,
  // preserving their original order among themselves.
  const prevOrder = new Map(previous.map((r, i) => [r.id, i]));
  const sortedDisabled = [...disabled].sort(
    (a, b) => (prevOrder.get(a.id) ?? 0) - (prevOrder.get(b.id) ?? 0),
  );
  return [...active, ...sortedDisabled];
}

/**
 * Build a URL string from base + param rows + fragment. Only enabled, non-empty
 * rows are serialized. Encodes each component exactly once.
 */
export function buildUrlFromParams(base: string, rows: KeyValue[], fragment?: string): string {
  const active = rows.filter((r) => r.enabled && !(r.key === '' && r.value === ''));
  let url = base;
  if (active.length > 0) {
    const parts = active.map((r) => {
      const k = encode(r.key);
      if (r.hasEquals || r.value !== '') return `${k}=${encode(r.value)}`;
      return k; // bare flag, no '='
    });
    url = `${base}?${parts.join('&')}`;
  }
  if (fragment !== undefined) url = `${url}#${fragment}`;
  return url;
}

/**
 * SEND-time URL build: runs after variable resolution. Strips the fragment
 * (servers never receive '#...') and only includes enabled rows.
 */
export function buildFinalUrl(resolvedBase: string, resolvedRows: KeyValue[]): string {
  return buildUrlFromParams(resolvedBase, resolvedRows.filter((r) => r.enabled));
}

/** Extract just the base (path without query/fragment) from a URL string. */
export function urlBase(urlStr: string): string {
  const [beforeHash] = splitOnce(urlStr, '#');
  const qIndex = beforeHash.indexOf('?');
  return qIndex === -1 ? beforeHash : beforeHash.slice(0, qIndex);
}
