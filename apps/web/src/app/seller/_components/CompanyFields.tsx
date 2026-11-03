'use client';

import React from 'react';
import toast from 'react-hot-toast';
import { Button, Input } from '@/components/common';
import {
  BUSINESS_TYPE_LABELS,
  EDITABLE_STATUSES,
  updateBusiness,
  type BusinessType,
  type CreateBusinessInput,
  type PostalAddress,
  type Shop,
} from '@/lib/seller-api';
import { Select } from './fields';

/**
 * The business behind a shop: legal name, constitution, PAN/GSTIN, the
 * registered and pickup addresses and who to contact (`POST/PUT
 * /seller/business`). The overview's "create your business" step and Shop
 * settings both use these fields, so the seller edits exactly what they
 * applied with.
 *
 * The checks mirror the API's (`Kyc.validate`, the request's bean validation);
 * the server has the final say, this only catches the obvious before a round
 * trip.
 */

export interface AddressForm {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
}

export interface BusinessForm {
  legalName: string;
  businessType: BusinessType | '';
  pan: string;
  gstin: string;
  registered: AddressForm;
  /** Pickup is usually the registered address; one tick saves typing it twice. */
  pickupSame: boolean;
  pickup: AddressForm;
  contactPhone: string;
  contactEmail: string;
}

const EMPTY_ADDRESS: AddressForm = { line1: '', line2: '', city: '', state: '', postalCode: '' };

export const EMPTY_BUSINESS: BusinessForm = {
  legalName: '',
  businessType: '',
  pan: '',
  gstin: '',
  registered: EMPTY_ADDRESS,
  pickupSame: true,
  pickup: EMPTY_ADDRESS,
  contactPhone: '',
  contactEmail: '',
};

const addressForm = (a: PostalAddress | null | undefined): AddressForm => ({
  line1: a?.line1 ?? '',
  line2: a?.line2 ?? '',
  city: a?.city ?? '',
  state: a?.state ?? '',
  postalCode: a?.postalCode ?? '',
});

const sameAddress = (a: AddressForm, b: AddressForm) =>
  (Object.keys(a) as Array<keyof AddressForm>).every((k) => a[k].trim() === b[k].trim());

/** Prefill from a saved shop. */
export function businessFromShop(shop: Shop): BusinessForm {
  const registered = addressForm(shop.registeredAddress);
  const pickup = addressForm(shop.pickupAddress);
  return {
    legalName: shop.legalName ?? '',
    businessType: shop.businessType ?? '',
    pan: shop.pan ?? '',
    gstin: shop.gstin ?? '',
    registered,
    pickupSame: !shop.pickupAddress || sameAddress(registered, pickup),
    pickup,
    contactPhone: shop.contactPhone ?? '',
    contactEmail: shop.contactEmail ?? '',
  };
}

const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const BASE36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** The GSTIN check character (the same sum the API runs). */
function gstinChecksumOk(gstin: string): boolean {
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const product = BASE36.indexOf(gstin[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return BASE36[(36 - (sum % 36)) % 36] === gstin[14];
}

export const cleanId = (value: string): string => value.replace(/\s+/g, '').toUpperCase();

/** The first problem with a PAN/GSTIN pair, or null. An empty PAN is allowed until submission. */
export function taxIdProblem(panRaw: string, gstinRaw: string): string | null {
  const pan = cleanId(panRaw);
  const gstin = cleanId(gstinRaw);
  if (pan && !PAN_PATTERN.test(pan)) return 'A PAN is 10 characters, like ABCDE1234F.';
  if (gstin) {
    if (!GSTIN_PATTERN.test(gstin) || !gstinChecksumOk(gstin)) return 'That GSTIN is not valid — check it against your certificate.';
    if (pan && gstin.slice(2, 12) !== pan) return 'The GSTIN must belong to the same PAN.';
  }
  return null;
}

function addressProblem(label: string, a: AddressForm): string | null {
  if (!a.line1.trim() || !a.city.trim() || !a.state.trim()) return `Enter the ${label}: street, city and state.`;
  if (!/^[1-9]\d{5}$/.test(a.postalCode.trim())) return `Enter a 6-digit PIN code for the ${label}.`;
  return null;
}

/** The first problem with the details, or null when they look complete. */
export function businessProblem(form: BusinessForm): string | null {
  if (form.legalName.trim().length < 2) return 'Enter the legal name of the business.';
  if (!form.businessType) return 'Choose the type of business.';
  const tax = taxIdProblem(form.pan, form.gstin);
  if (tax) return tax;
  const registered = addressProblem('registered address', form.registered);
  if (registered) return registered;
  if (!form.pickupSame) {
    const pickup = addressProblem('pickup address', form.pickup);
    if (pickup) return pickup;
  }
  if (!/^\+?[0-9 ]{10,16}$/.test(form.contactPhone.trim())) return 'Enter a contact phone number (10 digits).';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail.trim())) return 'Enter a contact email address.';
  return null;
}

