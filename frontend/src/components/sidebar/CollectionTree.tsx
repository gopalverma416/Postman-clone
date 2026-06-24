'use client';

import { useMemo, useState } from 'react';

import { TreeNode } from '@/components/sidebar/TreeNode';
import type { DropdownItem } from '@/components/common/Dropdown';
import { requestsApi, importExportApi } from '@/lib/api/client';
import { useCollectionsStore } from '@/stores/collectionsStore';
import { useTabsStore } from '@/stores/tabsStore';
import { useUiStore } from '@/stores/uiStore';
import type { Collection, Folder, RequestSummary } from '@/types';
import s from '@/styles/sidebar.module.css';

/** True when the query matches the name (case-insensitive). Empty query matches all. */
function matches(name: string, q: string): boolean {
  if (!q) return true;
  return name.toLowerCase().includes(q.toLowerCase());
}

export function CollectionTree() {
  const collections = useCollectionsStore((s) => s.collections);
  const filter = useCollectionsStore((s) => s.filter);
  const expanded = useCollectionsStore((s) => s.expanded);
  const toggleExpand = useCollectionsStore((s) => s.toggleExpand);
  const renameCollection = useCollectionsStore((s) => s.renameCollection);
  const renameFolder = useCollectionsStore((s) => s.renameFolder);
  const deleteCollection = useCollectionsStore((s) => s.deleteCollection);
  const deleteFolder = useCollectionsStore((s) => s.deleteFolder);
  const deleteRequest = useCollectionsStore((s) => s.deleteRequest);
  const createFolder = useCollectionsStore((s) => s.createFolder);

  const openModal = useUiStore((s) => s.openModal);
  const toast = useUiStore((s) => s.toast);

  const activeRequestId = useTabsStore((st) => {
    const tab = st.tabs.find((t) => t.id === st.activeTabId);
    return tab?.requestId ?? null;
  });

  const [loadingId, setLoadingId] = useState<string | null>(null);

  const q = filter.trim();

  const openRequest = async (id: string) => {
    setLoadingId(id);
    try {
      const saved = await requestsApi.get(id);
      useTabsStore.getState().openSavedRequest(saved);
    } catch (e) {
      toast('error', 'Failed to open request', String((e as Error).message));
    } finally {
      setLoadingId(null);
    }
  };

  const exportCollection = async (col: Collection) => {
    try {
      const doc = await importExportApi.exportCollection(col.id);
      const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${col.name.replace(/[^\w.-]+/g, '_') || 'collection'}.postman_collection.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast('error', 'Failed to export collection', String((e as Error).message));
    }
  };

  if (collections.length === 0) return null;

  return (
    <div className={s.tree} role="tree">
      {collections.map((col) => (
        <CollectionBranch
          key={col.id}
          collection={col}
          q={q}
          expanded={expanded}
          activeRequestId={activeRequestId}
          loadingId={loadingId}
          onToggle={toggleExpand}
          onOpenRequest={openRequest}
          onRenameCollection={renameCollection}
          onRenameFolder={renameFolder}
          onDeleteCollection={(c) =>
            openModal('confirm', {
              title: 'Delete collection',
              message: `Delete "${c.name}" and all its requests? This cannot be undone.`,
              confirmLabel: 'Delete',
              danger: true,
              onConfirm: () => deleteCollection(c.id),
            })
          }
          onDeleteFolder={(f) =>
            openModal('confirm', {
              title: 'Delete folder',
              message: `Delete folder "${f.name}" and its requests?`,
              confirmLabel: 'Delete',
              danger: true,
              onConfirm: () => deleteFolder(f.id),
            })
          }
          onDeleteRequest={(r) =>
            openModal('confirm', {
              title: 'Delete request',
              message: `Delete request "${r.name}"?`,
              confirmLabel: 'Delete',
              danger: true,
              onConfirm: () => deleteRequest(r.id),
            })
          }
          onAddRequest={(collectionId, folderId) => {
            // Open a fresh tab targeted at this collection/folder, then save it.
            // SaveRequestModal operates on a real open tab, so we create one first.
            const tabsStore = useTabsStore.getState();
            const tabId = tabsStore.openBlank();
            useTabsStore.setState((st) => ({
              tabs: st.tabs.map((t) => (t.id === tabId ? { ...t, collectionId, folderId } : t)),
            }));
            openModal('saveRequest', { tabId, collectionId, folderId });
          }}
          onAddFolder={(collectionId, parentFolderId) => {
            const name = window.prompt(parentFolderId ? 'New subfolder name' : 'New folder name');
            if (name && name.trim()) void createFolder(collectionId, name.trim(), parentFolderId);
          }}
          onExportCollection={exportCollection}
          onOpenRequestAction={openRequest}
        />
      ))}
    </div>
  );
}

