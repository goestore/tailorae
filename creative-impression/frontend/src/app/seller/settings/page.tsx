'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { Breadcrumbs, Button, Input, LoadingSpinner } from '@/components/common';
import { getMyShop, updateMyShop, type MyShop } from '@/lib/seller-api';
import { RootState } from '@/store';
import { ImageField } from '../_components/ImageField';
import { TextArea } from '../_components/fields';
import { BusinessDetailsSection } from '../_components/CompanyFields';

/**
 * A seller's shop settings, and the only place bank details can be entered.
 *
 * Until this page existed the payout chain had no beginning: `PUT /seller/me`
 * accepted bank details, the earnings page told sellers to add them "on your
 * shop", and no form anywhere asked for them. `hasBankDetails` was therefore
 * false forever, "Request payout" never rendered, and the admin settle button
 * stayed disabled saying the shop had given no bank details. Every one of those
 * screens was correct; the form was simply missing.
 *
 * The account number is write-only by design — `GET /seller/me` returns only
 * the last four digits, because a seller needs to recognise which account is on
 * file, not read it back. So the field starts empty and blank means "leave it
 * alone"; replacing it is a deliberate act.
 */

/** 4 letters, a 0, then 6 of either — the format every Indian bank IFSC takes. */
const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

interface ShopFormValues {
  shopName: string;
  shopDescription: string;
  shopImage: string;
  shopBanner: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankIFSC: string;
  bankName: string;
  lowStockThreshold: string;
}

const valuesFrom = (shop: MyShop): ShopFormValues => ({
  shopName: shop.shopName,
  shopDescription: shop.shopDescription ?? '',
  shopImage: shop.shopImage ?? '',
  shopBanner: shop.shopBanner ?? '',
  bankAccountName: shop.bankAccountName ?? '',
  // Never seeded: the API only ever returns the last four digits.
  bankAccountNumber: '',
  bankIFSC: shop.bankIFSC ?? '',
  bankName: shop.bankName ?? '',
  lowStockThreshold: String(shop.lowStockThreshold ?? 5),
});

