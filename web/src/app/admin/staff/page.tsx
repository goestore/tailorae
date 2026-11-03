'use client';

import React, { useEffect, useState, type FormEvent } from 'react';
import {
  createStaff,
  listStaff,
  PERMISSION_LABELS,
  setStaffPermissions,
  setStaffStatus,
  STAFF_PERMISSIONS,
  type StaffMember,
  type StaffPermission,
} from '@/lib/admin-staff';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth-api';
import { useStaff } from '@/components/admin/StaffContext';
import { Users } from '@/components/admin/icons';
import { ConfirmDialog } from '../operations/[section]/editors';

/**
 * Platform staff (`/admin/staff`, SUPER_ADMIN only).
 *
 * A staff member is created with a temporary password and a set of
 * permissions; each permission opens one part of the console (docs/ACCOUNTS.md,
 * "Platform staff"). Suspending signs them out everywhere at once. The API
 * refuses a super admin removing their own SUPER_ADMIN or suspending
 * themselves, and this screen does not offer either.
 */

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 60,
  display: 'grid',
  placeItems: 'center',
  padding: 20,
  overflowY: 'auto',
  background: 'rgba(0,0,0,0.6)',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  color: 'var(--admin-text-2)',
  fontSize: 13,
};

const PermissionChecklist: React.FC<{
  value: StaffPermission[];
  onChange: (value: StaffPermission[]) => void;
  /** Permissions the reader may not take away (their own SUPER_ADMIN). */
  locked?: StaffPermission[];
}> = ({ value, onChange, locked = [] }) => (
  <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'grid', gap: 8 }}>
    <legend style={labelStyle}>Permissions</legend>
    {STAFF_PERMISSIONS.map((permission) => {
      const checked = value.includes(permission);
      const isLocked = locked.includes(permission);
      return (
        <label
          key={permission}
          style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13 }}
        >
          <input
            type="checkbox"
            checked={checked}
            disabled={isLocked}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...value, permission]
                  : value.filter((held) => held !== permission)
              )
            }
            style={{ marginTop: 3 }}
          />
          <span>
            <strong>{PERMISSION_LABELS[permission].label}</strong>
            <span className="admin-kpi-sub" style={{ display: 'block' }}>
              {PERMISSION_LABELS[permission].detail}
            </span>
          </span>
        </label>
      );
    })}
  </fieldset>
);

