'use client';

import { Icon } from '@/components/common/Icon';
import s from '@/styles/modal.module.css';
import type { Toast as ToastType } from '@/types';

export function Toast({ toast, onDismiss }: { toast: ToastType; onDismiss: (id: string) => void }) {
  return (
    <div className={`${s.toast} ${s[`toast_${toast.kind}`]}`} role="status">
      <span className={s.toastAccent} />
      <div className={s.toastBody}>
        <div className={s.toastMessage}>{toast.message}</div>
        {toast.description && <div className={s.toastDescription}>{toast.description}</div>}
      </div>
      <button className={s.toastClose} onClick={() => onDismiss(toast.id)} aria-label="Dismiss">
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}
