'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Button, Input, LoadingSpinner } from '@/components/common';
import { useSeller } from '@/components/seller/SellerContext';
import {
  getBankAccount,
  saveBankAccount,
  updateBusiness,
  type BankAccount,
  type Shop,
} from '@/lib/seller-api';
import { ImageField } from '../_components/ImageField';
import { TextArea } from '../_components/fields';
import { BusinessDetailsSection } from '../_components/CompanyFields';
import { NoShopYet, Notice, PageHeader, SectionTitle } from '../_components/ui';

/**
 * Shop settings: how the shop looks to shoppers (`PUT /seller/business`), the
 * business behind it, and the payout account (`GET/PUT /seller/bank`).
 *
 * The account number is write-only by design: the API returns it masked, so a
 * seller recognises which account is on file without it ever being read back.
 * Replacing it means typing the whole number again. Only the owner edits these;
 * other roles see the shop's public face read-only.
 */

/** 4 letters, a 0, then 6 of either — the format every Indian bank IFSC takes. */
const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

interface ProfileValues {
  shopName: string;
  shopDescription: string;
  shopImage: string;
  shopBanner: string;
  lowStockThreshold: string;
}

const profileFrom = (shop: Shop): ProfileValues => ({
  shopName: shop.shopName,
  shopDescription: shop.shopDescription ?? '',
  shopImage: shop.shopImage ?? '',
  shopBanner: shop.shopBanner ?? '',
  lowStockThreshold: String(shop.lowStockThreshold ?? 5),
});

export default function SellerSettingsPage() {
  const { me, refresh, can } = useSeller();
  const shop = me?.shop ?? null;
  if (!shop) return <NoShopYet />;
  const isOwner = can('PROFILE');

  return (
    <main className="section-y">
      <div className="container-max">
        <PageHeader
          title="Shop settings"
          lead="How your shop looks to shoppers, the business behind it, and where your money is sent."
          actions={
            <Link href="/seller" className="btn btn-outline btn-sm">
              Back to overview
            </Link>
          }
        />
        {!isOwner && (
          <Notice title="Only the owner can change these" tone="plain">
            Your role in this shop does not include the shop profile, business details or bank account.
          </Notice>
        )}
        <ProfileSection key={`p-${shop.id}`} shop={shop} readOnly={!isOwner} onSaved={() => void refresh()} />
        {isOwner && (
          <>
            <BankSection onSaved={() => void refresh()} />
            <div id="business">
              <BusinessDetailsSection key={`b-${shop.id}-${shop.status}`} shop={shop} onSaved={() => void refresh()} />
            </div>
          </>
        )}
      </div>
    </main>
  );
}

const ProfileSection: React.FC<{ shop: Shop; readOnly: boolean; onSaved: () => void }> = ({
  shop,
  readOnly,
  onSaved,
}) => {
  const [values, setValues] = useState<ProfileValues>(() => profileFrom(shop));
  const [isSaving, setIsSaving] = useState(false);
  const set = <K extends keyof ProfileValues>(key: K, value: ProfileValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!values.shopName.trim()) {
      toast.error('Your shop needs a name.');
      return;
    }
    const threshold = Number(values.lowStockThreshold);
    if (!Number.isInteger(threshold) || threshold < 0 || threshold > 10000) {
      toast.error('The low-stock alert must be a whole number from 0 to 10000.');
      return;
    }
    setIsSaving(true);
    try {
      const saved = await updateBusiness({
        shopName: values.shopName.trim(),
        shopDescription: values.shopDescription.trim(),
        shopImage: values.shopImage,
        shopBanner: values.shopBanner,
        lowStockThreshold: threshold,
      });
      setValues(profileFrom(saved));
      toast.success('Shop saved.');
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-8 flex max-w-[720px] flex-col gap-4">
      <SectionTitle>Your shop</SectionTitle>
      <fieldset className="m-0 flex flex-col gap-4 border-0 p-0" disabled={readOnly}>
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
          disabled={isSaving || readOnly}
        />
        <ImageField
          id="shop-banner"
          label="Shop banner"
          value={values.shopBanner}
          onChange={(next) => set('shopBanner', next)}
          aspect="3 / 1"
          helperText="Wide. Sits across the top of your shop page."
          disabled={isSaving || readOnly}
        />
        <Input
          id="low-stock-threshold"
          label="Low-stock alert"
          type="number"
          min={0}
          max={10000}
          inputMode="numeric"
          value={values.lowStockThreshold}
          onChange={(event) => set('lowStockThreshold', event.target.value)}
          helperText="Products with this many or fewer left appear on your overview."
        />
      </fieldset>
      {!readOnly && (
        <div>
          <Button type="submit" size="lg" loading={isSaving}>
            Save shop
          </Button>
        </div>
      )}
    </form>
  );
};

