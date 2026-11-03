'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { Breadcrumbs, Button, Card, Input, LoadingSpinner } from '@/components/common';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';
import { RootState } from '@/store';
import { Address } from '@/types';

interface AddressForm {
  type: string;
  fullName: string;
  phoneNumber: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  gstNumber: string;
  isDefault: boolean;
}

const EMPTY_FORM: AddressForm = {
  type: 'home',
  fullName: '',
  phoneNumber: '',
  email: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'India',
  gstNumber: '',
  isDefault: false,
};

// Mirrors the server-side required list in `parseAddressInput`, so the form
// fails locally with a field-level message instead of a single joined string
// coming back from the API.
const REQUIRED: Array<{ key: keyof AddressForm; label: string }> = [
  { key: 'fullName', label: 'Full name' },
  { key: 'phoneNumber', label: 'Phone number' },
  { key: 'addressLine1', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'postalCode', label: 'PIN code' },
  { key: 'country', label: 'Country' },
];

const toForm = (address: Address): AddressForm => ({
  type: address.type || 'home',
  fullName: address.fullName,
  phoneNumber: address.phoneNumber,
  email: address.email ?? '',
  addressLine1: address.addressLine1,
  addressLine2: address.addressLine2 ?? '',
  city: address.city,
  state: address.state,
  postalCode: address.postalCode,
  country: address.country,
  gstNumber: '',
  isDefault: address.isDefault,
});

