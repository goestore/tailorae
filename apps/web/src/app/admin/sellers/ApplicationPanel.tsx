'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ACTIONS_NEEDING_NOTE,
  BUSINESS_TYPE_LABELS,
  KYC_KIND_LABEL,
  SELLER_STATUS_LABEL,
  decideSeller,
  getSellerReview,
  getShopBrandAuthorizations,
  type BrandAuthorization,
  type PostalAddress,
  type SellerAction,
  type SellerReview,
  type SellerStatus,
} from '@/lib/admin-sellers';
import { getBrandAuthorizationDocUrl } from '@/lib/admin-brands';
import { useCan } from '@/components/admin/StaffContext';
import { formatDateTime } from '@/utils/helpers';

/**
 * One seller application on one screen (KYC_REVIEW): the business, the owner,
 * the KYC documents (five-minute signed links), the masked bank account, the
 * brands it asked to sell under, the status history and the decision.
 *
 * The buttons are the decisions the state machine allows from the current
 * status (`allowedActions`). Rejecting, asking for more information and
 * suspending need a note — the seller reads it on their dashboard.
 */

// Mapped onto the shared badge palette (keyed by order/payment states).
const STATUS_TONE: Record<SellerStatus, string | undefined> = {
  DRAFT: undefined,
  SUBMITTED: 'NEW',
  UNDER_REVIEW: 'PENDING',
  NEEDS_INFO: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SUSPENDED: 'SUSPENDED',
};

export const SellerStatusBadge: React.FC<{ status: SellerStatus }> = ({ status }) => (
  <span className="admin-status-badge" data-status={STATUS_TONE[status]}>
    {SELLER_STATUS_LABEL[status] ?? status}
  </span>
);

const ACTION_LABEL: Record<SellerAction, string> = {
  SUBMIT: 'Submit',
  START_REVIEW: 'Start review',
  APPROVE: 'Approve seller',
  REJECT: 'Reject…',
  REQUEST_INFO: 'Ask for more information…',
  SUSPEND: 'Suspend…',
  REINSTATE: 'Reinstate',
};

const NOTE_PROMPT: Partial<
  Record<SellerAction, { label: string; placeholder: string; confirm: string }>
> = {
  REJECT: {
    label: 'Why is it rejected?',
    placeholder: 'e.g. We could not confirm the registered address.',
    confirm: 'Reject application',
  },
  REQUEST_INFO: {
    label: 'What does the seller need to fix?',
    placeholder: 'e.g. The PAN card scan is blurred — please upload a clearer copy.',
    confirm: 'Send back to the seller',
  },
  SUSPEND: {
    label: 'Why is the shop suspended?',
    placeholder: 'e.g. Repeated late dispatches. Contact us to discuss reinstatement.',
    confirm: 'Suspend shop',
  },
};

/** Links are signed for five minutes; reload the review a little before that. */
const LINK_LIFETIME_MS = 4 * 60 * 1000;
const linksExpired = (loadedAt: number) => Date.now() - loadedAt > LINK_LIFETIME_MS;

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 4,
  color: 'var(--admin-text-2)',
  fontSize: 13,
  letterSpacing: '-0.005em',
};

const mono: React.CSSProperties = { fontFamily: 'ui-monospace, monospace' };

const twoCol: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 16,
  marginBottom: 20,
};

const Detail: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ minWidth: 0 }}>
    <p style={labelStyle}>{label}</p>
    <div style={{ margin: 0, color: 'var(--admin-text)', fontSize: 13, overflowWrap: 'anywhere' }}>
      {children}
    </div>
  </div>
);

const addressText = (address: PostalAddress | null | undefined) =>
  address
    ? [address.line1, address.line2, address.city, `${address.state} ${address.postalCode}`]
        .filter(Boolean)
        .join(', ')
    : '—';

const when = (value: string | null | undefined) => (value ? formatDateTime(value) : '—');

