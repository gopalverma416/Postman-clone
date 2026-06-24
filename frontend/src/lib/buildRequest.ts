// Conversions between the three request representations:
//   RequestDraft  (what a tab edits, KeyValue rows with client ids)
//   SavedRequest  (persisted nested shape from the API)
//   RequestSpec   (concrete wire shape sent to /api/run, variables resolved)

import { rowId } from '@/lib/id';
import type { SaveRequestPayload } from '@/lib/api/client';
import { resolveDraft } from '@/lib/variableResolver';
import type {
  AuthConfig,
  HttpMethod,
  KeyValue,
  RequestBody,
  RequestDraft,
  RequestSpec,
  SavedRequest,
  VariableScope,
} from '@/types';

export function emptyRow(): KeyValue {
  return { id: rowId(), key: '', value: '', enabled: true };
}

/** Ensure there is always exactly one trailing blank row (the Postman phantom row). */
export function withPhantomRow(rows: KeyValue[]): KeyValue[] {
  const nonEmpty = rows.filter((r) => r.key !== '' || r.value !== '');
  return [...nonEmpty, emptyRow()];
}

export function newDraft(partial?: Partial<RequestDraft>): RequestDraft {
  return {
    name: 'Untitled Request',
    method: 'GET',
    url: '',
    params: [emptyRow()],
    headers: [emptyRow()],
    auth: { type: 'none' },
    body: { type: 'none', rawLang: 'json', raw: '', formData: [emptyRow()], urlEncoded: [emptyRow()] },
    urlFragment: undefined,
    ...partial,
  };
}

function rowsFromSaved(rows: KeyValue[] | undefined): KeyValue[] {
  const mapped = (rows ?? []).map((r) => ({
    id: rowId(),
    key: r.key,
    value: r.value,
    enabled: r.enabled,
    description: r.description,
    hasEquals: r.hasEquals,
    fieldKind: r.fieldKind,
  }));
  return withPhantomRow(mapped);
}

export function savedRequestToDraft(r: SavedRequest): RequestDraft {
  const body: RequestBody = {
    type: r.body?.type ?? 'none',
    raw: r.body?.raw ?? '',
    rawLang: r.body?.rawLang ?? 'json',
    formData: rowsFromSaved(r.body?.formData),
    urlEncoded: rowsFromSaved(r.body?.urlEncoded),
  };
  return {
    name: r.name,
    method: r.method,
    url: r.url,
    params: rowsFromSaved(r.params),
    headers: rowsFromSaved(r.headers),
    auth: r.auth ?? { type: 'none' },
    body,
  };
}

function rowsToSaved(rows: KeyValue[]): KeyValue[] {
  return rows
    .filter((r) => r.key !== '' || r.value !== '')
    .map((r) => ({
      id: r.id,
      key: r.key,
      value: r.value,
      enabled: r.enabled,
      description: r.description,
      hasEquals: r.hasEquals,
      fieldKind: r.fieldKind,
    }));
}

/** Build the POST/PATCH payload (nested SavedRequest shape) from a draft. */
export function draftToSavePayload(draft: RequestDraft, name?: string): Omit<SaveRequestPayload, 'collectionId'> {
  const auth: AuthConfig = { type: draft.auth.type };
  if (draft.auth.type === 'bearer') auth.bearer = { token: draft.auth.bearer?.token ?? '' };
  if (draft.auth.type === 'basic')
    auth.basic = { username: draft.auth.basic?.username ?? '', password: draft.auth.basic?.password ?? '' };

  const body: RequestBody = {
    type: draft.body.type,
    raw: draft.body.raw ?? '',
    rawLang: draft.body.rawLang ?? 'json',
    formData: rowsToSaved(draft.body.formData ?? []),
    urlEncoded: rowsToSaved(draft.body.urlEncoded ?? []),
  };

  return {
    name: name ?? draft.name,
    method: draft.method as HttpMethod,
    url: draft.url,
    params: rowsToSaved(draft.params),
    headers: rowsToSaved(draft.headers),
    auth,
    body,
  };
}

/** Resolve a draft into a concrete wire RequestSpec (delegates to the resolver). */
export function draftToSpec(draft: RequestDraft, scope: VariableScope): { spec: RequestSpec; unresolved: string[] } {
  return resolveDraft(draft, scope);
}

/** Stable JSON for dirty-tracking (excludes client row ids and phantom blanks). */
export function draftFingerprint(draft: RequestDraft): string {
  return JSON.stringify(draftToSavePayload(draft, draft.name));
}