const NewStaffDialog: React.FC<{
  onClose: () => void;
  onCreated: (member: StaffMember) => void;
}> = ({ onClose, onCreated }) => {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [permissions, setPermissions] = useState<StaffPermission[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`The temporary password needs at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    if (permissions.length === 0) {
      setError('Give at least one permission.');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      onCreated(
        await createStaff({ email: email.trim(), fullName: fullName.trim(), password, permissions })
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="New staff member" style={overlayStyle}>
      <form className="admin-card" style={{ maxWidth: 520, width: '100%' }} onSubmit={submit}>
        <p className="admin-kpi-label">New staff member</p>
        <p className="admin-kpi-sub" style={{ marginBottom: 16 }}>
          Share the temporary password privately; they should change it after signing in at
          /admin/login.
        </p>

        {error && (
          <div className="admin-alert admin-alert--warn" style={{ marginBottom: 12 }}>
            <span>{error}</span>
          </div>
        )}

        <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
          <label>
            <span style={labelStyle}>Full name</span>
            <input
              required
              maxLength={120}
              value={fullName}
              autoComplete="off"
              onChange={(event) => setFullName(event.target.value)}
              style={{ width: '100%' }}
            />
          </label>
          <label>
            <span style={labelStyle}>Email</span>
            <input
              required
              type="email"
              value={email}
              autoComplete="off"
              onChange={(event) => setEmail(event.target.value)}
              style={{ width: '100%' }}
            />
          </label>
          <label>
            <span style={labelStyle}>Temporary password</span>
            <input
              required
              type="password"
              minLength={PASSWORD_MIN_LENGTH}
              value={password}
              autoComplete="new-password"
              onChange={(event) => setPassword(event.target.value)}
              style={{ width: '100%' }}
            />
          </label>
          <PermissionChecklist value={permissions} onChange={setPermissions} />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSaving || !email.trim() || !fullName.trim()}
          >
            {isSaving ? 'Creating…' : 'Create account'}
          </button>
        </div>
      </form>
    </div>
  );
};

const PermissionsDialog: React.FC<{
  member: StaffMember;
  isSelf: boolean;
  onClose: () => void;
  onSaved: (member: StaffMember) => void;
}> = ({ member, isSelf, onClose, onSaved }) => {
  const [permissions, setPermissions] = useState<StaffPermission[]>(member.permissions);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (permissions.length === 0) {
      setError('Give at least one permission.');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      onSaved(await setStaffPermissions(member.id, permissions));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Permissions for ${member.fullName}`}
      style={overlayStyle}
    >
      <div className="admin-card" style={{ maxWidth: 480, width: '100%' }}>
        <p className="admin-kpi-label">Permissions</p>
        <p className="admin-kpi-value" style={{ fontSize: 20 }}>
          {member.fullName}
        </p>
        <p className="admin-kpi-sub" style={{ margin: '4px 0 16px' }}>
          {member.email}. Changes apply on their next request — no new sign-in needed.
        </p>
        {error && (
          <div className="admin-alert admin-alert--warn" style={{ marginBottom: 12 }}>
            <span>{error}</span>
          </div>
        )}
        <div style={{ marginBottom: 16 }}>
          <PermissionChecklist
            value={permissions}
            onChange={setPermissions}
            locked={isSelf ? ['SUPER_ADMIN'] : []}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={isSaving}
            onClick={() => void save()}
          >
            {isSaving ? 'Saving…' : 'Save permissions'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default function AdminStaffPage() {
  const me = useStaff();
  const [members, setMembers] = useState<StaffMember[] | null>(null);
  const [total, setTotal] = useState(0);
  const [reloads, setReloads] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [suspending, setSuspending] = useState<StaffMember | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listStaff(1, 100)
      .then((page) => {
        if (cancelled) return;
        setMembers(page.items ?? []);
        setTotal(page.total ?? 0);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [reloads]);

  const reload = () => setReloads((count) => count + 1);

  const changeStatus = async (member: StaffMember, status: 'ACTIVE' | 'SUSPENDED') => {
    setBusyId(member.id);
    setError(null);
    try {
      await setStaffStatus(member.id, status);
      setNotice(
        status === 'SUSPENDED'
          ? `${member.fullName} is suspended and signed out everywhere.`
          : `${member.fullName} can sign in again.`
      );
      setSuspending(null);
      reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1 className="admin-page-title">Staff</h1>
          <p className="admin-page-sub">
            Who can sign in to this console, and which parts of it each person can use.
          </p>
        </div>
        <div className="admin-page-actions">
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            New staff member
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
        {members === null && !error ? (
          <div className="admin-empty">
            <p className="admin-empty-text">Loading…</p>
          </div>
        ) : !members?.length ? (
          <div className="admin-empty">
            <span className="admin-empty-icon">
              <Users size={22} />
            </span>
            <p className="admin-empty-title">No staff yet</p>
          </div>
        ) : (
          <>
            <div className="admin-toolbar">
              <span className="admin-toolbar-meta" style={{ marginLeft: 'auto' }}>
                {members.length} of {total}
              </span>
            </div>
            <div className="admin-table-wrap" style={{ width: '100%', margin: 0, borderTop: 0 }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th style={{ width: '1%', whiteSpace: 'nowrap' }}>Name</th>
                    <th style={{ width: '1%' }}>Email</th>
                    <th>Permissions</th>
                    <th style={{ width: '1%' }}>Status</th>
                    <th style={{ width: '1%', whiteSpace: 'nowrap' }}>Added</th>
                    <th style={{ width: '1%' }}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => {
                    const isSelf = member.id === me?.id;
                    return (
                      <tr key={member.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <span className="admin-row-title">{member.fullName}</span>
                          {isSelf && <span className="admin-kpi-sub"> (you)</span>}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>{member.email}</td>
                        <td>
                          <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
                            {member.permissions.map((permission) => (
                              <span
                                key={permission}
                                className="admin-status-badge"
                                data-status={permission === 'SUPER_ADMIN' ? 'DRAFT' : 'NEUTRAL'}
                              >
                                {PERMISSION_LABELS[permission]?.label ?? permission}
                              </span>
                            ))}
                          </span>
                        </td>
                        <td>
                          <span className="admin-status-badge" data-status={member.status}>
                            {member.status === 'ACTIVE' ? 'Active' : 'Suspended'}
                          </span>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {new Date(member.createdAt).toLocaleDateString('en-IN')}
                        </td>
                        <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                          <div className="admin-actions">
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => setEditing(member)}
                            >
                              Permissions
                            </button>
                            {!isSelf &&
                              (member.status === 'ACTIVE' ? (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-ghost"
                                  style={{ color: 'var(--a-bad)' }}
                                  disabled={busyId === member.id}
                                  onClick={() => setSuspending(member)}
                                >
                                  Suspend
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  disabled={busyId === member.id}
                                  onClick={() => void changeStatus(member, 'ACTIVE')}
                                >
                                  {busyId === member.id ? 'Saving…' : 'Reinstate'}
                                </button>
                              ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {creating && (
        <NewStaffDialog
          onClose={() => setCreating(false)}
          onCreated={(member) => {
            setCreating(false);
            setNotice(`${member.fullName} can now sign in with the temporary password.`);
            reload();
          }}
        />
      )}

      {editing && (
        <PermissionsDialog
          member={editing}
          isSelf={editing.id === me?.id}
          onClose={() => setEditing(null)}
          onSaved={(member) => {
            setEditing(null);
            setNotice(`Permissions saved for ${member.fullName}.`);
            reload();
          }}
        />
      )}

      {suspending && (
        <ConfirmDialog
          title="Suspend staff member"
          subject={suspending.fullName}
          detail="They are signed out of every device now and cannot sign in until reinstated. Their past actions stay in the audit log."
          confirmLabel="Suspend"
          isBusy={busyId === suspending.id}
          onConfirm={() => void changeStatus(suspending, 'SUSPENDED')}
          onCancel={() => setSuspending(null)}
        />
      )}
    </div>
  );
}
