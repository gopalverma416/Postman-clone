'use client';

import { useEffect, useRef, useState } from 'react';

import { Dropdown, type DropdownItem } from '@/components/common/Dropdown';
import { Icon } from '@/components/common/Icon';
import { MethodBadge } from '@/components/common/MethodBadge';
import type { HttpMethod } from '@/types';
import c from '@/styles/common.module.css';
import s from '@/styles/sidebar.module.css';

export type TreeNodeKind = 'collection' | 'folder' | 'request';

export interface TreeNodeProps {
  kind: TreeNodeKind;
  depth: number;
  name: string;
  method?: HttpMethod;
  expanded?: boolean;
  hasChildren?: boolean;
  selected?: boolean;
  loading?: boolean;
  menuItems?: DropdownItem[];
  onToggle?: () => void;
  onClick?: () => void;
  /** Commit a new name (from inline rename). */
  onRename?: (next: string) => void;
}

export function TreeNode({
  kind,
  depth,
  name,
  method,
  expanded,
  hasChildren,
  selected,
  loading,
  menuItems,
  onToggle,
  onClick,
  onRename,
}: TreeNodeProps) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraftName(name);
      // Focus + select on next frame so the input is mounted.
      const id = window.requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
      return () => window.cancelAnimationFrame(id);
    }
    return undefined;
  }, [editing, name]);

  const showChevron = kind === 'collection' || kind === 'folder';
  const indent = depth * 12;

  const commit = () => {
    const next = draftName.trim();
    setEditing(false);
    if (next && next !== name) onRename?.(next);
  };

  const cancel = () => {
    setEditing(false);
    setDraftName(name);
  };

  const handleRowClick = () => {
    if (editing) return;
    if (kind === 'request') onClick?.();
    else onToggle?.();
  };

  return (
    <div
      className={`${s.treeRow} ${selected ? s.treeRowSelected : ''}`}
      style={{ paddingLeft: indent }}
      onClick={handleRowClick}
      role="treeitem"
      aria-expanded={showChevron ? !!expanded : undefined}
      aria-selected={selected || undefined}
    >
      <span className={s.chevronSlot}>
        {showChevron ? (
          <Icon
            name="chevron-right"
            size={14}
            className={`${s.chevron} ${expanded ? s.chevronOpen : ''}`}
          />
        ) : null}
      </span>

      {kind === 'request' && method ? (
        <MethodBadge method={method} style={{ minWidth: 34, flex: '0 0 auto' }} />
      ) : (
        <span className={s.rowIcon}>
          <Icon name={kind === 'collection' ? 'collection' : expanded ? 'folder-open' : 'folder'} size={15} />
        </span>
      )}

      {editing ? (
        <input
          ref={inputRef}
          className={s.nodeNameInput}
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
          onBlur={commit}
        />
      ) : (
        <span
          className={s.nodeName}
          title={name}
          onDoubleClick={(e) => {
            if (!onRename) return;
            e.stopPropagation();
            setEditing(true);
          }}
        >
          {name}
        </span>
      )}

      {loading ? <span className={c.spinner} style={{ width: 14, height: 14, flex: '0 0 auto' }} /> : null}

      {menuItems && menuItems.length > 0 && !editing ? (
        <Dropdown
          className={s.kebab}
          align="right"
          trigger={<Icon name="more" size={16} />}
          items={menuItems}
        />
      ) : null}
    </div>
  );
}
