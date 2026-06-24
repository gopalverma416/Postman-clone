'use client';

// Authorization editor: None / Bearer Token / Basic Auth via a Dropdown.
import { Dropdown } from '@/components/common/Dropdown';
import { Icon } from '@/components/common/Icon';
import { useTabsStore } from '@/stores/tabsStore';
import type { AuthConfig, AuthType } from '@/types';
import s from '@/styles/builder.module.css';

const AUTH_LABELS: Record<AuthType, string> = {
  none: 'No Auth',
  bearer: 'Bearer Token',
  basic: 'Basic Auth',
};

export function AuthEditor({ tabId }: { tabId: string }) {
  const auth = useTabsStore((st) => st.tabs.find((t) => t.id === tabId)?.draft.auth) ?? { type: 'none' as AuthType };
  const setAuth = useTabsStore((st) => st.setAuth);

  const selectType = (type: AuthType) => {
    if (type === 'none') setAuth(tabId, { type: 'none' });
    else if (type === 'bearer') setAuth(tabId, { type: 'bearer', bearer: { token: auth.bearer?.token ?? '' } });
    else setAuth(tabId, { type: 'basic', basic: { username: auth.basic?.username ?? '', password: auth.basic?.password ?? '' } });
  };

  const updateBearer = (token: string) => {
    const next: AuthConfig = { type: 'bearer', bearer: { token } };
    setAuth(tabId, next);
  };

  const updateBasic = (patch: Partial<{ username: string; password: string }>) => {
    const next: AuthConfig = {
      type: 'basic',
      basic: {
        username: patch.username ?? auth.basic?.username ?? '',
        password: patch.password ?? auth.basic?.password ?? '',
      },
    };
    setAuth(tabId, next);
  };

  return (
    <>
      <div className={s.authTypeRow}>
        <span className={s.authLabel}>Type</span>
        <Dropdown
          trigger={
            <span className={s.methodPill}>
              {AUTH_LABELS[auth.type]}
              <span className={s.caret}>
                <Icon name="chevron-down" size={14} />
              </span>
            </span>
          }
          items={(Object.keys(AUTH_LABELS) as AuthType[]).map((t) => ({
            key: t,
            label: AUTH_LABELS[t],
            onSelect: () => selectType(t),
          }))}
        />
      </div>

      {auth.type === 'none' && <div className={s.mutedMsg}>This request does not use authorization.</div>}

      {auth.type === 'bearer' && (
        <div className={s.authFields}>
          <div className={s.authField}>
            <label htmlFor={`bearer-${tabId}`}>Token</label>
            <input
              id={`bearer-${tabId}`}
              className={s.monoInput}
              placeholder="Token"
              value={auth.bearer?.token ?? ''}
              onChange={(e) => updateBearer(e.target.value)}
            />
          </div>
        </div>
      )}

      {auth.type === 'basic' && (
        <div className={s.authFields}>
          <div className={s.authField}>
            <label htmlFor={`basic-user-${tabId}`}>Username</label>
            <input
              id={`basic-user-${tabId}`}
              className={s.monoInput}
              placeholder="Username"
              value={auth.basic?.username ?? ''}
              onChange={(e) => updateBasic({ username: e.target.value })}
            />
          </div>
          <div className={s.authField}>
            <label htmlFor={`basic-pass-${tabId}`}>Password</label>
            <input
              id={`basic-pass-${tabId}`}
              className={s.monoInput}
              type="password"
              placeholder="Password"
              value={auth.basic?.password ?? ''}
              onChange={(e) => updateBasic({ password: e.target.value })}
            />
          </div>
        </div>
      )}
    </>
  );
}
