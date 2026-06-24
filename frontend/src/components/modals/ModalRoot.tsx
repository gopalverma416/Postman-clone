'use client';

import { useEffect, type ReactNode } from 'react';

import { Icon } from '@/components/common/Icon';
import { ConfirmDialog } from '@/components/modals/ConfirmDialog';
import { CreateCollectionModal } from '@/components/modals/CreateCollectionModal';
import { ImportExportModal } from '@/components/modals/ImportExportModal';
import { ManageEnvironmentsModal } from '@/components/modals/ManageEnvironmentsModal';
import { SaveRequestModal } from '@/components/modals/SaveRequestModal';
import { SettingsModal } from '@/components/modals/SettingsModal';
import { useUiStore } from '@/stores/uiStore';
import s from '@/styles/modal.module.css';

export type ModalSize = 'sm' | 'md' | 'lg';

/**
 * Reusable modal shell: scrim + centered dialog. Esc and scrim-click close via
 * uiStore.closeModal. Exported so sibling modal files reuse the same chrome.
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
  size = 'md',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const sizeClass = size === 'sm' ? s.dialogSm : size === 'lg' ? s.dialogLg : '';

  return (
    <div className={s.scrim} onMouseDown={onClose} role="presentation">
      <div
        className={`${s.dialog} ${sizeClass}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={s.modalHeader}>
          <span className={s.modalTitle}>{title}</span>
          <button type="button" className={s.modalClose} onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className={s.modalBody}>{children}</div>
        {footer && <div className={s.modalFooter}>{footer}</div>}
      </div>
    </div>
  );
}

/** Reads useUiStore.modal and renders the matching modal. Null when no modal. */
export function ModalRoot() {
  const modal = useUiStore((st) => st.modal);
  if (!modal) return null;

  const props = modal.props ?? {};

  switch (modal.type) {
    case 'createCollection':
      return <CreateCollectionModal />;
    case 'saveRequest':
      return <SaveRequestModal tabId={String(props.tabId ?? '')} />;
    case 'manageEnvironments':
      return <ManageEnvironmentsModal />;
    case 'settings':
      return <SettingsModal />;
    case 'importExport':
      return <ImportExportModal />;
    case 'confirm':
      return (
        <ConfirmDialog
          title={String(props.title ?? 'Are you sure?')}
          message={String(props.message ?? '')}
          confirmLabel={props.confirmLabel ? String(props.confirmLabel) : undefined}
          danger={Boolean(props.danger)}
          onConfirm={typeof props.onConfirm === 'function' ? (props.onConfirm as () => void) : undefined}
        />
      );
    default:
      return null;
  }
}
