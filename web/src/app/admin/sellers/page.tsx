'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  createSeller,
  decideKyc,
  fetchKycDocument,
  getSellers,
  KycRequiredError,
  revealBank,
  updateSeller,
  type AdminSeller,
  type KycStatus,
  type RevealedBank,
} from '@/lib/admin-sellers';
import { announceQueuesChanged } from '@/lib/admin-moderation';
import { formatCurrency, formatDateTime } from '@/utils/helpers';
import { Store } from '@/components/admin/icons';
import { BUSINESS_TYPE_LABELS, type BusinessType } from '@/lib/admin-sellers';
import { ApplicationBadge, ApplicationPanel } from './ApplicationPanel';

/** The business behind a shop the owner registers on someone's behalf. All optional. */
const EMPTY_COMPANY = {
  legalName: '',
  businessType: '' as BusinessType | '',
  line1: '',
  city: '',
  state: '',
  pincode: '',
  contactPhone: '',
  contactEmail: '',
};

/** Only the company fields that were filled in; the server validates them. */
const companyInput = (company: typeof EMPTY_COMPANY) => {
  const hasAddress = [company.line1, company.city, company.state, company.pincode].some((v) => v.trim());
  return {
    legalName: company.legalName.trim() || undefined,
    businessType: company.businessType || undefined,
    registeredAddress: hasAddress
      ? {
          line1: company.line1.trim(),
          city: company.city.trim(),
          state: company.state.trim(),
          pincode: company.pincode.trim(),
          country: 'India',
        }
      : undefined,
    contactPhone: company.contactPhone.trim() || undefined,
    contactEmail: company.contactEmail.trim() || undefined,
  };
};

/**
 * A table inside a zero-padding index card. The global rule that pulls a
 * table out to a padded card's edges (-16px margins) must not apply here.
 */
const flush: React.CSSProperties = { width: '100%', margin: 0 };

/**
 * Seller accounts.
 *
 * Approval is the gate that matters: an unverified shop can prepare listings,
 * but nothing of theirs reaches the storefront. Suspending does the same in
 * reverse — the listings come straight back down. Both are one click, and both
 * clear the storefront cache, because a decision that takes minutes to show up
 * gets made twice.
 */

const fieldStyle: React.CSSProperties = {
  width: '100%',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  color: 'var(--admin-text-2)',
  fontSize: 13,
  letterSpacing: '-0.005em',
};