const BankSection: React.FC<{ onSaved: () => void }> = ({ onSaved }) => {
  const [bank, setBank] = useState<BankAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [bankName, setBankName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    getBankAccount()
      .then((row) => {
        if (!alive) return;
        setBank(row);
        setAccountName(row?.accountName ?? '');
        setIfsc(row?.ifsc ?? '');
        setBankName(row?.bankName ?? '');
      })
      .catch((err: Error) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanIfsc = ifsc.trim().toUpperCase();
    const number = accountNumber.replace(/\s+/g, '');
    if (!accountName.trim()) {
      toast.error('Enter the account holder’s name, exactly as the bank has it.');
      return;
    }
    if (!/^\d{9,18}$/.test(number)) {
      toast.error(
        bank
          ? 'Type the full account number again to change the account — between 9 and 18 digits.'
          : 'An Indian bank account number is between 9 and 18 digits.'
      );
      return;
    }
    if (!IFSC_PATTERN.test(cleanIfsc)) {
      toast.error('That does not look like an IFSC code — 11 characters, e.g. HDFC0001234.');
      return;
    }
    setIsSaving(true);
    try {
      const saved = await saveBankAccount({
        accountName: accountName.trim(),
        accountNumber: number,
        ifsc: cleanIfsc,
        bankName: bankName.trim() || undefined,
      });
      setBank(saved);
      setAccountNumber('');
      toast.success('Bank account saved.');
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form id="bank" onSubmit={submit} className="mt-10 flex max-w-[720px] flex-col gap-4 border-t border-line pt-8">
      <div>
        <SectionTitle>Where we pay you</SectionTitle>
        <p className="m-0 mt-2 text-[14px]" style={{ color: 'var(--ink-3)' }}>
          Nothing can be paid out until an account is on file.{' '}
          <Link href="/seller/earnings" className="underline underline-offset-2">
            See what you are owed
          </Link>
          .
        </p>
      </div>
      {loading ? (
        <LoadingSpinner className="min-h-[10vh]" />
      ) : (
        <>
          {error && <p className="alert alert-error text-sm">{error}</p>}
          {bank ? (
            <Notice title={`On file: ${bank.accountNumberMasked}`} tone="plain" className="mt-0">
              {bank.accountName} · {bank.ifsc}
              {bank.bankName ? ` · ${bank.bankName}` : ''}
              {bank.verified ? ' · verified' : ' · not verified yet'}
            </Notice>
          ) : (
            <Notice title="No account on file" className="mt-0">
              Your earnings are still counted and held — they just cannot be paid out yet.
            </Notice>
          )}
          <Input
            id="bank-account-name"
            label="Account holder *"
            value={accountName}
            onChange={(event) => setAccountName(event.target.value)}
            maxLength={120}
            placeholder="Exactly as the bank has it"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="bank-account-number"
              label={bank ? 'Account number (type it again to change)' : 'Account number *'}
              value={accountNumber}
              onChange={(event) => setAccountNumber(event.target.value.replace(/[^\d\s]/g, ''))}
              inputMode="numeric"
              autoComplete="off"
              maxLength={22}
              placeholder={bank ? bank.accountNumberMasked : 'Digits only'}
              helperText="We never show this back to you in full once it is saved."
            />
            <Input
              id="bank-ifsc"
              label="IFSC *"
              value={ifsc}
              onChange={(event) => setIfsc(event.target.value.toUpperCase())}
              maxLength={11}
              autoComplete="off"
              placeholder="HDFC0001234"
            />
          </div>
          <Input
            id="bank-name"
            label="Bank"
            value={bankName}
            onChange={(event) => setBankName(event.target.value)}
            maxLength={120}
            placeholder="HDFC Bank"
          />
          <div>
            <Button type="submit" size="lg" loading={isSaving}>
              {bank ? 'Replace bank account' : 'Save bank account'}
            </Button>
          </div>
        </>
      )}
    </form>
  );
};