const postal = (a: AddressForm): PostalAddress => ({
  line1: a.line1.trim(),
  line2: a.line2.trim() || undefined,
  city: a.city.trim(),
  state: a.state.trim(),
  postalCode: a.postalCode.trim(),
  country: 'IN',
});

/** What `POST /seller/business` takes, minus the shop's own name and description. */
export function businessPayload(form: BusinessForm): Omit<CreateBusinessInput, 'shopName' | 'shopDescription'> {
  const registered = postal(form.registered);
  return {
    legalName: form.legalName.trim(),
    businessType: form.businessType as BusinessType,
    pan: cleanId(form.pan) || undefined,
    gstin: cleanId(form.gstin) || undefined,
    registeredAddress: registered,
    pickupAddress: form.pickupSame ? registered : postal(form.pickup),
    contactPhone: form.contactPhone.trim(),
    contactEmail: form.contactEmail.trim(),
  };
}

const AddressFields: React.FC<{
  legend: string;
  prefix: string;
  value: AddressForm;
  onChange: (next: AddressForm) => void;
  disabled?: boolean;
}> = ({ legend, prefix, value, onChange, disabled }) => {
  const set = (key: keyof AddressForm, next: string) => onChange({ ...value, [key]: next });
  return (
    <fieldset className="m-0 flex flex-col gap-3 border-0 p-0" disabled={disabled}>
      <legend className="mb-1 text-sm font-medium text-black">{legend}</legend>
      <Input
        aria-label={`${legend}: line 1`}
        id={`${prefix}-line1`}
        placeholder="Building, street"
        value={value.line1}
        onChange={(event) => set('line1', event.target.value)}
        autoComplete="address-line1"
      />
      <Input
        aria-label={`${legend}: line 2`}
        id={`${prefix}-line2`}
        placeholder="Area, landmark (optional)"
        value={value.line2}
        onChange={(event) => set('line2', event.target.value)}
        autoComplete="address-line2"
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input
          aria-label={`${legend}: city`}
          id={`${prefix}-city`}
          placeholder="City"
          value={value.city}
          onChange={(event) => set('city', event.target.value)}
          autoComplete="address-level2"
        />
        <Input
          aria-label={`${legend}: state`}
          id={`${prefix}-state`}
          placeholder="State"
          value={value.state}
          onChange={(event) => set('state', event.target.value)}
          autoComplete="address-level1"
        />
        <Input
          aria-label={`${legend}: PIN code`}
          id={`${prefix}-pin`}
          placeholder="PIN code"
          inputMode="numeric"
          maxLength={6}
          value={value.postalCode}
          onChange={(event) => set('postalCode', event.target.value.replace(/\D/g, ''))}
          autoComplete="postal-code"
        />
      </div>
    </fieldset>
  );
};

/**
 * The legal and contact fields. `lockLegal` greys out what the API refuses to
 * change while an application is being reviewed or once it is decided
 * (legal name, type, PAN/GSTIN, registered address).
 */