const sizeLabel = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export const ApplicationPanel: React.FC<{
  sellerId: string;
  onClose: () => void;
  onDecided: (message: string) => void;
}> = ({ sellerId, onClose, onDecided }) => {
  const can = useCan();
  const canSeeBrands = can('MODERATOR');
  const [review, setReview] = useState<SellerReview | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const [brands, setBrands] = useState<BrandAuthorization[] | null>(null);
  const [pending, setPending] = useState<SellerAction | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const load = useCallback(
    () =>
      getSellerReview(sellerId).then((data) => {
        setReview(data);
        setLoadedAt(Date.now());
        return data;
      }),
    [sellerId]
  );

  useEffect(() => {
    let cancelled = false;
    load().catch((err: Error) => !cancelled && setError(err.message));
    if (canSeeBrands) {
      getShopBrandAuthorizations(sellerId)
        .then((rows) => !cancelled && setBrands(rows))
        .catch(() => !cancelled && setBrands([]));
    }
    return () => {
      cancelled = true;
    };
  }, [load, sellerId, canSeeBrands]);

  useEffect(() => {
    if (!review) return;
    headingRef.current?.focus();
    headingRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    // Only on first load of this seller, not on every refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review?.shop.id]);

  /** Opens a KYC document, refreshing the signed links first if they may have expired. */
  const openDocument = async (documentId: string) => {
    const tab = window.open('', '_blank');
    try {
      const fresh = linksExpired(loadedAt) ? await load() : review;
      const url = fresh?.documents.find((row) => row.document.id === documentId)?.url;
      if (!url) throw new Error('That document is no longer available.');
      if (tab) tab.location.href = url;
      else window.open(url, '_blank', 'noopener');
    } catch (err) {
      tab?.close();
      setError((err as Error).message);
    }
  };

  const openBrandDoc = async (row: BrandAuthorization) => {
    const tab = window.open('', '_blank');
    try {
      const url = await getBrandAuthorizationDocUrl(row.brand.id, row.seller.id);
      if (tab) tab.location.href = url;
      else window.open(url, '_blank', 'noopener');
    } catch (err) {
      tab?.close();
      setError((err as Error).message);
    }
  };

  const decide = async (action: SellerAction) => {
    if (ACTIONS_NEEDING_NOTE.includes(action) && !note.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await decideSeller(sellerId, action, note.trim() || undefined);
      setPending(null);
      setNote('');
      await load();
      onDecided(result.message);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const headingId = `application-heading-${sellerId}`;
  const noteId = `application-note-${sellerId}`;

  if (!review) {
    return (
      <section className="admin-card" style={{ marginBottom: 16 }}>
        <p className="admin-kpi-sub" style={{ margin: 0 }}>
          {error ?? 'Loading the application…'}
        </p>
        {error && (
          <button type="button" className="btn" style={{ marginTop: 12 }} onClick={onClose}>
            Close
          </button>
        )}
      </section>
    );
  }

  const { shop, owner, documents, bank, history, allowedActions } = review;
  const prompt = pending ? NOTE_PROMPT[pending] : undefined;
  const decisions = allowedActions.filter((action) => action !== 'SUBMIT');

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
            {shop.shopName}
          </h2>
          <SellerStatusBadge status={shop.status} />
        </div>
        <button type="button" className="btn" onClick={onClose}>
          Close application
        </button>
      </div>

      {error && (
        <div className="admin-alert admin-alert--warn" role="alert" style={{ marginBottom: 16 }}>
          <span>{error}</span>
        </div>
      )}

      {shop.statusNote && (
        <div className="admin-alert" style={{ marginBottom: 16 }}>
          <span>
            <strong>Note sent to the seller:</strong> {shop.statusNote}
          </span>
        </div>
      )}

      <p className="admin-kpi-label" style={{ marginBottom: 8 }}>
        Business
      </p>
      <div style={twoCol}>
        <Detail label="Legal name">{shop.legalName ?? '—'}</Detail>
        <Detail label="Type">
          {shop.businessType ? (BUSINESS_TYPE_LABELS[shop.businessType] ?? shop.businessType) : '—'}
        </Detail>
        <Detail label="PAN">
          <span style={mono}>{shop.pan ?? '—'}</span>
        </Detail>
        <Detail label="GSTIN">
          <span style={mono}>{shop.gstin ?? '—'}</span>
        </Detail>
        <Detail label="Registered address">{addressText(shop.registeredAddress)}</Detail>
        <Detail label="Pickup address">{addressText(shop.pickupAddress)}</Detail>
        <Detail label="Contact">
          {shop.contactPhone ?? '—'}
          <br />
          {shop.contactEmail ?? '—'}
        </Detail>
        <Detail label="Owner">
          {owner ? (
            <>
              {owner.fullName}
              <br />
              {owner.email}
            </>
          ) : (
            '—'
          )}
        </Detail>
        <Detail label="Created">{when(shop.createdAt)}</Detail>
        <Detail label="Submitted">{when(shop.submittedAt)}</Detail>
        <Detail label="Last decision">{when(shop.decidedAt)}</Detail>
        <Detail label="Storefront">/sellers/{shop.shopSlug}</Detail>
      </div>

      <p className="admin-kpi-label" style={{ marginBottom: 8 }}>
        KYC documents
      </p>
      {documents.length === 0 ? (
        <p className="admin-kpi-sub" style={{ marginBottom: 20 }}>
          No documents uploaded.
        </p>
      ) : (
        <ul
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            listStyle: 'none',
            padding: 0,
            margin: '0 0 20px',
          }}
        >
          {documents.map(({ document }) => (
            <li key={document.id}>
              <button
                type="button"
                className="btn"
                title={`${document.filename} · ${sizeLabel(document.bytes)}`}
                onClick={() => void openDocument(document.id)}
              >
                {KYC_KIND_LABEL[document.kind] ?? document.kind}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="admin-kpi-label" style={{ marginBottom: 8 }}>
        Bank account
      </p>
      {bank ? (
        <div style={twoCol}>
          <Detail label="Account">
            <span style={{ ...mono, letterSpacing: '0.04em' }}>{bank.accountNumberMasked}</span>
          </Detail>
          <Detail label="Account name">{bank.accountName}</Detail>
          <Detail label="IFSC">
            <span style={mono}>{bank.ifsc}</span>
          </Detail>
          <Detail label="Bank">
            {bank.bankName ?? '—'}
            {bank.verified ? ' · verified' : ' · not verified'}
          </Detail>
        </div>
      ) : (
        <p className="admin-kpi-sub" style={{ marginBottom: 20 }}>
          No bank details given yet.
        </p>
      )}

      {canSeeBrands && (
        <>
          <p className="admin-kpi-label" style={{ marginBottom: 8 }}>
            Brands
          </p>
          {brands === null ? (
            <p className="admin-kpi-sub" style={{ marginBottom: 20 }}>
              Loading…
            </p>
          ) : brands.length === 0 ? (
            <p className="admin-kpi-sub" style={{ marginBottom: 20 }}>
              No brand requests.
            </p>
          ) : (
            <ul
              style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', display: 'grid', gap: 8 }}
            >
              {brands.map((row) => (
                <li
                  key={row.brand.id}
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 10,
                    fontSize: 13,
                  }}
                >
                  <strong style={{ color: 'var(--admin-text)' }}>{row.brand.name}</strong>
                  <span className="admin-status-badge" data-status={row.status}>
                    {row.status.toLowerCase()}
                  </span>
                  <span className="admin-kpi-sub" style={{ margin: 0 }}>
                    {row.authorizationType === 'AUTHORISED_RESELLER'
                      ? 'Authorised reseller'
                      : row.authorizationType === 'TRADEMARK_OWNER'
                        ? 'Trademark owner'
                        : 'No proof uploaded'}
                  </span>
                  {row.hasDocument && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => void openBrandDoc(row)}
                    >
                      View proof
                    </button>
                  )}
                </li>
              ))}
              <li className="admin-kpi-sub" style={{ margin: 0 }}>
                Decide brand requests in Catalogue → Brands → Brand authorisations.
              </li>
            </ul>
          )}
        </>
      )}

      <p className="admin-kpi-label" style={{ marginBottom: 8 }}>
        History
      </p>
      {history.length === 0 ? (
        <p className="admin-kpi-sub" style={{ marginBottom: 20 }}>
          No status changes yet.
        </p>
      ) : (
        <div className="admin-table-wrap" style={{ marginBottom: 20 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Change</th>
                <th>By</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {history.map((event, index) => (
                <tr key={`${event.createdAt}-${index}`}>
                  <td style={{ whiteSpace: 'nowrap' }}>{when(event.createdAt)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {event.fromStatus
                      ? `${SELLER_STATUS_LABEL[event.fromStatus] ?? event.fromStatus} → `
                      : ''}
                    {SELLER_STATUS_LABEL[event.toStatus] ?? event.toStatus}
                  </td>
                  <td>
                    {event.actorRealm === 'admin'
                      ? 'Staff'
                      : event.actorRealm === 'seller'
                        ? 'Seller'
                        : event.actorRealm}
                  </td>
                  <td>{event.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--admin-line)', paddingTop: 16 }}>
        {pending && prompt ? (
          <div>
            <label htmlFor={noteId} style={labelStyle}>
              {prompt.label} * (the seller will see this)
            </label>
            <textarea
              id={noteId}
              autoFocus
              required
              rows={3}
              maxLength={1000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={prompt.placeholder}
              style={{ width: '100%', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              <button
                type="button"
                className={pending === 'REQUEST_INFO' ? 'btn btn-primary' : 'btn btn-danger'}
                onClick={() => void decide(pending)}
                disabled={busy || !note.trim()}
              >
                {busy ? 'Saving…' : prompt.confirm}
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
        ) : decisions.length === 0 ? (
          <p className="admin-kpi-sub" style={{ margin: 0 }}>
            {shop.status === 'DRAFT'
              ? 'The seller has not submitted this application yet.'
              : shop.status === 'NEEDS_INFO'
                ? 'Waiting for the seller to update and resubmit.'
                : 'No decision is open at this stage.'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            {decisions.map((action) => {
              const needsNote = ACTIONS_NEEDING_NOTE.includes(action);
              const primary = action === 'APPROVE' || action === 'REINSTATE';
              return (
                <button
                  key={action}
                  type="button"
                  className={primary ? 'btn btn-primary' : 'btn'}
                  disabled={busy}
                  onClick={() => {
                    if (needsNote) {
                      setPending(action);
                      setNote('');
                    } else {
                      void decide(action);
                    }
                  }}
                >
                  {busy && !needsNote ? 'Saving…' : ACTION_LABEL[action]}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
