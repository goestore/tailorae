'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Button, Input, LoadingSpinner } from '@/components/common';
import { useSeller } from '@/components/seller/SellerContext';
import {
  EDITABLE_STATUSES,
  KYC_KIND_LABELS,
  STATUS_LABELS,
  deleteKycDocument,
  kycDocumentUrl,
  listKycDocuments,
  submitApplication,
  updateBusiness,
  uploadKycDocument,
  type KycDocument,
  type KycKind,
} from '@/lib/seller-api';
import { cleanId, taxIdProblem } from '../_components/CompanyFields';
import { Select } from '../_components/fields';
import { NoShopYet, NotForRole, Notice, PageHeader, SectionTitle, StatusNotice, formatDate } from '../_components/ui';

/**
 * The seller's identity check (KYC): PAN and GSTIN, the documents that back
 * them up, and the button that sends the application for review.
 *
 * Documents go to the private bucket (`POST /seller/kyc/documents`, one kind
 * per file). They never get a public address: opening one asks the API for a
 * five-minute signed link. Only the shop's owner can see this page; the API
 * answers 403 to every other role.
 */

const ACCEPTED = 'application/pdf,image/jpeg,image/png,image/webp';
const KINDS = Object.keys(KYC_KIND_LABELS) as KycKind[];

