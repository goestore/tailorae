'use client';

import React from 'react';
import toast from 'react-hot-toast';
import { Button, Input } from '@/components/common';
import {
  BUSINESS_TYPE_LABELS,
  updateMyShop,
  type BusinessType,
  type CompanyDetails,
  type MyShop,
} from '@/lib/seller-api';
import { Select } from './fields';

/**
 * The business behind a shop: legal name, constitution, registered address and
 * who to contact. Used by the application form and by Shop settings, so the
 * seller edits exactly what they applied with.
 *
 * Validation mirrors `pickCompanyFields` in the API (utils/vendor.ts); the
 * server has the final say, this only catches the obvious before a round trip.
 */

export const EMPTY_COMPANY: CompanyDetails = {
  legalName: '',
  businessType: '',
  registeredAddress: { line1: '', line2: '', city: '', state: '', pincode: '', country: 'India' },
  contactPhone: '',
  contactEmail: '',
};

/** Prefill from a saved shop, falling back to blanks. */
export const companyFromShop = (shop: MyShop | null): CompanyDetails => ({
  legalName: shop?.legalName ?? '',
  businessType: shop?.businessType ?? '',
  registeredAddress: { ...EMPTY_COMPANY.registeredAddress, ...(shop?.registeredAddress ?? {}) },
  contactPhone: shop?.contactPhone ?? '',
  contactEmail: shop?.contactEmail ?? '',
});

/** The first problem with the details, or null when they look complete. */
export function companyProblem(company: CompanyDetails): string | null {
  const a = company.registeredAddress;
  if (company.legalName.trim().length < 2) return 'Enter the legal name of the business.';
  if (!company.businessType) return 'Choose the type of business.';
  if (!a.line1.trim() || !a.city.trim() || !a.state.trim()) {
    return 'Enter the registered address: street, city and state.';
  }
  if (!/^[1-9]\d{5}$/.test(a.pincode.trim())) return 'Enter a 6-digit pincode.';
  const phone = company.contactPhone.replace(/[\s()-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, '');
  if (!/^[6-9]\d{9}$/.test(phone)) return 'Enter a 10-digit Indian mobile number.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(company.contactEmail.trim())) {
    return 'Enter a contact email address.';
  }
  return null;
}

/** What the API takes, trimmed. */
export const companyPayload = (company: CompanyDetails) => ({
  legalName: company.legalName.trim(),
  businessType: company.businessType as BusinessType,
  registeredAddress: {
    line1: company.registeredAddress.line1.trim(),
    line2: company.registeredAddress.line2?.trim() || undefined,
    city: company.registeredAddress.city.trim(),
    state: company.registeredAddress.state.trim(),
    pincode: company.registeredAddress.pincode.trim(),
    country: company.registeredAddress.country.trim() || 'India',
  },
  contactPhone: company.contactPhone.trim(),
  contactEmail: company.contactEmail.trim(),
});

export const CompanyFields: React.FC<{
  value: CompanyDetails;
  onChange: (next: CompanyDetails) => void;
}> = ({ value, onChange }) => {
  const set = <K extends keyof CompanyDetails>(key: K, next: CompanyDetails[K]) =>
    onChange({ ...value, [key]: next });
  const setAddress = (key: keyof CompanyDetails['registeredAddress'], next: string) =>
    onChange({ ...value, registeredAddress: { ...value.registeredAddress, [key]: next } });

  return (
    <div className="flex flex-col gap-4">
      <Input
        label="Legal name of the business *"
        value={value.legalName}
        onChange={(event) => set('legalName', event.target.value)}
        maxLength={160}
        autoComplete="organization"
        helperText="As it appears on your PAN or GST registration — it can differ from your shop name."
      />
      <Select
        id="company-type"
        label="Type of business *"
        value={value.businessType}
        onChange={(event) => set('businessType', event.target.value as BusinessType | '')}
      >
        <option value="">Choose one</option>
        {(Object.keys(BUSINESS_TYPE_LABELS) as BusinessType[]).map((type) => (
          <option key={type} value={type}>
            {BUSINESS_TYPE_LABELS[type]}
          </option>
        ))}
      </Select>

      <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
        <legend className="mb-1 text-sm font-medium text-black">Registered address *</legend>
        <Input
          aria-label="Address line 1"
          placeholder="Building, street"
          value={value.registeredAddress.line1}
          onChange={(event) => setAddress('line1', event.target.value)}
          autoComplete="address-line1"
        />
        <Input
          aria-label="Address line 2"
          placeholder="Area, landmark (optional)"
          value={value.registeredAddress.line2 ?? ''}
          onChange={(event) => setAddress('line2', event.target.value)}
          autoComplete="address-line2"
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input
            aria-label="City"
            placeholder="City"
            value={value.registeredAddress.city}
            onChange={(event) => setAddress('city', event.target.value)}
            autoComplete="address-level2"
          />
          <Input
            aria-label="State"
            placeholder="State"
            value={value.registeredAddress.state}
            onChange={(event) => setAddress('state', event.target.value)}
            autoComplete="address-level1"
          />
          <Input
            aria-label="Pincode"
            placeholder="Pincode"
            inputMode="numeric"
            maxLength={6}
            value={value.registeredAddress.pincode}
            onChange={(event) => setAddress('pincode', event.target.value.replace(/\D/g, ''))}
            autoComplete="postal-code"
          />
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Contact phone *"
          type="tel"
          inputMode="tel"
          value={value.contactPhone}
          onChange={(event) => set('contactPhone', event.target.value)}
          placeholder="98765 43210"
          autoComplete="tel-national"
        />
        <Input
          label="Contact email *"
          type="email"
          value={value.contactEmail}
          onChange={(event) => set('contactEmail', event.target.value)}
          placeholder="orders@yourbusiness.in"
          autoComplete="email"
        />
      </div>
    </div>
  );
};

/**
 * Business details as their own form on Shop settings, saved separately from
 * the shop and bank form. Editing them after approval does not send the shop
 * back for review; a rejected seller corrects them here before asking to be
 * reconsidered.
 */
export const BusinessDetailsSection: React.FC<{
  shop: MyShop;
  onSaved: (shop: MyShop) => void;
}> = ({ shop, onSaved }) => {
  const [company, setCompany] = React.useState<CompanyDetails>(() => companyFromShop(shop));
  const [isSaving, setIsSaving] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const problem = companyProblem(company);
    if (problem) {
      toast.error(problem);
      return;
    }
    setIsSaving(true);
    try {
      const saved = await updateMyShop(companyPayload(company));
      onSaved(saved);
      toast.success('Business details saved.');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="mt-10 flex max-w-[720px] flex-col gap-4 border-t border-line pt-8"
    >
      <div>
        <h2
          className="m-0 text-ink"
          style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-0.01em' }}
        >
          Business details
        </h2>
        <p className="m-0 mt-2 text-[14px]" style={{ color: 'var(--ink-3)' }}>
          The business behind your shop, as you applied with it. Shoppers do not see these.
        </p>
      </div>
      <CompanyFields value={company} onChange={setCompany} />
      <div>
        <Button type="submit" size="lg" loading={isSaving}>
          Save business details
        </Button>
      </div>
    </form>
  );
};