export default function SellerSettingsPage() {
  const router = useRouter();
  const { user, isInitialized } = useSelector((state: RootState) => state.auth);

  const [shop, setShop] = useState<MyShop | null>(null);
  const [values, setValues] = useState<ShopFormValues | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isInitialized && !user) router.replace('/auth/login?redirect=/seller/settings');
  }, [isInitialized, user, router]);

  // Nothing is set synchronously here: the effect below only starts the fetch,
  // and every setState lands in a callback once it resolves.
  const load = useCallback(
    () =>
      getMyShop()
        .then((myShop) => {
          setShop(myShop);
          setValues(myShop ? valuesFrom(myShop) : null);
          setError(null);
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setIsLoading(false)),
    []
  );

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const set = <K extends keyof ShopFormValues>(key: K, value: ShopFormValues[K]) =>
    setValues((current) => (current ? { ...current, [key]: value } : current));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!values || !shop) return;

    if (!values.shopName.trim()) {
      toast.error('Your shop needs a name.');
      return;
    }

    const ifsc = values.bankIFSC.trim().toUpperCase();
    const accountNumber = values.bankAccountNumber.trim();

    if (ifsc && !IFSC_PATTERN.test(ifsc)) {
      toast.error('That does not look like an IFSC code — 11 characters, e.g. HDFC0001234.');
      return;
    }
    if (accountNumber && !/^\d{9,18}$/.test(accountNumber)) {
      toast.error('An Indian bank account number is between 9 and 18 digits.');
      return;
    }

    /**
     * Bank details are only useful as a set — a payout needs a number and an
     * IFSC together. Refusing a half-filled set here is what stops a seller
     * saving, seeing no error, and still finding no payout button.
     */
    const wantsBank =
      Boolean(accountNumber) ||
      Boolean(ifsc) ||
      Boolean(values.bankName.trim()) ||
      Boolean(values.bankAccountName.trim());
    const hasNumber = Boolean(accountNumber) || shop.hasBankDetails;
    if (wantsBank && (!hasNumber || !ifsc || !values.bankAccountName.trim())) {
      toast.error('To be paid we need the account holder, the account number and the IFSC.');
      return;
    }

    const threshold = Number(values.lowStockThreshold);
    if (!Number.isInteger(threshold) || threshold < 0 || threshold > 1000) {
      toast.error('The low-stock alert must be a whole number from 0 to 1000.');
      return;
    }

    setIsSaving(true);
    try {
      const updated = await updateMyShop({
        lowStockThreshold: threshold,
        shopName: values.shopName.trim(),
        shopDescription: values.shopDescription.trim(),
        shopImage: values.shopImage,
        shopBanner: values.shopBanner,
        bankAccountName: values.bankAccountName.trim(),
        bankIFSC: ifsc,
        bankName: values.bankName.trim(),
        // Blank means "keep the account already on file". Sending it would
        // wipe details the form was never shown and could not repeat.
        ...(accountNumber ? { bankAccountNumber: accountNumber } : {}),
      });
      setShop(updated);
      setValues(valuesFrom(updated));
      toast.success('Shop saved.');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isInitialized || (user && isLoading)) {
    return <LoadingSpinner className="min-h-[50vh]" size="lg" />;
  }
  if (!user) return null;

  if (!shop || !values) {
    return (
      <main className="section-y">
        <div className="container-max">
          {error && <p className="alert alert-error text-sm">{error}</p>}
          <p className="text-[15px]" style={{ color: 'var(--ink-2)' }}>
            You do not have a seller account yet.{' '}
            <Link href="/seller" className="underline underline-offset-2">
              Set one up
            </Link>
            .
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="section-y">
      <div className="container-max">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Sell', href: '/seller' },
            { label: 'Shop settings' },
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
              Shop settings
            </h1>
            <p className="mt-2 text-[14px]" style={{ color: 'var(--ink-3)' }}>
              How your shop looks to shoppers, and where your money is sent.
            </p>
          </div>
          <Link href="/seller" className="btn btn-outline btn-sm">
            Back to dashboard
          </Link>
        </header>

        {error && <p className="alert alert-error mt-6 text-sm">{error}</p>}

        <form onSubmit={submit} className="mt-8 flex max-w-[720px] flex-col gap-8">
          <section className="flex flex-col gap-4">
            <h2
              className="m-0 text-ink"
              style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-0.01em' }}
            >
              Your shop
            </h2>

            <Input
              id="shop-name"
              label="Shop name *"
              value={values.shopName}
              onChange={(event) => set('shopName', event.target.value)}
              maxLength={80}
              helperText={`Shoppers find you at /sellers/${shop.shopSlug}. Renaming the shop does not change that address.`}
            />

            <TextArea
              id="shop-description"
              label="About your shop"
              rows={4}
              maxLength={2000}
              value={values.shopDescription}
              onChange={(event) => set('shopDescription', event.target.value)}
              placeholder="A line or two about your range — this shows on your shop page."
            />

            <ImageField
              id="shop-image"
              label="Shop logo"
              value={values.shopImage}
              onChange={(next) => set('shopImage', next)}
              helperText="Square works best. Shown beside your name in the seller directory."
              disabled={isSaving}
            />

            <ImageField
              id="shop-banner"
              label="Shop banner"
              value={values.shopBanner}
              onChange={(next) => set('shopBanner', next)}
              aspect="3 / 1"
              helperText="Wide. Sits across the top of your shop page."
              disabled={isSaving}
            />
            <Input
              id="low-stock-threshold"
              label="Low-stock alert"
              type="number"
              min={0}
              max={1000}
              inputMode="numeric"
              value={values.lowStockThreshold}
              onChange={(event) => set('lowStockThreshold', event.target.value)}
              helperText="Products and sizes with this many or fewer left appear on your dashboard."
            />
          </section>

          <section className="flex flex-col gap-4 border-t border-line pt-8">
            <div>
              <h2
                className="m-0 text-ink"
                style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-0.01em' }}
              >
                Where we pay you
              </h2>
              <p className="m-0 mt-2 text-[14px]" style={{ color: 'var(--ink-3)' }}>
                Nothing can be paid out until these are filled in.{' '}
                <Link href="/seller/earnings" className="underline underline-offset-2">
                  See what you are owed
                </Link>
                .
              </p>
            </div>

            {!shop.hasBankDetails && (
              <div
                className="border px-4 py-3.5 text-[14px]"
                style={{ borderColor: 'var(--brand)', background: 'var(--brand-soft)' }}
              >
                <p className="m-0 font-semibold text-ink">No account on file</p>
                <p className="m-0 mt-1" style={{ color: 'var(--ink-2)' }}>
                  Your earnings are still counted and held — you just cannot request them yet.
                </p>
              </div>
            )}

            <Input
              id="bank-account-name"
              label="Account holder"
              value={values.bankAccountName}
              onChange={(event) => set('bankAccountName', event.target.value)}
              maxLength={80}
              placeholder="Exactly as the bank has it"
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                id="bank-account-number"
                label={shop.hasBankDetails ? 'New account number' : 'Account number'}
                value={values.bankAccountNumber}
                onChange={(event) => set('bankAccountNumber', event.target.value)}
                inputMode="numeric"
                autoComplete="off"
                maxLength={18}
                placeholder={
                  shop.bankAccountLast4 ? `On file: ends ${shop.bankAccountLast4}` : 'Digits only'
                }
                helperText={
                  shop.hasBankDetails
                    ? `We hold an account ending ${shop.bankAccountLast4}. Leave this blank to keep it, or type a new number to replace it.`
                    : 'We never show this back to you in full once it is saved.'
                }
              />
              <Input
                id="bank-ifsc"
                label="IFSC"
                value={values.bankIFSC}
                onChange={(event) => set('bankIFSC', event.target.value.toUpperCase())}
                maxLength={11}
                autoComplete="off"
                placeholder="HDFC0001234"
                helperText="Eleven characters, from your cheque book or bank app."
              />
            </div>

            <Input
              id="bank-name"
              label="Bank"
              value={values.bankName}
              onChange={(event) => set('bankName', event.target.value)}
              maxLength={80}
              placeholder="HDFC Bank"
            />
          </section>

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
            <Button type="submit" size="lg" loading={isSaving}>
              Save shop
            </Button>
            <Link href="/seller" className="btn btn-outline">
              Cancel
            </Link>
          </div>
        </form>

        <BusinessDetailsSection key={shop.id} shop={shop} onSaved={setShop} />
      </div>
    </main>
  );
}