const kb = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export default function SellerVerificationPage() {
  const { me, refresh, can } = useSeller();
  const shop = me?.shop ?? null;

  const [documents, setDocuments] = useState<KycDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<KycKind>('PAN');
  const [busy, setBusy] = useState<string | null>(null);
  const [pan, setPan] = useState(shop?.pan ?? '');
  const [gstin, setGstin] = useState(shop?.gstin ?? '');
  const fileRef = useRef<HTMLInputElement>(null);
  const allowed = Boolean(shop) && can('PROFILE');

  const load = useCallback(
    () =>
      listKycDocuments()
        .then((rows) => {
          setDocuments(rows);
          setError(null);
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setIsLoading(false)),
    []
  );

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  if (!shop) return <NoShopYet />;
  if (!can('PROFILE')) return <NotForRole what="the business's verification documents" />;
  if (isLoading) return <LoadingSpinner className="min-h-[50vh]" size="lg" />;

  const editable = EDITABLE_STATUSES.includes(shop.status);
  const missing = me?.checklist ?? [];

  const pick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('That file is over 10 MB. A scan or photo of the page is enough.');
      return;
    }
    setBusy('upload');
    try {
      await uploadKycDocument(kind, file);
      toast.success(`${KYC_KIND_LABELS[kind]} uploaded.`);
      await Promise.all([load(), refresh()]);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const open = async (doc: KycDocument) => {
    // Opened before the request so the browser treats it as the click's own window.
    const tab = window.open('', '_blank');
    try {
      const url = await kycDocumentUrl(doc.id);
      if (tab) tab.location.href = url;
      else window.location.assign(url);
    } catch (err) {
      tab?.close();
      toast.error((err as Error).message);
    }
  };

  const remove = async (doc: KycDocument) => {
    if (!window.confirm(`Remove ${doc.filename}?`)) return;
    setBusy(doc.id);
    try {
      await deleteKycDocument(doc.id);
      toast.success('Document removed.');
      await Promise.all([load(), refresh()]);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const saveIds = async (event: React.FormEvent) => {
    event.preventDefault();
    const problem = taxIdProblem(pan, gstin);
    if (problem) {
      toast.error(problem);
      return;
    }
    if (!cleanId(pan)) {
      toast.error('Enter your PAN.');
      return;
    }
    setBusy('ids');
    try {
      await updateBusiness({ pan: cleanId(pan), gstin: cleanId(gstin) || undefined });
      toast.success('Saved.');
      await refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const submit = async () => {
    setBusy('submit');
    try {
      await submitApplication();
      toast.success('Application submitted.');
      await refresh();
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
          title="Verification"
          lead={`Your PAN, GSTIN and the documents that back them up. Status: ${STATUS_LABELS[shop.status].toLowerCase()}.`}
          actions={
            <Link href="/seller" className="btn btn-outline btn-sm">
              Back to overview
            </Link>
          }
        />

        <StatusNotice shop={shop} />
        {error && <p className="alert alert-error mt-6 text-sm">{error}</p>}

        <div className="mt-8 flex max-w-[720px] flex-col gap-10">
          <form onSubmit={saveIds} className="flex flex-col gap-4">
            <SectionTitle>Tax identity</SectionTitle>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                id="kyc-pan"
                label="PAN *"
                value={pan}
                onChange={(event) => setPan(cleanId(event.target.value))}
                maxLength={10}
                autoComplete="off"
                placeholder="ABCDE1234F"
                disabled={!editable}
              />
              <Input
                id="kyc-gstin"
                label="GSTIN"
                value={gstin}
                onChange={(event) => setGstin(cleanId(event.target.value))}
                maxLength={15}
                autoComplete="off"
                placeholder="Only if you are registered"
                disabled={!editable}
              />
            </div>
            {editable ? (
              <div>
                <Button type="submit" variant="outline" loading={busy === 'ids'}>
                  Save PAN and GSTIN
                </Button>
              </div>
            ) : (
              <p className="m-0 text-meta" style={{ color: 'var(--ink-3)' }}>
                Locked while your application is reviewed and once it is decided. Contact us to change them.
              </p>
            )}
          </form>

          <section className="flex flex-col gap-4 border-t border-line pt-8">
            <SectionTitle>Documents</SectionTitle>
            <p className="m-0 text-[14px]" style={{ color: 'var(--ink-3)' }}>
              A PAN card is always needed; add the GST certificate if you gave a GSTIN. PDF, JPG, PNG or WebP, up to
              10 MB. Only you and our review team can open them.
            </p>

            {documents.length === 0 ? (
              <p className="m-0 text-[14px]" style={{ color: 'var(--ink-2)' }}>
                Nothing uploaded yet.
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-px p-0" style={{ background: 'var(--border)' }}>
                {documents.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 p-3.5"
                    style={{ background: 'var(--surface)' }}
                  >
                    <div className="min-w-0">
                      <p className="m-0 text-[14px] font-medium text-ink">{KYC_KIND_LABELS[doc.kind]}</p>
                      <p className="m-0 truncate text-small" style={{ color: 'var(--ink-3)' }}>
                        {doc.filename} · {kb(doc.bytes)} · {formatDate(doc.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-meta">
                      <button type="button" className="underline underline-offset-2" onClick={() => void open(doc)}>
                        View
                      </button>
                      {editable && (
                        <button
                          type="button"
                          className="underline underline-offset-2 disabled:opacity-40"
                          style={{ color: 'var(--sale)' }}
                          disabled={busy === doc.id}
                          onClick={() => void remove(doc)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {editable && (
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[220px]">
                  <Select id="kyc-kind" label="Document" value={kind} onChange={(event) => setKind(event.target.value as KycKind)}>
                    {KINDS.map((k) => (
                      <option key={k} value={k}>
                        {KYC_KIND_LABELS[k]}
                      </option>
                    ))}
                  </Select>
                </div>
                <input ref={fileRef} type="file" accept={ACCEPTED} className="hidden" onChange={pick} aria-label="Choose a file" />
                <Button type="button" loading={busy === 'upload'} onClick={() => fileRef.current?.click()}>
                  Choose file and upload
                </Button>
              </div>
            )}
          </section>

          {editable && (
            <section className="flex flex-col gap-3 border-t border-line pt-8">
              <SectionTitle>Send for review</SectionTitle>
              {missing.length > 0 ? (
                <Notice title="Not ready yet" tone="plain" className="mt-0">
                  <ul className="m-0 list-disc pl-5">
                    {missing.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </Notice>
              ) : (
                <p className="m-0 text-[14px]" style={{ color: 'var(--ink-2)' }}>
                  Everything we need is in. Submit and our team will review it, usually within one working day.
                </p>
              )}
              <div>
                <Button disabled={missing.length > 0} loading={busy === 'submit'} onClick={submit}>
                  Submit application
                </Button>
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
