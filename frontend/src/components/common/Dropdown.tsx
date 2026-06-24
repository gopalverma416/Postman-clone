'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import s from '@/styles/common.module.css';

export interface DropdownItem {
  key: string;
  label: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
}

/** Accessible click-to-open menu. `trigger` is rendered as the toggle button content. */
export function Dropdown({
  trigger,
  items,
  align = 'left',
  className,
}: {
  trigger: ReactNode;
  items: DropdownItem[];
  align?: 'left' | 'right';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div className={`${s.dropdown} ${className ?? ''}`} ref={ref}>
      <button
        type="button"
        className={s.dropdownTrigger}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {trigger}
      </button>
      {open && (
        <div className={`${s.dropdownMenu} ${align === 'right' ? s.dropdownMenuRight : ''}`} role="menu">
          {items.map((it) =>
            it.separator ? (
              <div key={it.key} className={s.dropdownSeparator} />
            ) : (
              <button
                key={it.key}
                type="button"
                role="menuitem"
                disabled={it.disabled}
                className={`${s.dropdownItem} ${it.danger ? s.dropdownItemDanger : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  it.onSelect?.();
                }}
              >
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
