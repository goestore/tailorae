'use client';

import React, { useState } from 'react';
import type { AdminBrand } from '@/lib/admin-brands';
import { fetchBrandAuthorizationDoc, reviewBrand } from '@/lib/admin-sellers';

/**
 * The approval block inside the brand editor, for brands a seller registered.
 *
 * Shows who asked for the brand, on what basis (trademark owner or authorised
 * reseller), and opens the proof they uploaded — a private file, fetched with
 * the admin's token. Approving gives the brand a storefront page and opens it
 * to every shop; rejecting needs a reason the seller will read.
 */
export const BrandReview: React.FC<{
  brand: AdminBrand;
  onDecided: (message: string) => void;
}> = ({ brand, onDecided }) => {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Platform brands have nothing to review.
  if (!brand.ownerVendor && (!brand.status || brand.status === 'APPROVED')) return null;

  const decide = async (decision: 'approve' | 'reject') => {
    if (decision === 'reject' && !reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      onDecided(await reviewBrand(brand.id, decision, reason.trim() || undefined));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const openDoc = async () => {
    // Opened before the fetch so popup blockers see it as a direct click.
    const tab = window.open('', '_blank');
    try {
      const blob = await fetchBrandAuthorizationDoc(brand.id);
      const url = URL.createObjectURL(blob);
      if (tab) tab.location.href = url;
      else window.location.assign(url);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      tab?.close();
      setError((err as Error).message);
    }
  };

  return (
    <div
      style={{
        marginBottom: 16,
        padding: 12,
        borderRadius: 'var(--admin-radius-sm)',
        border: '1px solid var(--admin-line)',
        background: 'var(--admin-panel-2)',
        fontSize: 13,
        color: 'var(--admin-text)',
      }}
    >
      <p className="admin-kpi-label" style={{ marginBottom: 6 }}>
        Brand review{' '}
        <span className="admin-status-badge" data-status={brand.status ?? 'APPROVED'}>
          {(brand.status ?? 'APPROVED').toLowerCase()}
        </span>
      </p>
      <p style={{ margin: '0 0 8px' }}>
        Registered by <strong>{brand.ownerVendor?.shopName ?? 'the platform'}</strong>
        {' · '}
        {brand.authorizationType === 'AUTHORISED_RESELLER'
          ? 'authorised reseller'
          : brand.authorizationType === 'TRADEMARK_OWNER'
            ? 'trademark owner'
            : 'no proof uploaded (added from a listing)'}
      </p>
      {brand.status === 'REJECTED' && brand.rejectionReason && (
        <p style={{ margin: '0 0 8px', color: 'var(--admin-text-2)' }}>
          Rejected: {brand.rejectionReason}
        </p>
      )}
      {error && (
        <p style={{ margin: '0 0 8px', color: 'var(--a-bad)' }} role="alert">
          {error}
        </p>
      )}

      {rejecting ? (
        <div>
          <label htmlFor={`brand-reject-${brand.id}`} style={{ display: 'block', marginBottom: 6 }}>
            Reason * (the seller will see this)
          </label>
          <textarea
            id={`brand-reject-${brand.id}`}
            autoFocus
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. The reseller letter is not signed by the brand owner."
            style={{ width: '100%', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-sm btn-danger"
              disabled={busy || !reason.trim()}
              onClick={() => void decide('reject')}
            >
              {busy ? 'Rejecting…' : 'Reject brand'}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setRejecting(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {brand.authorizationDoc && (
            <button type="button" className="btn btn-sm" onClick={() => void openDoc()}>
              View proof
            </button>
          )}
          {brand.status !== 'APPROVED' && (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={busy}
              onClick={() => void decide('approve')}
            >
              {busy ? 'Approving…' : 'Approve brand'}
            </button>
          )}
          {brand.status !== 'REJECTED' && (
            <button
              type="button"
              className="btn btn-sm"
              disabled={busy}
              onClick={() => {
                setRejecting(true);
                setReason('');
              }}
            >
              Reject…
            </button>
          )}
        </div>
      )}
    </div>
  );
};