/** The form that creates a shop, and the credentials it hands back once. */
const NewSellerForm: React.FC<{ onCreated: () => void; onClose: () => void }> = ({
  onCreated,
  onClose,
}) => {
  const [form, setForm] = useState({
    email: '',
    shopName: '',
    firstName: '',
    lastName: '',
    // Blank = no override: the shop pays each item's category rate.
    commissionRate: '',
    isVerified: true,
  });
  const [company, setCompany] = useState(EMPTY_COMPANY);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handover, setHandover] = useState<{
    email: string;
    password: string | null;
    message: string;
  } | null>(null);

  const set = (key: keyof typeof form, value: string | boolean) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const result = await createSeller({
        email: form.email.trim(),
        shopName: form.shopName.trim(),
        firstName: form.firstName.trim() || undefined,
        lastName: form.lastName.trim() || undefined,
        commissionRate: form.commissionRate.trim() === '' ? null : Number(form.commissionRate),
        isVerified: form.isVerified,
        ...companyInput(company),
      });
      setCompany(EMPTY_COMPANY);
      setHandover({
        email: form.email.trim(),
        password: result.temporaryPassword,
        message: result.message,
      });
      setForm({
        email: '',
        shopName: '',
        firstName: '',
        lastName: '',
        commissionRate: '',
        isVerified: true,
      });
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  if (handover) {
    return (
      <div className="admin-card" style={{ marginBottom: 16 }}>
        <p className="admin-kpi-label">Seller created</p>
        <p className="admin-kpi-sub" style={{ marginBottom: 12 }}>
          {handover.message}
        </p>

        {handover.password && (
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              border: '1px solid var(--admin-line)',
              background: 'var(--admin-panel-2)',
            }}
          >
            <p className="admin-kpi-sub" style={{ margin: 0 }}>
              Sign-in email
            </p>
            <p
              style={{
                margin: '2px 0 10px',
                color: 'var(--admin-text)',
                fontFamily: 'ui-monospace, monospace',
              }}
            >
              {handover.email}
            </p>
            <p className="admin-kpi-sub" style={{ margin: 0 }}>
              Temporary password — shown once, not recoverable
            </p>
            <p
              style={{
                margin: '2px 0 0',
                color: 'var(--admin-text)',
                fontSize: 18,
                letterSpacing: '0.08em',
                fontFamily: 'ui-monospace, monospace',
              }}
            >
              {handover.password}
            </p>
          </div>
        )}

        <div className="admin-actions" style={{ marginTop: 16 }}>
          {handover.password && (
            <button
              type="button"
              className="btn"
              onClick={() =>
                void navigator.clipboard?.writeText(
                  `Email: ${handover.email}\nPassword: ${handover.password}`
                )
              }
            >
              Copy credentials
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setHandover(null);
              onClose();
            }}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="admin-card" style={{ marginBottom: 16 }}>
      <p className="admin-kpi-label">Add a seller</p>
      <p className="admin-kpi-sub" style={{ marginBottom: 16 }}>
        Creates the shop, and a login too if this email is new here.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 14,
        }}
      >
        <div>
          <label style={labelStyle} htmlFor="seller-email">
            Email *
          </label>
          <input
            id="seller-email"
            type="email"
            required
            value={form.email}
            onChange={(event) => set('email', event.target.value)}
            placeholder="them@theirshop.com"
            style={fieldStyle}
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="seller-shop">
            Shop name *
          </label>
          <input
            id="seller-shop"
            required
            value={form.shopName}
            onChange={(event) => set('shopName', event.target.value)}
            placeholder="The name shoppers will see"
            style={fieldStyle}
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="seller-first">
            First name
          </label>
          <input
            id="seller-first"
            value={form.firstName}
            onChange={(event) => set('firstName', event.target.value)}
            style={fieldStyle}
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="seller-last">
            Last name
          </label>
          <input
            id="seller-last"
            value={form.lastName}
            onChange={(event) => set('lastName', event.target.value)}
            style={fieldStyle}
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="seller-commission">
            Commission %
          </label>
          <input
            id="seller-commission"
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={form.commissionRate}
            placeholder="Category default"
            title="Leave blank to charge each item's category rate"
            onChange={(event) => set('commissionRate', event.target.value)}
            style={fieldStyle}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12.5,
              color: 'var(--admin-text-2)',
            }}
          >
            <input
              type="checkbox"
              checked={form.isVerified}
              onChange={(event) => set('isVerified', event.target.checked)}
            />
            Approve immediately
          </label>
        </div>
      </div>

      {/* The business behind the shop. Optional: the owner may set a shop up
          before the paperwork arrives, and fill these in later. */}
      <details style={{ marginTop: 16 }}>
        <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--admin-text-2)' }}>
          Business details (optional)
        </summary>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 14,
            marginTop: 12,
          }}
        >
          {(
            [
              ['legalName', 'Legal name', 'As on PAN / GST registration'],
              ['line1', 'Registered address', 'Building, street'],
              ['city', 'City', ''],
              ['state', 'State', ''],
              ['pincode', 'Pincode', '6 digits'],
              ['contactPhone', 'Contact phone', '10-digit mobile'],
              ['contactEmail', 'Contact email', 'orders@theirshop.com'],
            ] as const
          ).map(([key, label, placeholder]) => (
            <div key={key}>
              <label style={labelStyle} htmlFor={`seller-${key}`}>
                {label}
              </label>
              <input
                id={`seller-${key}`}
                value={company[key]}
                placeholder={placeholder}
                onChange={(event) =>
                  setCompany((previous) => ({ ...previous, [key]: event.target.value }))
                }
                style={fieldStyle}
              />
            </div>
          ))}
          <div>
            <label style={labelStyle} htmlFor="seller-business-type">
              Business type
            </label>
            <select
              id="seller-business-type"
              value={company.businessType}
              onChange={(event) =>
                setCompany((previous) => ({
                  ...previous,
                  businessType: event.target.value as BusinessType | '',
                }))
              }
              style={fieldStyle}
            >
              <option value="">—</option>
              {(Object.keys(BUSINESS_TYPE_LABELS) as BusinessType[]).map((type) => (
                <option key={type} value={type}>
                  {BUSINESS_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </details>

      {error && (
        <p style={{ color: 'var(--a-bad)', fontSize: 12.5, marginTop: 12, marginBottom: 0 }}>
          {error}
        </p>
      )}

      <div className="admin-actions" style={{ marginTop: 16 }}>
        <button type="button" className="btn" onClick={onClose} disabled={isSaving}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={isSaving}>
          {isSaving ? 'Creating…' : 'Create seller'}
        </button>
      </div>
    </form>
  );
};

const KYC_LABEL: Record<KycStatus, string> = {
  NOT_SUBMITTED: 'Not submitted',
  PENDING: 'Awaiting verification',
  APPROVED: 'Identity approved',
  REJECTED: 'Identity rejected',
};

// The badge palette is keyed by order/payment states; map onto the same tones.
const KYC_TONE: Record<KycStatus, string | undefined> = {
  NOT_SUBMITTED: undefined,
  PENDING: 'PENDING',
  APPROVED: 'COMPLETED',
  REJECTED: 'REJECTED',
};

const KycBadge: React.FC<{ status: KycStatus }> = ({ status }) => (
  <span className="admin-status-badge" data-status={KYC_TONE[status]}>
    {KYC_LABEL[status] ?? status}
  </span>
);

const when = (value: string | null) => (value ? formatDateTime(value) : '—');

const Detail: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ minWidth: 0 }}>
    <p style={{ ...labelStyle, marginBottom: 4 }}>{label}</p>
    <p style={{ margin: 0, color: 'var(--admin-text)', fontSize: 13, overflowWrap: 'anywhere' }}>
      {children}
    </p>
  </div>
);

