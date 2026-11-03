'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  deleteCategory,
  listCategories,
  updateCategory,
  type AdminCategory,
} from '@/lib/admin-products';
import { CategoryEditor, ConfirmDialog } from '../operations/[section]/editors';

/**
 * The category tree: the shop's departments and what sellers list in them.
 *
 * Rows arrive parents-first, so indenting each by its depth draws the tree.
 * Order is edited in place with the arrows (swap with the neighbouring
 * sibling); everything else opens the editor.
 */

const cell: React.CSSProperties = { whiteSpace: 'nowrap', width: '1%' };
const muted: React.CSSProperties = { color: 'var(--admin-text-2)' };

export default function AdminCategoriesPage() {
  const [rows, setRows] = useState<AdminCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ category: AdminCategory | null; parentId?: string } | null>(null);
  const [removing, setRemoving] = useState<AdminCategory | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(
    () =>
      listCategories()
        .then((list) => {
          setRows(list);
          setError(null);
        })
        .catch((err: Error) => setError(err.message)),
    []
  );

  useEffect(() => {
    void load();
  }, [load]);

  const siblings = (row: AdminCategory) =>
    (rows ?? []).filter((r) => (r.parentId ?? null) === (row.parentId ?? null));

  /**
   * Swap with the sibling above or below. Orders are renumbered 1…n first, so
   * siblings that all still sit at the default 0 can be told apart.
   */
  const move = async (row: AdminCategory, direction: -1 | 1) => {
    const list = siblings(row);
    const index = list.findIndex((r) => r.id === row.id);
    const other = list[index + direction];
    if (!other) return;
    const reordered = [...list];
    reordered[index] = other;
    reordered[index + direction] = row;
    setBusy(row.id);
    setError(null);
    try {
      await Promise.all(
        reordered.map((r, i) =>
          r.displayOrder === i + 1 ? Promise.resolve() : updateCategory(r.id, { displayOrder: i + 1 })
        )
      );
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const confirmRemoval = async () => {
    if (!removing) return;
    setBusy(removing.id);
    try {
      setNotice(await deleteCategory(removing.id));
      setRemoving(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
      setRemoving(null);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1 className="admin-page-title">Categories</h1>
          <p className="admin-page-sub">
            Departments in the shop&rsquo;s navigation, their subcategories, the listing template
            sellers fill in, and the commission taken on each.
          </p>
        </div>
        <div className="admin-page-actions">
          <button type="button" className="btn btn-primary" onClick={() => setEditing({ category: null })}>
            New category
          </button>
        </div>
      </div>

      {error && (
        <div className="admin-alert admin-alert--warn" style={{ marginBottom: 16 }}>
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="admin-alert" style={{ marginBottom: 16 }}>
          <span>{notice}</span>
        </div>
      )}

      <div className="admin-card admin-index">
        {rows === null ? (
          <div className="admin-empty">
            <p className="admin-empty-text">Loading…</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="admin-empty">
            <p className="admin-empty-title">No categories yet</p>
            <p className="admin-empty-text">Create a department to start listing products in it.</p>
          </div>
        ) : (
          <div className="admin-table-wrap" style={{ width: '100%', margin: 0, borderTop: 0 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th style={cell}>Template</th>
                  <th style={{ ...cell, textAlign: 'right' }}>Commission</th>
                  <th style={{ ...cell, textAlign: 'right' }}>Products</th>
                  <th style={cell}>Status</th>
                  <th style={cell}>Order</th>
                  <th style={{ ...cell, textAlign: 'right' }}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const list = siblings(row);
                  const index = list.findIndex((r) => r.id === row.id);
                  const inherited = !row.listingTemplate && row.resolvedTemplate;
                  return (
                    <tr key={row.id}>
                      <td style={{ paddingLeft: 12 + (row.depth ?? 0) * 22 }}>
                        <span style={{ fontWeight: row.depth ? 400 : 600 }}>
                          {row.depth ? '↳ ' : ''}
                          {row.name}
                        </span>{' '}
                        <Link href={`/c/${(row.path ?? [row.slug]).join('/')}`} style={muted} target="_blank">
                          /c/{(row.path ?? [row.slug]).join('/')}
                        </Link>
                      </td>
                      <td style={cell}>
                        {row.resolvedTemplate ? (
                          <span style={inherited ? muted : undefined}>
                            {row.resolvedTemplate}
                            {inherited ? ' (inherited)' : ''}
                          </span>
                        ) : (
                          <span style={muted}>—</span>
                        )}
                      </td>
                      <td style={{ ...cell, textAlign: 'right' }}>
                        {row.commissionRate === null || row.commissionRate === undefined ? (
                          <span style={muted}>Inherit</span>
                        ) : (
                          `${row.commissionRate}%`
                        )}
                      </td>
                      <td style={{ ...cell, textAlign: 'right' }}>{row._count?.products ?? 0}</td>
                      <td style={cell}>{row.isActive ? 'Visible' : <span style={muted}>Hidden</span>}</td>
                      <td style={cell}>
                        <div className="admin-actions">
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            aria-label={`Move ${row.name} up`}
                            disabled={index <= 0 || busy !== null}
                            onClick={() => void move(row, -1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            aria-label={`Move ${row.name} down`}
                            disabled={index >= list.length - 1 || busy !== null}
                            onClick={() => void move(row, 1)}
                          >
                            ↓
                          </button>
                        </div>
                      </td>
                      <td style={{ ...cell, textAlign: 'right' }}>
                        <div className="admin-actions">
                          <button type="button" className="btn btn-sm" onClick={() => setEditing({ category: row })}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            onClick={() => setEditing({ category: null, parentId: row.id })}
                          >
                            Add sub
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            style={{ color: 'var(--a-bad)' }}
                            onClick={() => setRemoving(row)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <CategoryEditor
          category={editing.category}
          categories={rows ?? []}
          parentId={editing.parentId}
          onClose={() => setEditing(null)}
          onSaved={(_category, message) => {
            setEditing(null);
            setNotice(message);
            void load();
          }}
        />
      )}

      {removing && (
        <ConfirmDialog
          title="Delete category"
          subject={removing.name}
          detail={
            (removing._count?.products ?? 0) > 0 || (removing._count?.children ?? 0) > 0
              ? `It still holds ${removing._count?.products ?? 0} product(s) and ${removing._count?.children ?? 0} subcategories, so it cannot be deleted. Move them first, or hide the category instead.`
              : 'It is empty and will be deleted outright.'
          }
          confirmLabel="Delete category"
          isBusy={busy === removing.id}
          onConfirm={() => void confirmRemoval()}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  );
}
