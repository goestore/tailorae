'use client';

import React, { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  getPlatformSettings,
  updatePlatformSettings,
  type PlatformSettings,
} from '@/lib/admin-settings';
import { useCan } from '@/components/admin/StaffContext';
import { formatPaise, paiseToRupees, rupeesToPaise } from '@/lib/money';

/**
 * Marketplace switches.
 *
 * Whether the public may apply to sell (KYC_REVIEW), and the money rules
 * (FINANCE): the default commission, how long a delivered sale is held before
 * it is credited to the seller, and shipping. The two save separately so
 * flipping the switch never also resubmits half-typed figures. The form speaks
 * percent and rupees; the API stores basis points and paise.
 */

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  color: 'var(--admin-text-2)',
  fontSize: 13,
  letterSpacing: '-0.005em',
};

const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 12,
};

interface MoneyForm {
  rate: string;
  holdDays: string;
  flat: string;
  freeAbove: string;
}

const toForm = (settings: PlatformSettings): MoneyForm => ({
  rate: String((settings['commission.default_rate_bp'] ?? 0) / 100),
  holdDays: String(settings['settlement.hold_days'] ?? 0),
  flat: String(paiseToRupees(settings['shipping.flat_paise'] ?? 0)),
  freeAbove: String(paiseToRupees(settings['shipping.free_above_paise'] ?? 0)),
});

export default function AdminSettingsPage() {
  const can = useCan();
  const canKyc = can('KYC_REVIEW');
  const canFinance = can('FINANCE');

  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [form, setForm] = useState<MoneyForm>({ rate: '', holdDays: '', flat: '', freeAbove: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState<'open' | 'money' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(
    () =>
      getPlatformSettings()
        .then((value) => {
          setSettings(value);
          setForm(toForm(value));
          setError(null);
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setIsLoading(false)),
    []
  );

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (
    input: Partial<PlatformSettings>,
    which: 'open' | 'money',
    message: string
  ) => {
    setBusy(which);
    setError(null);
    setNotice(null);
    try {
      const next = await updatePlatformSettings(input);
      setSettings(next);
      setForm(toForm(next));
      setNotice(message);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const saveMoney = (event: FormEvent) => {
    event.preventDefault();
    const rate = Number(form.rate);
    const holdDays = Number(form.holdDays);
    const flat = Number(form.flat);
    const freeAbove = Number(form.freeAbove);
    if (form.rate.trim() === '' || !Number.isFinite(rate) || rate < 0 || rate > 100) {
      setError('Default commission must be a number from 0 to 100.');
      return;
    }
    if (!Number.isInteger(holdDays) || holdDays < 0 || holdDays > 60) {
      setError('The settlement hold must be a whole number of days from 0 to 60.');
      return;
    }
    if (!Number.isFinite(flat) || flat < 0 || !Number.isFinite(freeAbove) || freeAbove < 0) {
      setError('Shipping amounts must be zero or more.');
      return;
    }
    void save(
      {
        'commission.default_rate_bp': Math.round(rate * 100),
        'settlement.hold_days': holdDays,
        'shipping.flat_paise': rupeesToPaise(flat),
        'shipping.free_above_paise': rupeesToPaise(freeAbove),
      },
      'money',
      'Commission, settlement and shipping saved.'
    );
  };

  const open = settings?.['seller.applications_open'] ?? true;
  const moneyDirty = settings ? JSON.stringify(form) !== JSON.stringify(toForm(settings)) : false;
  const set = (key: keyof MoneyForm) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1 className="admin-page-title">Marketplace settings</h1>
          <p className="admin-page-sub">
            Who may apply to sell, what the platform charges by default, when sellers are paid and
            what shipping costs.
          </p>
        </div>
      </div>

      {error && (
        <div className="admin-alert admin-alert--warn" role="alert" style={{ marginBottom: 16 }}>
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="admin-alert" role="status" style={{ marginBottom: 16 }}>
          <span>{notice}</span>
        </div>
      )}

      {isLoading || !settings ? (
        <div className="admin-card">
          <p className="admin-kpi-sub" style={{ margin: 0 }}>
            {isLoading ? 'Loading settings…' : 'Settings are unavailable.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16, maxWidth: 720 }}>
          <section className="admin-card" aria-labelledby="settings-applications">
            <p id="settings-applications" className="admin-kpi-label">
              Seller applications
            </p>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                <p style={{ margin: '0 0 4px', color: 'var(--admin-text)', fontSize: 14 }}>
                  Accept seller sign-ups
                </p>
                <p className="admin-kpi-sub" style={{ margin: 0 }}>
                  {open
                    ? 'Anyone can register a seller account and submit their business for review in '
                    : 'Closed: the seller sign-up says registration is by invitation. Submitted applications are still reviewed in '}
                  <Link href="/admin/sellers">Sellers</Link>.
                </p>
              </div>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                  color: 'var(--admin-text)',
                  cursor: busy ? 'progress' : canKyc ? 'pointer' : 'not-allowed',
                }}
                title={canKyc ? undefined : 'Needs the KYC review permission'}
              >
                <input
                  type="checkbox"
                  role="switch"
                  aria-checked={open}
                  checked={open}
                  disabled={busy !== null || !canKyc}
                  onChange={(event) =>
                    void save(
                      { 'seller.applications_open': event.target.checked },
                      'open',
                      event.target.checked
                        ? 'Seller sign-ups are open.'
                        : 'Seller sign-ups are closed — registration is by invitation.'
                    )
                  }
                />
                {busy === 'open' ? 'Saving…' : open ? 'Open' : 'Closed'}
              </label>
            </div>
          </section>

          <form className="admin-card" onSubmit={saveMoney} aria-labelledby="settings-money">
            <p id="settings-money" className="admin-kpi-label">
              Commission, settlement and shipping
            </p>
            <fieldset
              disabled={!canFinance || busy !== null}
              style={{ border: 0, padding: 0, margin: 0 }}
            >
              <div style={grid}>
                <label>
                  <span style={labelStyle}>Default commission %</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    inputMode="decimal"
                    value={form.rate}
                    onChange={set('rate')}
                    style={{ width: '100%' }}
                  />
                </label>
                <label>
                  <span style={labelStyle}>Settlement hold (days)</span>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    step={1}
                    value={form.holdDays}
                    onChange={set('holdDays')}
                    style={{ width: '100%' }}
                  />
                </label>
                <label>
                  <span style={labelStyle}>Flat shipping (₹)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.flat}
                    onChange={set('flat')}
                    style={{ width: '100%' }}
                  />
                </label>
                <label>
                  <span style={labelStyle}>Free shipping from (₹)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.freeAbove}
                    onChange={set('freeAbove')}
                    style={{ width: '100%' }}
                  />
                </label>
              </div>
            </fieldset>
            <p className="admin-kpi-sub" style={{ margin: '10px 0 0' }}>
              The commission applies when neither the seller nor the product&apos;s category has its
              own rate, to orders placed after you save. A delivered sale is credited to the seller
              {` ${settings['settlement.hold_days']} `}day(s) after delivery when no return is open.
              Orders from {formatPaise(settings['shipping.free_above_paise'])} ship free; below that
              shipping is {formatPaise(settings['shipping.flat_paise'])}.
            </p>
            {canFinance ? (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={busy !== null || !moneyDirty}
                >
                  {busy === 'money' ? 'Saving…' : 'Save'}
                </button>
              </div>
            ) : (
              <p className="admin-kpi-sub" style={{ margin: '8px 0 0' }}>
                Changing these needs the Finance permission.
              </p>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
