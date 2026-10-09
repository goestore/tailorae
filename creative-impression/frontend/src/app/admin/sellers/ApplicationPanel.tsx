'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  BUSINESS_TYPE_LABELS,
  KycRequiredError,
  decideApplication,
  fetchBrandAuthorizationDoc,
  type AdminSeller,
  type ApplicationStatus,
} from '@/lib/admin-sellers';
import { formatDateTime } from '@/utils/helpers';

/**
 * One seller application on one screen: the business behind the shop, its
 * identity check, the brands it asked to sell under, and the decision.
 *
 * Approving opens the catalogue to the shop and verifies it, so the server
 * refuses it until identity is approved; the refusal comes back here with an
 * explicit "approve anyway" rather than failing quietly. Rejecting and
 * suspending need a note — the seller reads it on their dashboard.
 */

export const APPLICATION_LABEL: Record<ApplicationStatus, string> = {
  APPLIED: 'Applied',
  UNDER_REVIEW: 'Under review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SUSPENDED: 'Suspended',
};

// Mapped onto the shared badge palette (keyed by order/payment states).
const APPLICATION_TONE: Record<ApplicationStatus, string | undefined> = {
  APPLIED: 'NEW',
  UNDER_REVIEW: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SUSPENDED: 'SUSPENDED',
};

export const ApplicationBadge: React.FC<{ status: ApplicationStatus }> = ({ status }) => (
  <span className="admin-status-badge" data-status={APPLICATION_TONE[status]}>
    {APPLICATION_LABEL[status] ?? status}
  </span>
);

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 4,
  color: 'var(--admin-text-2)',
  fontSize: 13,
  letterSpacing: '-0.005em',
};

const Detail: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ minWidth: 0 }}>
    <p style={labelStyle}>{label}</p>
    <p style={{ margin: 0, color: 'var(--admin-text)', fontSize: 13, overflowWrap: 'anywhere' }}>
      {children}
    </p>
  </div>
);

type Decision = Exclude<ApplicationStatus, 'APPLIED'>;

const NEEDS_NOTE: Decision[] = ['REJECTED', 'SUSPENDED'];