interface BranchProps {
  collection: Collection;
  q: string;
  expanded: Record<string, boolean>;
  activeRequestId: string | null;
  loadingId: string | null;
  onToggle: (id: string) => void;
  onOpenRequest: (id: string) => void;
  onRenameCollection: (id: string, name: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteCollection: (c: Collection) => void;
  onDeleteFolder: (f: Folder) => void;
  onDeleteRequest: (r: RequestSummary) => void;
  onAddRequest: (collectionId: string, folderId: string | null) => void;
  onAddFolder: (collectionId: string, parentFolderId: string | null) => void;
  onExportCollection: (c: Collection) => void;
  onOpenRequestAction: (id: string) => void;
}

function CollectionBranch(props: BranchProps) {
  const {
    collection: col,
    q,
    expanded,
    activeRequestId,
    loadingId,
    onToggle,
    onOpenRequest,
    onRenameCollection,
    onRenameFolder,
    onDeleteCollection,
    onDeleteFolder,
    onDeleteRequest,
    onAddRequest,
    onAddFolder,
    onExportCollection,
    onOpenRequestAction,
  } = props;

  // Group folders by parent and requests by folder.
  const { childFolders, requestsByFolder } = useMemo(() => {
    const cf: Record<string, Folder[]> = {};
    for (const f of col.folders) {
      const key = f.parentFolderId ?? '__root__';
      (cf[key] ??= []).push(f);
    }
    Object.values(cf).forEach((arr) => arr.sort((a, b) => a.sortOrder - b.sortOrder));
    const rf: Record<string, RequestSummary[]> = {};
    for (const r of col.requests) {
      const key = r.folderId ?? '__root__';
      (rf[key] ??= []).push(r);
    }
    Object.values(rf).forEach((arr) => arr.sort((a, b) => a.sortOrder - b.sortOrder));
    return { childFolders: cf, requestsByFolder: rf };
  }, [col.folders, col.requests]);

  // Determine if this collection has any match (filter active).
  const collectionVisible = useMemo(() => {
    if (!q) return true;
    if (matches(col.name, q)) return true;
    if (col.folders.some((f) => matches(f.name, q))) return true;
    if (col.requests.some((r) => matches(r.name, q))) return true;
    return false;
  }, [q, col.name, col.folders, col.requests]);

  if (!collectionVisible) return null;

  // When filtering, force-expand so matches are visible; otherwise use store state.
  const isOpen = q ? true : !!expanded[col.id];

  const collectionMenu: DropdownItem[] = [
    { key: 'add-request', label: 'Add Request', onSelect: () => onAddRequest(col.id, null) },
    { key: 'add-folder', label: 'Add Folder', onSelect: () => onAddFolder(col.id, null) },
    { key: 'rename', label: 'Rename', onSelect: () => onRenameCollection(col.id, window.prompt('Rename collection', col.name)?.trim() || col.name) },
    { key: 'export', label: 'Export', onSelect: () => onExportCollection(col) },
    { key: 'sep', separator: true, label: '' },
    { key: 'delete', label: 'Delete', danger: true, onSelect: () => onDeleteCollection(col) },
  ];

  const rootFolders = childFolders['__root__'] ?? [];
  const rootRequests = requestsByFolder['__root__'] ?? [];

  return (
    <>
      <TreeNode
        kind="collection"
        depth={0}
        name={col.name}
        expanded={isOpen}
        hasChildren={col.folders.length > 0 || col.requests.length > 0}
        onToggle={() => onToggle(col.id)}
        onRename={(next) => onRenameCollection(col.id, next)}
        menuItems={collectionMenu}
      />
      {isOpen ? (
        <>
          {rootFolders.map((f) => (
            <FolderBranch
              key={f.id}
              folder={f}
              depth={1}
              q={q}
              expanded={expanded}
              childFolders={childFolders}
              requestsByFolder={requestsByFolder}
              activeRequestId={activeRequestId}
              loadingId={loadingId}
              onToggle={onToggle}
              onOpenRequest={onOpenRequest}
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
              onDeleteRequest={onDeleteRequest}
              onAddFolder={onAddFolder}
            />
          ))}
          {rootRequests
            .filter((r) => matches(r.name, q) || matches(col.name, q))
            .map((r) => (
              <TreeNode
                key={r.id}
                kind="request"
                depth={1}
                name={r.name}
                method={r.method}
                selected={activeRequestId === r.id}
                loading={loadingId === r.id}
                onClick={() => onOpenRequest(r.id)}
                menuItems={[
                  { key: 'open', label: 'Open', onSelect: () => onOpenRequestAction(r.id) },
                  { key: 'delete', label: 'Delete', danger: true, onSelect: () => onDeleteRequest(r) },
                ]}
              />
            ))}
        </>
      ) : null}
    </>
  );
}

interface FolderBranchProps {
  folder: Folder;
  depth: number;
  q: string;
  expanded: Record<string, boolean>;
  childFolders: Record<string, Folder[]>;
  requestsByFolder: Record<string, RequestSummary[]>;
  activeRequestId: string | null;
  loadingId: string | null;
  onToggle: (id: string) => void;
  onOpenRequest: (id: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (f: Folder) => void;
  onDeleteRequest: (r: RequestSummary) => void;
  onAddFolder: (collectionId: string, parentFolderId: string | null) => void;
}

function FolderBranch(props: FolderBranchProps) {
  const {
    folder,
    depth,
    q,
    expanded,
    childFolders,
    requestsByFolder,
    activeRequestId,
    loadingId,
    onToggle,
    onOpenRequest,
    onRenameFolder,
    onDeleteFolder,
    onDeleteRequest,
    onAddFolder,
  } = props;

  const subFolders = childFolders[folder.id] ?? [];
  const folderRequests = requestsByFolder[folder.id] ?? [];

  const folderVisible = useMemo(() => {
    if (!q) return true;
    if (matches(folder.name, q)) return true;
    if (subFolders.some((f) => matches(f.name, q))) return true;
    if (folderRequests.some((r) => matches(r.name, q))) return true;
    return false;
  }, [q, folder.name, subFolders, folderRequests]);

  if (!folderVisible) return null;

  const isOpen = q ? true : !!expanded[folder.id];

  const folderMenu: DropdownItem[] = [
    { key: 'add-folder', label: 'Add Folder', onSelect: () => onAddFolder(folder.collectionId, folder.id) },
    { key: 'rename', label: 'Rename', onSelect: () => onRenameFolder(folder.id, window.prompt('Rename folder', folder.name)?.trim() || folder.name) },
    { key: 'sep', separator: true, label: '' },
    { key: 'delete', label: 'Delete', danger: true, onSelect: () => onDeleteFolder(folder) },
  ];

  return (
    <>
      <TreeNode
        kind="folder"
        depth={depth}
        name={folder.name}
        expanded={isOpen}
        hasChildren={subFolders.length > 0 || folderRequests.length > 0}
        onToggle={() => onToggle(folder.id)}
        onRename={(next) => onRenameFolder(folder.id, next)}
        menuItems={folderMenu}
      />
      {isOpen ? (
        <>
          {subFolders.map((f) => (
            <FolderBranch
              key={f.id}
              folder={f}
              depth={depth + 1}
              q={q}
              expanded={expanded}
              childFolders={childFolders}
              requestsByFolder={requestsByFolder}
              activeRequestId={activeRequestId}
              loadingId={loadingId}
              onToggle={onToggle}
              onOpenRequest={onOpenRequest}
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
              onDeleteRequest={onDeleteRequest}
              onAddFolder={onAddFolder}
            />
          ))}
          {folderRequests
            .filter((r) => matches(r.name, q) || matches(folder.name, q))
            .map((r) => (
              <TreeNode
                key={r.id}
                kind="request"
                depth={depth + 1}
                name={r.name}
                method={r.method}
                selected={activeRequestId === r.id}
                loading={loadingId === r.id}
                onClick={() => onOpenRequest(r.id)}
                menuItems={[
                  { key: 'open', label: 'Open', onSelect: () => onOpenRequest(r.id) },
                  { key: 'delete', label: 'Delete', danger: true, onSelect: () => onDeleteRequest(r) },
                ]}
              />
            ))}
        </>
      ) : null}
    </>
  );
}