export default function AddressBookPage() {
  const router = useRouter();
  const { user, isInitialized } = useSelector((state: RootState) => state.auth);

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState<AddressForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof AddressForm, string>>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isInitialized && !user) {
      router.replace('/auth/login?redirect=/dashboard/addresses');
    }
  }, [isInitialized, user, router]);

  // Nothing is set synchronously here: the effect below only starts the fetch,
  // and every setState lands in a callback once it resolves.
  const load = useCallback(
    () =>
      apiClient
        .get('/users/addresses')
        .then((res) => setAddresses(res.data?.data?.addresses ?? []))
        .catch((err) => toast.error(getApiErrorMessage(err, 'Could not load your addresses.')))
        .finally(() => setIsLoading(false)),
    []
  );

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const setField = <K extends keyof AddressForm>(key: K, value: AddressForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const startAdd = () => {
    setForm({ ...EMPTY_FORM, fullName: user ? `${user.firstName} ${user.lastName}`.trim() : '' });
    setErrors({});
    setEditingId(null);
    setIsAdding(true);
  };

  const startEdit = (address: Address) => {
    setForm(toForm(address));
    setErrors({});
    setIsAdding(false);
    setEditingId(address.id);
  };

  const cancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setErrors({});
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof AddressForm, string>> = {};
    REQUIRED.forEach(({ key, label }) => {
      if (!String(form[key]).trim()) next[key] = `${label} is required`;
    });
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = 'Enter a valid email address';
    }
    if (form.postalCode.trim() && !/^\d{6}$/.test(form.postalCode.trim())) {
      next.postalCode = 'Enter a 6-digit PIN code';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;

    setIsSaving(true);
    const payload = {
      type: form.type,
      fullName: form.fullName.trim(),
      phoneNumber: form.phoneNumber.trim(),
      ...(form.email.trim() ? { email: form.email.trim() } : {}),
      addressLine1: form.addressLine1.trim(),
      ...(form.addressLine2.trim() ? { addressLine2: form.addressLine2.trim() } : {}),
      city: form.city.trim(),
      state: form.state.trim(),
      postalCode: form.postalCode.trim(),
      country: form.country.trim(),
      ...(form.gstNumber.trim() ? { gstNumber: form.gstNumber.trim() } : {}),
      isDefault: form.isDefault,
    };

    try {
      if (editingId) {
        await apiClient.put(`/users/addresses/${editingId}`, payload);
        toast.success('Address updated');
      } else {
        await apiClient.post('/users/addresses', payload);
        toast.success('Address saved');
      }
      cancel();
      load();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not save that address.'));
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (address: Address) => {
    try {
      await apiClient.delete(`/users/addresses/${address.id}`);
      setAddresses((current) => current.filter((item) => item.id !== address.id));
      toast.success('Address removed');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not remove that address.'));
    }
  };

  const makeDefault = async (address: Address) => {
    try {
      await apiClient.put(`/users/addresses/${address.id}`, { ...toForm(address), isDefault: true });
      load();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not set that as your default.'));
    }
  };

  if (!isInitialized || (user && isLoading)) {
    return <LoadingSpinner className="min-h-[50vh]" size="lg" />;
  }
  if (!user) return null;

  const isFormOpen = isAdding || editingId !== null;

  return (
    <main className="section-y">
      <div className="container-max">
        <div className="mx-auto" style={{ maxWidth: '900px' }}>
          <Breadcrumbs
            items={[
              { label: 'Home', href: '/' },
              { label: 'My Account', href: '/dashboard' },
              { label: 'Addresses' },
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
                Address book
              </h1>
              <p className="mt-2 text-[14px]" style={{ color: 'var(--ink-3)' }}>
                Saved addresses are offered at checkout so you do not retype them.
              </p>
            </div>
            {!isFormOpen && <Button onClick={startAdd}>Add an address</Button>}
          </header>

          {isFormOpen && (
            <form onSubmit={save} className="mt-8 border border-line p-5 md:p-6">
              <h2 className="m-0 text-ink" style={{ fontSize: '18px', fontWeight: 600 }}>
                {editingId ? 'Edit address' : 'New address'}
              </h2>

              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input
                  label="Full name *"
                  value={form.fullName}
                  onChange={(event) => setField('fullName', event.target.value)}
                  error={errors.fullName}
                />
                <Input
                  label="Phone number *"
                  value={form.phoneNumber}
                  onChange={(event) => setField('phoneNumber', event.target.value)}
                  error={errors.phoneNumber}
                />
                <Input
                  label="Email"
                  type="email"
                  value={form.email}
                  onChange={(event) => setField('email', event.target.value)}
                  error={errors.email}
                  helperText="Used for delivery updates on orders sent here."
                />
                <div className="space-y-1">
                  <label htmlFor="address-type" className="block text-sm font-medium text-black">
                    Address type
                  </label>
                  <select
                    id="address-type"
                    value={form.type}
                    onChange={(event) => setField('type', event.target.value)}
                    className="block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-black focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="home">Home</option>
                    <option value="office">Office</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <Input
                    label="Address line 1 *"
                    value={form.addressLine1}
                    onChange={(event) => setField('addressLine1', event.target.value)}
                    error={errors.addressLine1}
                    placeholder="Flat, building, street"
                  />
                </div>
                <div className="md:col-span-2">
                  <Input
                    label="Address line 2"
                    value={form.addressLine2}
                    onChange={(event) => setField('addressLine2', event.target.value)}
                    placeholder="Area, landmark"
                  />
                </div>
                <Input
                  label="City *"
                  value={form.city}
                  onChange={(event) => setField('city', event.target.value)}
                  error={errors.city}
                />
                <Input
                  label="State *"
                  value={form.state}
                  onChange={(event) => setField('state', event.target.value)}
                  error={errors.state}
                />
                <Input
                  label="PIN code *"
                  inputMode="numeric"
                  maxLength={6}
                  value={form.postalCode}
                  onChange={(event) => setField('postalCode', event.target.value.replace(/\D/g, ''))}
                  error={errors.postalCode}
                />
                <Input
                  label="Country *"
                  value={form.country}
                  onChange={(event) => setField('country', event.target.value)}
                  error={errors.country}
                />
                <div className="md:col-span-2">
                  <Input
                    label="GSTIN (business orders)"
                    value={form.gstNumber}
                    onChange={(event) => setField('gstNumber', event.target.value.toUpperCase())}
                    helperText="Only needed if you want the invoice raised against a business."
                  />
                </div>
              </div>

              <label className="mt-5 flex items-center gap-2 text-[14px] text-ink">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(event) => setField('isDefault', event.target.checked)}
                />
                Use this as my default address
              </label>

              <div className="mt-6 flex flex-wrap gap-2">
                <Button type="submit" loading={isSaving}>
                  {editingId ? 'Save changes' : 'Save address'}
                </Button>
                <Button type="button" variant="ghost" onClick={cancel}>
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {addresses.length === 0 && !isFormOpen ? (
            <Card className="mt-8 p-10 text-center">
              <p className="m-0 text-lg text-ink">No addresses saved yet</p>
              <p className="mx-auto mt-2 max-w-[44ch] text-[14px]" style={{ color: 'var(--ink-3)' }}>
                Add one here, or let checkout save the first address you use.
              </p>
              <Button className="mt-6" onClick={startAdd}>
                Add an address
              </Button>
            </Card>
          ) : (
            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
              {addresses.map((address) => (
                <div key={address.id} className="flex flex-col border border-line p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className="text-[10.5px] font-bold uppercase tracking-[0.12em]"
                      style={{ color: 'var(--ink-3)' }}
                    >
                      {address.type}
                    </span>
                    {address.isDefault && (
                      <span
                        className="text-[10.5px] font-bold uppercase tracking-[0.1em]"
                        style={{ color: 'var(--brand-700)' }}
                      >
                        Default
                      </span>
                    )}
                  </div>

                  <address className="m-0 mt-3 flex-1 text-[14px] not-italic" style={{ color: 'var(--ink-2)', lineHeight: 1.65 }}>
                    <span className="font-semibold text-ink">{address.fullName}</span>
                    <br />
                    {address.addressLine1}
                    {address.addressLine2 ? (
                      <>
                        <br />
                        {address.addressLine2}
                      </>
                    ) : null}
                    <br />
                    {address.city}, {address.state} {address.postalCode}
                    <br />
                    {address.country}
                    <br />
                    {address.phoneNumber}
                  </address>

                  <div className="mt-4 flex flex-wrap gap-3 text-[13px]">
                    <button
                      type="button"
                      onClick={() => startEdit(address)}
                      className="underline underline-offset-2 hover:text-ink"
                      style={{ color: 'var(--ink-3)' }}
                    >
                      Edit
                    </button>
                    {!address.isDefault && (
                      <button
                        type="button"
                        onClick={() => makeDefault(address)}
                        className="underline underline-offset-2 hover:text-ink"
                        style={{ color: 'var(--ink-3)' }}
                      >
                        Make default
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => remove(address)}
                      className="underline underline-offset-2"
                      style={{ color: 'var(--sale)' }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="mt-8 text-[13px]" style={{ color: 'var(--ink-3)' }}>
            <Link href="/dashboard" className="underline underline-offset-2 hover:text-ink">
              Back to My Account
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
