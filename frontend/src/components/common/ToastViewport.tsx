'use client';

import { Toast } from '@/components/common/Toast';
import { useUiStore } from '@/stores/uiStore';
import s from '@/styles/modal.module.css';

export function ToastViewport() {
  const toasts = useUiStore((st) => st.toasts);
  const dismiss = useUiStore((st) => st.dismissToast);
  return (
    <div className={s.toastViewport}>
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={dismiss} />
      ))}
    </div>
  );
}
