'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { Breadcrumbs, Button, Input, LoadingSpinner } from '@/components/common';
import { ProductThumb } from '@/components/product';
import {
  fetchSellerBrandDocument,
  getSellerBrands,
  registerSellerBrand,
  type BrandAuthorizationType,
  type BrandStatus,
  type SellerBrand,
} from '@/lib/seller-api';
import { RootState } from '@/store';
import { ImageField } from '../_components/ImageField';
import { Select, TextArea } from '../_components/fields';

/**
 * Brands a shop sells under.
 *
 * Selling under a brand name needs proof: the trademark registration if the
 * shop owns the brand, or a letter from the owner if it is an authorised
 * reseller. The document is stored privately, like KYC documents, and an admin
 * approves the brand. Until then the shop can still put it on its own
 * listings; approval gives it a storefront page and opens it to the catalogue.
 */

const ACCEPTED = 'application/pdf,image/jpeg,image/png,image/webp';

const STATUS_COPY: Record<BrandStatus, { label: string; color: string }> = {
  PENDING: { label: 'In review', color: 'var(--ink-2)' },
  APPROVED: { label: 'Approved', color: 'var(--ink)' },
  REJECTED: { label: 'Not approved', color: 'var(--sale)' },
};

const AUTH_LABELS: Record<BrandAuthorizationType, string> = {
  TRADEMARK_OWNER: 'Trademark owner',
  AUTHORISED_RESELLER: 'Authorised reseller',
};

interface FormValues {
  name: string;
  description: string;
  logo: string;
  authorizationType: BrandAuthorizationType;
  document: File | null;
}

const EMPTY: FormValues = {
  name: '',
  description: '',
  logo: '',
  authorizationType: 'TRADEMARK_OWNER',
  document: null,
};