export const BusinessFields: React.FC<{
  value: BusinessForm;
  onChange: (next: BusinessForm) => void;
  lockLegal?: boolean;
}> = ({ value, onChange, lockLegal }) => {
  const set = <K extends keyof BusinessForm>(key: K, next: BusinessForm[K]) => onChange({ ...value, [key]: next });

  return (
    <div className="flex flex-col gap-4">
      <Input
        id="business-legal-name"
        label="Legal name of the business *"
        value={value.legalName}
        onChange={(event) => set('legalName', event.target.value)}
        maxLength={160}
        autoComplete="organization"
        disabled={lockLegal}
        helperText="As it appears on your PAN or GST registration — it can differ from your shop name."
      />
      <Select
        id="business-type"
        label="Type of business *"
        value={value.businessType}
        disabled={lockLegal}
        onChange={(event) => set('businessType', event.target.value as BusinessType | '')}
      >
        <option value="">Choose one</option>
        {(Object.keys(BUSINESS_TYPE_LABELS) as BusinessType[]).map((type) => (
          <option key={type} value={type}>
            {BUSINESS_TYPE_LABELS[type]}
          </option>
        ))}
      </Select>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          id="business-pan"
          label="PAN"
          value={value.pan}
          onChange={(event) => set('pan', cleanId(event.target.value))}
          maxLength={10}
          autoComplete="off"
          placeholder="ABCDE1234F"
          disabled={lockLegal}
          helperText="The business's PAN (your own, for an individual). Needed before you submit."
        />
        <Input
          id="business-gstin"
          label="GSTIN"
          value={value.gstin}
          onChange={(event) => set('gstin', cleanId(event.target.value))}
          maxLength={15}
          autoComplete="off"
          placeholder="Only if you are registered"
          disabled={lockLegal}
          helperText="If you add one, you will also upload the GST certificate."
        />
      </div>

      <AddressFields
        legend="Registered address *"
        prefix="business-registered"
        value={value.registered}
        onChange={(next) => set('registered', next)}
        disabled={lockLegal}
      />

      <label className="flex items-center gap-2 text-[14px] text-ink">
        <input
          type="checkbox"
          checked={value.pickupSame}
          onChange={(event) => set('pickupSame', event.target.checked)}
        />
        Couriers collect parcels from this address
      </label>
      {!value.pickupSame && (
        <AddressFields
          legend="Pickup address *"
          prefix="business-pickup"
          value={value.pickup}
          onChange={(next) => set('pickup', next)}
        />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          id="business-phone"
          label="Contact phone *"
          type="tel"
          inputMode="tel"
          value={value.contactPhone}
          onChange={(event) => set('contactPhone', event.target.value)}
          placeholder="98765 43210"
          autoComplete="tel-national"
        />
        <Input
          id="business-email"
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
 * Business details as their own form on Shop settings. While the application
 * is a draft or sent back for changes everything is editable; after that only
 * the pickup address and contact details are, as the API enforces.
 */
export const BusinessDetailsSection: React.FC<{
  shop: Shop;
  onSaved: (shop: Shop) => void;
}> = ({ shop, onSaved }) => {
  const [form, setForm] = React.useState<BusinessForm>(() => businessFromShop(shop));
  const [isSaving, setIsSaving] = React.useState(false);
  const lockLegal = !EDITABLE_STATUSES.includes(shop.status);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const problem = businessProblem(form);
    if (problem) {
      toast.error(problem);
      return;
    }
    const payload = businessPayload(form);
    setIsSaving(true);
    try {
      const saved = await updateBusiness(
        lockLegal
          ? {
              pickupAddress: payload.pickupAddress,
              contactPhone: payload.contactPhone,
              contactEmail: payload.contactEmail,
            }
          : payload
      );
      onSaved(saved);
      toast.success('Business details saved.');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-10 flex max-w-[720px] flex-col gap-4 border-t border-line pt-8">
      <div>
        <h2 className="m-0 text-ink" style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-0.01em' }}>
          Business details
        </h2>
        <p className="m-0 mt-2 text-[14px]" style={{ color: 'var(--ink-3)' }}>
          {lockLegal
            ? 'The legal details are locked while your application is reviewed and once it is decided. Contact us to change them; the pickup address and contact details stay yours to edit.'
            : 'The business behind your shop. Shoppers do not see these.'}
        </p>
      </div>
      <BusinessFields value={form} onChange={setForm} lockLegal={lockLegal} />
      <div>
        <Button type="submit" size="lg" loading={isSaving}>
          Save business details
        </Button>
      </div>
    </form>
  );
};