const mono: React.CSSProperties = { fontFamily: 'ui-monospace, monospace' };

/** One line, cut with an ellipsis: table cells never wrap. */
const truncate: React.CSSProperties = {
  display: 'block',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

/** Row actions keep one width so toggling a label never shifts the row. */
const actionWidth: React.CSSProperties = { minWidth: 76 };

/** One opened identity document, held as an object URL until closed. */
interface OpenDocument {
  name: string;
  url: string;
  isImage: boolean;
}

/**
 * The identity check for one shop: what they submitted, the decision, and the
 * bank account behind their payouts.
 *
 * Documents and the full account number are fetched only on a click — both are
 * sensitive, and the account reveal is audit-logged — and neither outlives this
 * panel: object URLs are revoked and the account number is dropped on close.
 */
const KycReviewPanel: React.FC<{
  seller: AdminSeller;
  onClose: () => void;
  onDecided: (message: string) => void;
}> = ({ seller, onClose, onDecided }) => {
  const [doc, setDoc] = useState<OpenDocument | null>(null);
  const [docLoading, setDocLoading] = useState<string | null>(null);
  const [bank, setBank] = useState<RevealedBank | null>(null);
  const [bankLoading, setBankLoading] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const docUrlRef = useRef<string | null>(null);

  useEffect(() => {
    headingRef.current?.focus();
    headingRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [seller.id]);

  // Revoke whatever is still open when the panel goes away.
  useEffect(
    () => () => {
      if (docUrlRef.current) URL.revokeObjectURL(docUrlRef.current);
    },
    []
  );

  const closeDocument = () => {
    if (docUrlRef.current) URL.revokeObjectURL(docUrlRef.current);
    docUrlRef.current = null;
    setDoc(null);
  };

  const openDocument = async (name: string) => {
    setDocLoading(name);
    setError(null);
    try {
      const blob = await fetchKycDocument(seller.id, name);
      closeDocument();
      const url = URL.createObjectURL(blob);
      docUrlRef.current = url;
      const isImage = blob.type.startsWith('image/') || /\.(webp|png|jpe?g)$/i.test(name);
      setDoc({ name, url, isImage });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDocLoading(null);
    }
  };

  const reveal = async () => {
    setBankLoading(true);
    setError(null);
    try {
      setBank(await revealBank(seller.id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBankLoading(false);
    }
  };

  const decide = async (decision: 'approve' | 'reject') => {
    if (decision === 'reject' && !reason.trim()) return;
    setBusy(decision);
    setError(null);
    try {
      const result = await decideKyc(
        seller.id,
        decision,
        decision === 'reject' ? reason.trim() : undefined
      );
      setRejecting(false);
      setReason('');
      onDecided(result.message);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const headingId = `kyc-heading-${seller.id}`;
  const reasonId = `kyc-reason-${seller.id}`;
  const canDecide = seller.kycStatus !== 'NOT_SUBMITTED';

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
            Identity review
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
          <KycBadge status={seller.kycStatus} />
        </div>
        <button type="button" className="btn" onClick={onClose}>
          Close review
        </button>
      </div>

      {error && (
        <div className="admin-alert admin-alert--warn" role="alert">
          <span>{error}</span>
        </div>
      )}

      {seller.kycStatus === 'REJECTED' && seller.kycRejectionReason && (
        <div className="admin-alert" style={{ marginBottom: 16 }}>
          <span>
            <strong>Rejection reason sent to the seller:</strong> {seller.kycRejectionReason}
          </span>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 16,
          marginBottom: 20,
        }}
      >
        <Detail label="PAN">
          <span style={mono}>{seller.pan ?? '—'}</span>
        </Detail>
        <Detail label="GSTIN">
          <span style={mono}>{seller.gstin ?? '—'}</span>
        </Detail>
        <Detail label="Submitted">{when(seller.kycSubmittedAt)}</Detail>
        <Detail label="Reviewed">{when(seller.kycReviewedAt)}</Detail>
      </div>

      <p style={labelStyle}>Documents</p>
      {seller.kycDocuments.length === 0 ? (
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
            margin: '0 0 12px',
          }}
        >
          {seller.kycDocuments.map((name, index) => {
            const kind = /\.pdf$/i.test(name) ? 'PDF' : 'image';
            const isOpen = doc?.name === name;
            return (
              <li key={name}>
                <button
                  type="button"
                  className="btn"
                  aria-pressed={isOpen}
                  disabled={docLoading !== null}
                  onClick={() => (isOpen ? closeDocument() : void openDocument(name))}
                >
                  {docLoading === name
                    ? 'Opening…'
                    : `${isOpen ? 'Hide' : 'View'} document ${index + 1} (${kind})`}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {doc && (
        <div
          style={{
            marginBottom: 20,
            padding: 12,
            borderRadius: 'var(--admin-radius-sm)',
            border: '1px solid var(--admin-line)',
            background: 'var(--admin-panel-2)',
          }}
        >
          {doc.isImage ? (
            // A blob: URL from an authenticated fetch — next/image cannot load it.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={doc.url}
              alt={`Identity document submitted by ${seller.shopName}`}
              style={{ display: 'block', maxWidth: '100%', maxHeight: 520, margin: '0 auto' }}
            />
          ) : (
            <iframe
              src={doc.url}
              title={`Identity document submitted by ${seller.shopName}`}
              style={{
                display: 'block',
                width: '100%',
                height: 520,
                border: 0,
                background: '#fff',
              }}
            />
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            <a href={doc.url} target="_blank" rel="noopener noreferrer" className="btn">
              Open in new tab
            </a>
            <button type="button" className="btn" onClick={closeDocument}>
              Close document
            </button>
          </div>
        </div>
      )}

      <p style={labelStyle}>Bank account</p>
      {!seller.hasBankDetails ? (
        <p className="admin-kpi-sub" style={{ marginBottom: 20 }}>
          No bank details given yet.
        </p>
      ) : bank ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 16,
            alignItems: 'end',
            marginBottom: 20,
          }}
        >
          <Detail label="Account number">
            <span style={{ ...mono, letterSpacing: '0.04em' }}>{bank.accountNumber ?? '—'}</span>
          </Detail>
          <Detail label="Account name">{bank.accountName ?? '—'}</Detail>
          <Detail label="IFSC">
            <span style={mono}>{bank.ifsc ?? '—'}</span>
          </Detail>
          <Detail label="Bank">{bank.bankName ?? '—'}</Detail>
          <div>
            <button type="button" className="btn" onClick={() => setBank(null)}>
              Hide account number
            </button>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 12,
            marginBottom: 20,
          }}
        >
          <span style={{ ...mono, color: 'var(--admin-text)' }}>
            <span className="sr-only">Account ending </span>····{seller.bankAccountLast4 ?? '????'}
          </span>
          <button type="button" className="btn" onClick={reveal} disabled={bankLoading}>
            {bankLoading ? 'Revealing…' : 'Reveal account number'}
          </button>
          <span className="admin-kpi-sub">Each reveal is recorded in the audit log.</span>
        </div>
      )}

      {canDecide ? (
        <div style={{ borderTop: '1px solid var(--admin-line)', paddingTop: 16 }}>
          {rejecting ? (
            <div>
              <label htmlFor={reasonId} style={labelStyle}>
                Reason for rejection * (the seller will see this)
              </label>
              <textarea
                id={reasonId}
                autoFocus
                required
                rows={3}
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="e.g. The PAN card photo is blurred. Please upload a clearer scan."
                style={{ ...fieldStyle, resize: 'vertical' }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => decide('reject')}
                  disabled={busy !== null || !reason.trim()}
                >
                  {busy === 'reject' ? 'Rejecting…' : 'Reject identity check'}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setRejecting(false)}
                  disabled={busy !== null}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => decide('approve')}
                disabled={busy !== null || seller.kycStatus === 'APPROVED'}
              >
                {busy === 'approve'
                  ? 'Approving…'
                  : seller.kycStatus === 'APPROVED'
                    ? 'Identity approved'
                    : 'Approve identity and verify shop'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setRejecting(true);
                  setReason('');
                }}
                disabled={busy !== null}
              >
                {seller.kycStatus === 'APPROVED' ? 'Revoke with reason…' : 'Reject…'}
              </button>
            </div>
          )}
        </div>
      ) : (
        <p
          className="admin-kpi-sub"
          style={{ borderTop: '1px solid var(--admin-line)', paddingTop: 16 }}
        >
          This seller has not submitted identity details yet, so there is nothing to approve.
        </p>
      )}
    </section>
  );
};

type SellerFilter = 'all' | 'applications' | 'pending' | 'unverified';

/** Applications still waiting on the owner's decision. */
const isOpenApplication = (seller: AdminSeller) =>
  seller.applicationStatus === 'APPLIED' || seller.applicationStatus === 'UNDER_REVIEW';

// Sellers waiting on a decision first, then the rest in the server's order.
const KYC_ORDER: Record<KycStatus, number> = {
  PENDING: 0,
  REJECTED: 1,
  NOT_SUBMITTED: 2,
  APPROVED: 3,
};

export default function AdminSellersPage() {
  const [sellers, setSellers] = useState<AdminSeller[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // The shop whose commission is being edited, and the value being typed.
  const [editing, setEditing] = useState<string | null>(null);
  const [rate, setRate] = useState('');
  // False = no override (category rates apply); true = the custom % in `rate`.
  const [customRate, setCustomRate] = useState(false);
  const commissionInput = (): { commissionRate: number | null } => ({
    commissionRate: customRate ? Number(rate) : null,
  });
  const [filter, setFilter] = useState<SellerFilter>('all');
  const [showForm, setShowForm] = useState(false);
  // The shop whose identity check is open for review.
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  // The shop whose application is open for a decision.
  const [applicationId, setApplicationId] = useState<string | null>(null);
  // A shop the server refused to verify because its identity is not approved.
  const [blocked, setBlocked] = useState<{ id: string; shopName: string; message: string } | null>(
    null
  );

  const load = useCallback(
    () =>
      getSellers()
        .then((rows) => {
          setSellers(rows);
          setError(null);
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setIsLoading(false)),
    []
  );

  useEffect(() => {
    void load();
  }, [load]);

  const change = async (seller: AdminSeller, input: Parameters<typeof updateSeller>[1]) => {
    setBusyId(seller.id);
    setNotice(null);
    try {
      await updateSeller(seller.id, input);
      setEditing(null);
      setBlocked(null);
      await load();
    } catch (err) {
      if (err instanceof KycRequiredError) {
        setBlocked({ id: seller.id, shopName: seller.shopName, message: err.message });
      } else {
        setError((err as Error).message);
      }
    } finally {
      setBusyId(null);
    }
  };

  const openReview = (id: string) => {
    setBlocked(null);
    setReviewingId(id);
  };

  const sorted = useMemo(
    () =>
      [...sellers].sort((a, b) => (KYC_ORDER[a.kycStatus] ?? 9) - (KYC_ORDER[b.kycStatus] ?? 9)),
    [sellers]
  );

  const pendingKyc = sellers.filter((seller) => seller.kycStatus === 'PENDING').length;
  const awaiting = sellers.filter((seller) => !seller.isVerified).length;
  const openApplications = sellers.filter(isOpenApplication).length;
  const visible = sorted.filter((seller) =>
    filter === 'applications'
      ? isOpenApplication(seller)
      : filter === 'pending'
        ? seller.kycStatus === 'PENDING'
        : filter === 'unverified'
          ? !seller.isVerified
          : true
  );
  const reviewing = sellers.find((seller) => seller.id === reviewingId) ?? null;
  const application = sellers.find((seller) => seller.id === applicationId) ?? null;

  const filters: Array<{ key: SellerFilter; label: string }> = [
    { key: 'all', label: `All (${sellers.length})` },
    { key: 'applications', label: `Applications (${openApplications})` },
    { key: 'pending', label: `Awaiting verification (${pendingKyc})` },
    { key: 'unverified', label: `Unverified shops (${awaiting})` },
  ];

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1 className="admin-page-title">Sellers</h1>
          <p className="admin-page-sub">
            Shops trading on the storefront. A shop is verified by approving its identity check;
            until then it can prepare listings, but nothing of theirs is visible to shoppers.
          </p>
        </div>
        <div className="admin-page-actions">
          <button
            type="button"
            className={showForm ? 'btn' : 'btn btn-primary'}
            aria-expanded={showForm}
            aria-controls="new-seller-form"
            onClick={() => setShowForm((open) => !open)}
          >
            {showForm ? 'Close form' : 'Add seller'}
          </button>
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
      {blocked && (
        <div
          className="admin-alert admin-alert--warn"
          role="alert"
          style={{ marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}
        >
          <span style={{ flex: '1 1 240px' }}>
            <strong>{blocked.shopName}:</strong> {blocked.message}
          </span>
          <span className="admin-actions">
            <button type="button" className="btn btn-sm" onClick={() => setBlocked(null)}>
              Dismiss
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={busyId === blocked.id}
              onClick={() => {
                const seller = sellers.find((row) => row.id === blocked.id);
                if (seller) void change(seller, { isVerified: true, overrideKyc: true });
              }}
            >
              Verify without identity check
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => openReview(blocked.id)}
            >
              Review identity
            </button>
          </span>
        </div>
      )}

      <div className="admin-grid-kpi" style={{ marginBottom: 16 }}>
        <div className="admin-card">
          <p className="admin-kpi-label">Shops</p>
          <p className="admin-kpi-value">{sellers.length}</p>
          <p className="admin-kpi-sub">{sellers.filter((s) => s.isActive).length} active</p>
        </div>
        <button
          type="button"
          className="admin-kpi-link"
          onClick={() => setFilter('pending')}
          style={{ all: 'unset', cursor: 'pointer', display: 'block' }}
          aria-label={`Show ${pendingKyc} sellers awaiting identity verification`}
        >
          <div className="admin-card" style={{ height: '100%' }}>
            <p className="admin-kpi-label">Awaiting verification</p>
            <p className="admin-kpi-value">{pendingKyc}</p>
            <p className="admin-kpi-sub">
              {pendingKyc > 0
                ? 'Identity checks to review'
                : `${awaiting} unverified · none submitted`}
            </p>
          </div>
        </button>
        <div className="admin-card">
          <p className="admin-kpi-label">Listings</p>
          <p className="admin-kpi-value">
            {sellers.reduce((sum, seller) => sum + seller._count.products, 0)}
          </p>
          <p className="admin-kpi-sub">Across all shops</p>
        </div>
        <Link href="/admin/payouts" className="admin-kpi-link">
          <div className="admin-card">
            <p className="admin-kpi-label">Paid out</p>
            <p className="admin-kpi-value">
              {formatCurrency(sellers.reduce((sum, seller) => sum + seller.totalEarnings, 0))}
            </p>
            <p className="admin-kpi-sub">To date · open payouts</p>
          </div>
        </Link>
      </div>

      {showForm && (
        <div id="new-seller-form">
          <NewSellerForm onCreated={load} onClose={() => setShowForm(false)} />
        </div>
      )}

      {application && (
        <ApplicationPanel
          key={application.id}
          seller={application}
          onClose={() => setApplicationId(null)}
          onReviewIdentity={() => openReview(application.id)}
          onDecided={(message) => {
            setNotice(`${application.shopName}: ${message}`);
            announceQueuesChanged();
            void load();
          }}
        />
      )}

      {reviewing && (
        <KycReviewPanel
          key={reviewing.id}
          seller={reviewing}
          onClose={() => setReviewingId(null)}
          onDecided={(message) => {
            setNotice(`${reviewing.shopName}: ${message}`);
            announceQueuesChanged();
            void load();
          }}
        />
      )}

      <div className="admin-card admin-index">
        <div className="admin-toolbar" role="group" aria-label="Filter sellers">
          {filters.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={filter === option.key}
              onClick={() => setFilter(option.key)}
              className={`filter-pill${filter === option.key ? ' filter-pill--active' : ''}`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="admin-empty">
            <p className="admin-empty-text">Loading sellers…</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="admin-empty">
            <div className="admin-empty-icon">
              <Store size={22} />
            </div>
            <p className="admin-empty-title">
              {sellers.length === 0
                ? 'No sellers yet'
                : filter === 'applications'
                  ? 'No applications waiting'
                  : filter === 'pending'
                  ? 'No identity checks waiting'
                  : 'Every shop is verified'}
            </p>
            <p className="admin-empty-text">
              {sellers.length === 0
                ? 'Add one, or wait for someone to apply from the storefront.'
                : filter === 'applications'
                  ? 'Every application has been decided.'
                  : filter === 'pending'
                  ? 'Everyone who has submitted has been reviewed.'
                  : 'There are no unverified shops right now.'}
            </p>
          </div>
        ) : (
          <div className="admin-table-wrap" style={flush}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Shop</th>
                  <th>Contact</th>
                  <th>Identity</th>
                  <th>Commission</th>
                  <th style={{ textAlign: 'right' }}>Products</th>
                  <th style={{ textAlign: 'right' }}>Orders</th>
                  <th>State</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((seller) => (
                  <tr key={seller.id}>
                    <td style={{ maxWidth: 240 }}>
                      <span className="admin-row-title" style={truncate} title={seller.shopName}>
                        {seller.shopName}
                      </span>
                      <span
                        style={{ ...truncate, color: 'var(--a-text-dim)', fontSize: 12 }}
                        title={`/sellers/${seller.shopSlug}`}
                      >
                        /sellers/{seller.shopSlug}
                      </span>
                    </td>
                    <td style={{ maxWidth: 220 }}>
                      <span style={truncate} title={seller.user?.email ?? undefined}>
                        {seller.user?.email ?? '—'}
                      </span>
                    </td>
                    <td>
                      <KycBadge status={seller.kycStatus} />
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {editing === seller.id ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <select
                            value={customRate ? 'custom' : 'default'}
                            aria-label={`Commission source for ${seller.shopName}`}
                            onChange={(event) => setCustomRate(event.target.value === 'custom')}
                          >
                            <option value="default">Category default</option>
                            <option value="custom">Custom rate</option>
                          </select>
                          {customRate && (
                            <input
                              autoFocus
                              type="number"
                              min={0}
                              max={100}
                              step={0.5}
                              value={rate}
                              aria-label={`Commission % for ${seller.shopName}`}
                              onChange={(event) => setRate(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') void change(seller, commissionInput());
                                if (event.key === 'Escape') setEditing(null);
                              }}
                              style={{ width: 72 }}
                            />
                          )}
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            disabled={busyId === seller.id || (customRate && rate.trim() === '')}
                            onClick={() => change(seller, commissionInput())}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            onClick={() => setEditing(null)}
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          title="Edit commission"
                          aria-label={`Edit commission for ${seller.shopName}, currently ${
                            seller.commissionRate === null
                              ? 'category default'
                              : `${seller.commissionRate}%`
                          }`}
                          onClick={() => {
                            setEditing(seller.id);
                            setCustomRate(seller.commissionRate !== null);
                            setRate(seller.commissionRate === null ? '' : String(seller.commissionRate));
                          }}
                        >
                          {seller.commissionRate === null
                            ? 'Category default'
                            : `${seller.commissionRate}% (custom)`}
                        </button>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>{seller._count.products}</td>
                    <td style={{ textAlign: 'right' }}>{seller._count.sellerOrders}</td>
                    <td>
                      <span
                        className="admin-status-badge"
                        data-status={
                          !seller.isActive ? 'SUSPENDED' : seller.isVerified ? 'ACTIVE' : 'PENDING'
                        }
                      >
                        {!seller.isActive
                          ? 'Suspended'
                          : seller.isVerified
                            ? 'Verified'
                            : 'Not verified'}
                      </span>
                      {seller.applicationStatus !== 'APPROVED' && (
                        <>
                          {' '}
                          <ApplicationBadge status={seller.applicationStatus} />
                        </>
                      )}
                    </td>
                    <td>
                      <div className="admin-actions">
                        <button
                          type="button"
                          className={
                            isOpenApplication(seller) ? 'btn btn-sm btn-primary' : 'btn btn-sm'
                          }
                          style={actionWidth}
                          aria-expanded={applicationId === seller.id}
                          aria-label={`Application for ${seller.shopName}`}
                          onClick={() =>
                            setApplicationId((current) => (current === seller.id ? null : seller.id))
                          }
                        >
                          {applicationId === seller.id
                            ? 'Close'
                            : isOpenApplication(seller)
                              ? 'Decide'
                              : 'Application'}
                        </button>
                        <button
                          type="button"
                          className={
                            seller.kycStatus === 'PENDING' ? 'btn btn-sm btn-primary' : 'btn btn-sm'
                          }
                          style={actionWidth}
                          aria-expanded={reviewingId === seller.id}
                          aria-label={`${
                            seller.kycStatus === 'PENDING' ? 'Review identity' : 'Identity and bank'
                          } for ${seller.shopName}`}
                          onClick={() =>
                            reviewingId === seller.id ? setReviewingId(null) : openReview(seller.id)
                          }
                        >
                          {reviewingId === seller.id
                            ? 'Close'
                            : seller.kycStatus === 'PENDING'
                              ? 'Review'
                              : 'Identity'}
                        </button>
                        {/* The identity review is the normal way in. Verifying directly is
                            refused by the server until identity is approved; the refusal
                            is shown above with the review and override as next steps.
                            A suspended shop cannot be verified, so the toggle is hidden. */}
                        {seller.isActive ? (
                          <button
                            type="button"
                            className="btn btn-sm"
                            style={actionWidth}
                            disabled={busyId === seller.id}
                            onClick={() => change(seller, { isVerified: !seller.isVerified })}
                          >
                            {seller.isVerified ? 'Unverify' : 'Verify'}
                          </button>
                        ) : (
                          <span style={actionWidth} aria-hidden="true" />
                        )}
                        <button
                          type="button"
                          className="btn btn-sm"
                          style={actionWidth}
                          disabled={busyId === seller.id}
                          onClick={() => change(seller, { isActive: !seller.isActive })}
                        >
                          {seller.isActive ? 'Suspend' : 'Reinstate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="admin-index-footer">
          <p style={{ margin: 0, color: 'var(--a-text-dim)', fontSize: 12 }}>
            Changing a commission applies to orders placed afterwards — every sub-order keeps the
            rate it was charged, so money already owed does not move.
          </p>
        </div>
      </div>
    </div>
  );
}
