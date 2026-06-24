'use client';

import { Modal } from '@/components/modals/ModalRoot';
import { useUiStore } from '@/stores/uiStore';
import s from '@/styles/modal.module.css';

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm?: () => void;
}) {
  const closeModal = useUiStore((st) => st.closeModal);

  const confirm = () => {
    onConfirm?.();
    closeModal();
  };

  return (
    <Modal
      title={title}
      size="sm"
      onClose={closeModal}
      footer={
        <>
          <button type="button" className={s.btn} onClick={closeModal}>
            Cancel
          </button>
          <button
            type="button"
            className={`${s.btn} ${danger ? s.btnDanger : s.btnPrimary}`}
            autoFocus
            onClick={confirm}
          >
            {confirmLabel ?? (danger ? 'Delete' : 'Confirm')}
          </button>
        </>
      }
    >
      <p className={s.message}>{message}</p>
    </Modal>
  );
}
