'use client';

import React, { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  getPlatformSettings,
  updatePlatformSettings,
  type PlatformSettings,
} from '@/lib/admin-settings';

/**
 * Marketplace switches the owner controls.
 *
 * Two for now: whether the public may apply to sell (closing it turns /sell
 * and the apply form into "by invitation", and the API refuses applications —
 * the owner can still add shops from Sellers), and the commission charged
 * when neither the seller nor the category sets one. Each saves on its own so
 * flipping the switch never also resubmits a half-typed rate.
 */

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  color: 'var(--admin-text-2)',
  fontSize: 13,
  letterSpacing: '-0.005em',
};

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [rate, setRate] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState<'open' | 'rate' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(
    () =>
      getPlatformSettings()
        .then((value) => {
          setSettings(value);
          setRate(String(value['commission.defaultRate']));
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
    which: 'open' | 'rate',
    message: string
  ) => {
    setBusy(which);
    setError(null);
    setNotice(null);
    try {
      const next = await updatePlatformSettings(input);
      setSettings(next);
      setRate(String(next['commission.defaultRate']));
      setNotice(message);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const saveRate = (event: FormEvent) => {
    event.preventDefault();
    const value = Number(rate);
    if (rate.trim() === '' || !Number.isFinite(value) || value < 0 || value > 100) {
      setError('Default commission must be a number from 0 to 100.');
      return;
    }
    void save({ 'commission.defaultRate': value }, 'rate', `Default commission set to ${value}%.`);
  };

  const open = settings?.['seller.applicationsOpen'] ?? true;

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1 className="admin-page-title">Marketplace settings</h1>
          <p className="admin-page-sub">
            Who may apply to sell, and what the platform charges by default.
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
                  Accept seller applications
                </p>
                <p className="admin-kpi-sub" style={{ margin: 0 }}>
                  {open
                    ? 'Anyone can apply at /sell. Applications wait in Sellers → Applications for your decision.'
                    : 'Closed: /sell says registration is by invitation. You can still add shops yourself from '}
                  {!open && <Link href="/admin/sellers">Sellers</Link>}
                  {!open && '.'}
                </p>
              </div>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                  color: 'var(--admin-text)',
                  cursor: busy ? 'progress' : 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  role="switch"
                  aria-checked={open}
                  checked={open}
                  disabled={busy !== null}
                  onChange={(event) =>
                    void save(
                      { 'seller.applicationsOpen': event.target.checked },
                      'open',
                      event.target.checked
                        ? 'Seller applications are open.'
                        : 'Seller applications are closed — registration is by invitation.'
                    )
                  }
                />
                {busy === 'open' ? 'Saving…' : open ? 'Open' : 'Closed'}
              </label>
            </div>
          </section>

          <form className="admin-card" onSubmit={saveRate} aria-labelledby="settings-commission">
            <p id="settings-commission" className="admin-kpi-label">
              Commission
            </p>
            <label htmlFor="default-commission" style={labelStyle}>
              Default commission %
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <input
                id="default-commission"
                type="number"
                min={0}
                max={100}
                step={0.5}
                inputMode="decimal"
                value={rate}
                onChange={(event) => setRate(event.target.value)}
                style={{ width: 120 }}
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={busy !== null || rate === String(settings['commission.defaultRate'])}
              >
                {busy === 'rate' ? 'Saving…' : 'Save'}
              </button>
            </div>
            <p className="admin-kpi-sub" style={{ margin: '8px 0 0' }}>
              Charged when neither the seller nor the product&apos;s category has its own rate.
              Applies to orders placed after you save; earlier orders keep the rate they were
              charged.
            </p>
          </form>
        </div>
      )}
    </div>
  );
}