export default function SellerBrandsPage() {
  const router = useRouter();
  const { user, isInitialized } = useSelector((state: RootState) => state.auth);

  const [brands, setBrands] = useState<SellerBrand[]>([]);
  const [values, setValues] = useState<FormValues>(EMPTY);
  // Bumped after a submit so the file input is cleared along with the form.
  const [formKey, setFormKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isInitialized && !user) router.replace('/auth/login?redirect=/seller/brands');
  }, [isInitialized, user, router]);

  const load = useCallback(
    () =>
      getSellerBrands()
        .then((list) => {
          setBrands(list);
          setError(null);
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setIsLoading(false)),
    []
  );

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  /** Prefill the form to resubmit a brand with new proof. */
  const resubmit = (brand: SellerBrand) => {
    setValues({
      name: brand.name,
      description: brand.description ?? '',
      logo: brand.logo ?? '',
      authorizationType: brand.authorizationType ?? 'TRADEMARK_OWNER',
      document: null,
    });
    setFormKey((key) => key + 1);
    document.getElementById('brand-name')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (values.name.trim().length < 2) {
      toast.error('Enter the brand name.');
      return;
    }
    if (!values.document) {
      toast.error(
        values.authorizationType === 'AUTHORISED_RESELLER'
          ? 'Attach the authorised-reseller letter.'
          : 'Attach your trademark registration certificate.'
      );
      return;
    }
    setIsSaving(true);
    try {
      await registerSellerBrand({
        name: values.name.trim(),
        description: values.description.trim() || undefined,
        logo: values.logo || undefined,
        authorizationType: values.authorizationType,
        document: values.document,
      });
      toast.success('Brand submitted for review.');
      setValues(EMPTY);
      setFormKey((key) => key + 1);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const openDocument = async (brandId: string) => {
    // Opened before the fetch so popup blockers see it as a direct click.
    const tab = window.open('', '_blank');
    try {
      const blob = await fetchSellerBrandDocument(brandId);
      const url = URL.createObjectURL(blob);
      if (tab) tab.location.href = url;
      else window.location.assign(url);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      tab?.close();
      toast.error((err as Error).message);
    }
  };

  if (!isInitialized || (user && isLoading)) {
    return <LoadingSpinner className="min-h-[50vh]" size="lg" />;
  }
  if (!user) return null;

  return (
    <main className="section-y">
      <div className="container-max">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Sell', href: '/seller' },
            { label: 'Brands' },
          ]}
        />

        <header className="mt-6 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
          <div>
            <h1
              className="m-0 text-ink"
              style={{
                fontSize: 'clamp(26px, 3.6vw, 38px)',
                lineHeight: 1.05,
                letterSpacing: '-0.03em',
              }}
            >
              Brands
            </h1>
            <p className="mt-2 text-[14px]" style={{ color: 'var(--ink-3)' }}>
              Register the brands you sell under, with proof that you may.
            </p>
          </div>
          <Link href="/seller" className="btn btn-outline btn-sm">
            Back to dashboard
          </Link>
        </header>

        {error && <p className="alert alert-error mt-6 text-sm">{error}</p>}

        <section className="mt-8">
          <h2
            className="m-0 text-ink"
            style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-0.01em' }}
          >
            Your brands
          </h2>
          {brands.length === 0 ? (
            <p className="mt-3 text-[14px]" style={{ color: 'var(--ink-3)' }}>
              None yet. Selling unbranded or under the platform&apos;s brands? You can skip this.
            </p>
          ) : (
            <ul
              className="m-0 mt-4 flex list-none flex-col gap-px p-0"
              style={{ background: 'var(--border)' }}
            >
              {brands.map((brand) => {
                const status = STATUS_COPY[brand.status];
                return (
                  <li
                    key={brand.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3.5"
                    style={{ background: 'var(--surface)' }}
                  >
                    <span className="h-10 w-10 flex-shrink-0 overflow-hidden border border-line">
                      <ProductThumb src={brand.logo} alt="" className="h-full w-full" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="m-0 truncate text-[14px] font-semibold text-ink">
                        {brand.name}
                      </p>
                      <p className="m-0 mt-0.5 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
                        {brand.authorizationType
                          ? AUTH_LABELS[brand.authorizationType]
                          : 'Added from a listing — no proof uploaded'}
                        {' · '}
                        {brand._count.products} listing{brand._count.products === 1 ? '' : 's'}
                      </p>
                      {brand.status === 'REJECTED' && brand.rejectionReason && (
                        <p className="m-0 mt-1 text-[12.5px]" style={{ color: 'var(--sale)' }}>
                          {brand.rejectionReason}
                        </p>
                      )}
                    </div>
                    <span className="text-[12.5px] font-semibold" style={{ color: status.color }}>
                      {status.label}
                    </span>
                    {brand.hasDocument && (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => openDocument(brand.id)}
                      >
                        View proof
                      </button>
                    )}
                    {(brand.status === 'REJECTED' || !brand.hasDocument) && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => resubmit(brand)}
                      >
                        {brand.hasDocument ? 'Resubmit' : 'Add proof'}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <form
          key={formKey}
          onSubmit={submit}
          className="mt-10 flex max-w-[720px] flex-col gap-4 border-t border-line pt-8"
        >
          <div>
            <h2
              className="m-0 text-ink"
              style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-0.01em' }}
            >
              Register a brand
            </h2>
            <p className="m-0 mt-2 text-[14px]" style={{ color: 'var(--ink-3)' }}>
              We usually review a brand within two working days. You can list under it in the
              meantime; it gets its own storefront page once approved.
            </p>
          </div>

          <Input
            id="brand-name"
            label="Brand name *"
            value={values.name}
            onChange={(event) => set('name', event.target.value)}
            maxLength={80}
          />
          <TextArea
            id="brand-description"
            label="About the brand"
            rows={3}
            maxLength={2000}
            value={values.description}
            onChange={(event) => set('description', event.target.value)}
          />
          <ImageField
            id="brand-logo"
            label="Logo"
            value={values.logo}
            onChange={(next) => set('logo', next)}
            helperText="Square works best."
            disabled={isSaving}
          />
          <Select
            id="brand-authorization"
            label="Your right to sell this brand *"
            value={values.authorizationType}
            onChange={(event) =>
              set('authorizationType', event.target.value as BrandAuthorizationType)
            }
          >
            <option value="TRADEMARK_OWNER">I own the trademark</option>
            <option value="AUTHORISED_RESELLER">I am an authorised reseller</option>
          </Select>
          <div className="space-y-1">
            <label htmlFor="brand-document" className="block text-sm font-medium text-black">
              {values.authorizationType === 'AUTHORISED_RESELLER'
                ? 'Authorised-reseller letter *'
                : 'Trademark registration certificate *'}
            </label>
            <input
              id="brand-document"
              type="file"
              accept={ACCEPTED}
              onChange={(event) => set('document', event.target.files?.[0] ?? null)}
              className="block w-full text-[14px]"
            />
            <p className="text-sm text-neutral-500">
              PDF or a photo, up to 5 MB. Kept private — only you and our team can open it.
            </p>
          </div>

          <div>
            <Button type="submit" size="lg" loading={isSaving}>
              Submit for review
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}
