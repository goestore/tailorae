'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { Button, Input, LoadingSpinner } from '@/components/common';
import { useSeller } from '@/components/seller/SellerContext';
import {
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  getTeam,
  inviteMember,
  removeMember,
  revokeInvite,
  type Invite,
  type Member,
  type SellerRole,
} from '@/lib/seller-api';
import type { RootState } from '@/store';
import { Select } from '../_components/fields';
import { NoShopYet, PageHeader, SectionTitle, formatDate } from '../_components/ui';

/**
 * The people who work in this shop, and the invites still open.
 *
 * Everyone in the shop can see the team; owners and managers invite and
 * remove (docs/ACCOUNTS.md, "Seller team members"). An invite is an email with
 * a link to `/seller/invite`, where the person signs in or creates a seller
 * account and joins with the role chosen here.
 */

const ROLES = Object.keys(ROLE_LABELS) as SellerRole[];

export default function SellerTeamPage() {
  const { me, can } = useSeller();
  const self = useSelector((state: RootState) => state.auth.user);
  const shop = me?.shop ?? null;
  const manage = can('MEMBERS');

  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<SellerRole>('CATALOG');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(
    () =>
      getTeam()
        .then((team) => {
          setMembers(team.members);
          setInvites(team.invites);
          setError(null);
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setIsLoading(false)),
    []
  );

  useEffect(() => {
    if (shop) void load();
  }, [shop, load]);

  if (!shop) return <NoShopYet />;
  if (isLoading) return <LoadingSpinner className="min-h-[50vh]" size="lg" />;

  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error('Enter the email address to send the invite to.');
      return;
    }
    setBusy('invite');
    try {
      await inviteMember(email, role);
      toast.success(`Invite sent to ${email.trim()}.`);
      setEmail('');
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (member: Member) => {
    if (!window.confirm(`Remove ${member.fullName} from ${shop.shopName}?`)) return;
    setBusy(member.accountId);
    try {
      await removeMember(member.accountId);
      toast.success(`${member.fullName} removed.`);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const withdraw = async (row: Invite) => {
    setBusy(row.id);
    try {
      await revokeInvite(row.id);
      toast.success('Invite withdrawn.');
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="section-y">
      <div className="container-max">
        <PageHeader
          title="Team"
          lead={`The people who work in ${shop.shopName}, and what each of them can do.`}
          actions={
            <Link href="/seller" className="btn btn-outline btn-sm">
              Back to overview
            </Link>
          }
        />
        {error && <p className="alert alert-error mt-6 text-sm">{error}</p>}

        <section className="mt-8 max-w-[860px]">
          <SectionTitle>Members</SectionTitle>
          <ul className="m-0 mt-4 flex list-none flex-col gap-px p-0" style={{ background: 'var(--border)' }}>
            {members.map((member) => {
              const isSelf = member.accountId === self?.id;
              return (
                <li
                  key={member.accountId}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 p-3.5"
                  style={{ background: 'var(--surface)' }}
                >
                  <div className="min-w-0">
                    <p className="m-0 text-[14px] font-medium text-ink">
                      {member.fullName}
                      {isSelf ? ' (you)' : ''}
                    </p>
                    <p className="m-0 truncate text-small" style={{ color: 'var(--ink-3)' }}>
                      {member.email} · since {formatDate(member.since)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-meta">
                    <span title={ROLE_DESCRIPTIONS[member.role]} className="font-semibold text-ink">
                      {ROLE_LABELS[member.role]}
                    </span>
                    {manage && !isSelf && member.role !== 'OWNER' && (
                      <button
                        type="button"
                        className="underline underline-offset-2 disabled:opacity-40"
                        style={{ color: 'var(--sale)' }}
                        disabled={busy === member.accountId}
                        onClick={() => void remove(member)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {(manage || invites.length > 0) && (
          <section className="mt-10 max-w-[860px]">
            <SectionTitle>Invites</SectionTitle>
            {invites.length === 0 ? (
              <p className="mt-3 text-[14px]" style={{ color: 'var(--ink-3)' }}>
                No open invites.
              </p>
            ) : (
              <ul className="m-0 mt-4 flex list-none flex-col gap-px p-0" style={{ background: 'var(--border)' }}>
                {invites.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 p-3.5"
                    style={{ background: 'var(--surface)' }}
                  >
                    <div className="min-w-0">
                      <p className="m-0 truncate text-[14px] text-ink">{row.email}</p>
                      <p className="m-0 text-small" style={{ color: 'var(--ink-3)' }}>
                        {ROLE_LABELS[row.role]} · sent {formatDate(row.createdAt)} · expires {formatDate(row.expiresAt)}
                      </p>
                    </div>
                    {manage && (
                      <button
                        type="button"
                        className="text-meta underline underline-offset-2 disabled:opacity-40"
                        disabled={busy === row.id}
                        onClick={() => void withdraw(row)}
                      >
                        Withdraw
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {manage && (
              <form onSubmit={invite} className="mt-6 flex flex-col gap-4 border border-line p-4 md:p-5">
                <p className="m-0 text-[15px] font-semibold text-ink">Invite someone</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_220px]">
                  <Input
                    id="invite-email"
                    label="Email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="colleague@yourbusiness.in"
                    autoComplete="off"
                  />
                  <Select
                    id="invite-role"
                    label="Role"
                    value={role}
                    onChange={(event) => setRole(event.target.value as SellerRole)}
                    helperText={ROLE_DESCRIPTIONS[role]}
                  >
                    {ROLES.filter((r) => r !== 'OWNER' || can('PROFILE')).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Button type="submit" loading={busy === 'invite'}>
                    Send invite
                  </Button>
                </div>
              </form>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