export const ApplicationPanel: React.FC<{
  seller: AdminSeller;
  onClose: () => void;
  onDecided: (message: string) => void;
  /** Opens the identity review for this shop. */
  onReviewIdentity: () => void;
}> = ({ seller, onClose, onDecided, onReviewIdentity }) => {
  const [pending, setPending] = useState<Decision | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kycBlocked, setKycBlocked] = useState<string | null>(null);
  const [docLoading, setDocLoading] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
    headingRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [seller.id]);

  const decide = async (status: Decision, overrideKyc = false) => {
    if (NEEDS_NOTE.includes(status) && !note.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const message = await decideApplication(seller.id, {
        status,
        note: note.trim() || undefined,
        overrideKyc,
      });
      setPending(null);
      setNote('');
      setKycBlocked(null);
      onDecided(message);
    } catch (err) {
      if (err instanceof KycRequiredError) setKycBlocked(err.message);
      else setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const openBrandDoc = async (brandId: string) => {
    // Opened before the fetch so popup blockers see it as a direct click.
    const tab = window.open('', '_blank');
    setDocLoading(brandId);
    try {
      const blob = await fetchBrandAuthorizationDoc(brandId);
      const url = URL.createObjectURL(blob);
      if (tab) tab.location.href = url;
      else window.location.assign(url);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      tab?.close();
      setError((err as Error).message);
    } finally {
      setDocLoading(null);
    }
  };

  const address = seller.registeredAddress;
  const headingId = `application-heading-${seller.id}`;
  const noteId = `application-note-${seller.id}`;
  const status = seller.applicationStatus;

  return (
    <section className="admin-card" aria-labelledby={headingId} style={{ marginBottom: 16 }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p className="admin-kpi-label" style={{ marginBottom: 4 }}>
            Seller application
          </p>
          <h2
            id={headingId}
            ref={headingRef}
            tabIndex={-1}
            style={{
              margin: '0 0 8px',
              fontSize: 18,
              color: 'var(--admin-text)',
              overflowWrap: 'anywhere',
              scrollMarginTop: 96,
            }}
          >
            {seller.shopName}
          </h2>
          <ApplicationBadge status={status} />
        </div>
        <button type="button" className="btn" onClick={onClose}>
          Close application
        </button>
      </div>

      {error && (
        <div className="admin-alert admin-alert--warn" role="alert">
          <span>{error}</span>
        </div>
      )}

      {seller.applicationNote && (status === 'REJECTED' || status === 'SUSPENDED') && (
        <div className="admin-alert" style={{ marginBottom: 16 }}>
          <span>
            <strong>Note sent to the seller:</strong> {seller.applicationNote}
          </span>
        </div>
      )}

      <p className="admin-kpi-label" style={{ marginBottom: 8 }}>
        Business
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 16,
          marginBottom: 20,
        }}
      >
        <Detail label="Legal name">{seller.legalName ?? '—'}</Detail>
        <Detail label="Type">
          {seller.businessType ? BUSINESS_TYPE_LABELS[seller.businessType] : '—'}
        </Detail>
        <Detail label="Registered address">
          {address
            ? [address.line1, address.line2, address.city, `${address.state} ${address.pincode}`]
                .filter(Boolean)
                .join(', ')
            : '—'}
        </Detail>
        <Detail label="Contact">
          {seller.contactPhone ?? '—'}
          <br />
          {seller.contactEmail ?? seller.user?.email ?? '—'}
        </Detail>
        <Detail label="Applied">{formatDateTime(seller.createdAt)}</Detail>
        <Detail label="Last decision">
          {seller.applicationReviewedAt ? formatDateTime(seller.applicationReviewedAt) : '—'}
        </Detail>
      </div>

      <p className="admin-kpi-label" style={{ marginBottom: 8 }}>
        Identity &amp; bank
      </p>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 12,
          marginBottom: 20,
          fontSize: 13,
          color: 'var(--admin-text)',
        }}
      >
        <span>
          KYC: <strong>{seller.kycStatus.replace(/_/g, ' ').toLowerCase()}</strong>
          {seller.kycDocuments.length > 0 && ` · ${seller.kycDocuments.length} document(s)`}
        </span>
        <span>
          Bank:{' '}
          {seller.hasBankDetails ? `on file ····${seller.bankAccountLast4 ?? ''}` : 'not given'}
        </span>
        <button type="button" className="btn btn-sm" onClick={onReviewIdentity}>
          Open identity review
        </button>
      </div>

      <p className="admin-kpi-label" style={{ marginBottom: 8 }}>
        Brands
      </p>
      {seller.brands.length === 0 ? (
        <p className="admin-kpi-sub" style={{ marginBottom: 20 }}>
          No brands registered.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', display: 'grid', gap: 8 }}>
          {seller.brands.map((brand) => (
            <li
              key={brand.id}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 10,
                fontSize: 13,
              }}
            >
              <strong style={{ color: 'var(--admin-text)' }}>{brand.name}</strong>
              <span className="admin-status-badge" data-status={brand.status}>
                {brand.status.toLowerCase()}
              </span>
              <span className="admin-kpi-sub" style={{ margin: 0 }}>
                {brand.authorizationType === 'AUTHORISED_RESELLER'
                  ? 'Authorised reseller'
                  : brand.authorizationType === 'TRADEMARK_OWNER'
                    ? 'Trademark owner'
                    : 'No proof uploaded'}
              </span>
              {brand.authorizationDoc && (
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={docLoading !== null}
                  onClick={() => void openBrandDoc(brand.id)}
                >
                  {docLoading === brand.id ? 'Opening…' : 'View proof'}
                </button>
              )}
            </li>
          ))}
          <li className="admin-kpi-sub" style={{ margin: 0 }}>
            Approve or reject brands from Catalog → Brands.
          </li>
        </ul>
      )}

      {kycBlocked && (
        <div
          className="admin-alert admin-alert--warn"
          role="alert"
          style={{ marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}
        >
          <span style={{ flex: '1 1 240px' }}>{kycBlocked}</span>
          <span className="admin-actions">
            <button type="button" className="btn btn-sm" onClick={onReviewIdentity}>
              Review identity
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={busy}
              onClick={() => void decide('APPROVED', true)}
            >
              Approve without identity check
            </button>
          </span>
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--admin-line)', paddingTop: 16 }}>
        {pending && NEEDS_NOTE.includes(pending) ? (
          <div>
            <label htmlFor={noteId} style={labelStyle}>
              {pending === 'REJECTED' ? 'Why is it rejected?' : 'Why is the shop suspended?'} * (the
              seller will see this)
            </label>
            <textarea
              id={noteId}
              autoFocus
              required
              rows={3}
              maxLength={1000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={
                pending === 'REJECTED'
                  ? 'e.g. We could not confirm the registered address. Please update it and contact us.'
                  : 'e.g. Repeated late dispatches. Contact us to discuss reinstatement.'
              }
              style={{ width: '100%', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => void decide(pending)}
                disabled={busy || !note.trim()}
              >
                {busy ? 'Saving…' : pending === 'REJECTED' ? 'Reject application' : 'Suspend shop'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setPending(null)}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            {status !== 'APPROVED' && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void decide('APPROVED')}
              >
                {busy ? 'Saving…' : status === 'SUSPENDED' ? 'Reinstate' : 'Approve seller'}
              </button>
            )}
            {status === 'APPLIED' && (
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void decide('UNDER_REVIEW')}
              >
                Mark under review
              </button>
            )}
            {(status === 'APPLIED' || status === 'UNDER_REVIEW') && (
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => {
                  setPending('REJECTED');
                  setNote('');
                }}
              >
                Reject…
              </button>
            )}
            {status === 'APPROVED' && (
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => {
                  setPending('SUSPENDED');
                  setNote('');
                }}
              >
                Suspend…
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
