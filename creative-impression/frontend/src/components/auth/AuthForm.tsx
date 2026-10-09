'use client';

import React from 'react';
import { Button } from '@/components/common';

export interface AuthField {
  name: string;
  label: string;
  type: 'text' | 'email' | 'password' | 'tel';
  placeholder: string;
  required?: boolean;
  /** Passed straight through, so a password manager knows what it is filling. */
  autoComplete?: string;
  /** Shortest value the API will accept, checked here so a round trip is not wasted. */
  minLength?: number;
  /** The confirm-password pairing: this field has to equal the named one. */
  matches?: { field: string; message: string };
  /** Standing hint, replaced by the error message once there is one. */
  helpText?: string;
}

export interface AuthFormProps {
  onSubmit: (data: Record<string, string>) => Promise<void>;
  fields: AuthField[];
  submitButtonText?: string;
  isLoading?: boolean;
  /** Whole-form failure from the server, e.g. "Invalid email or password". */
  error?: string;
  /** Rendered between the fields and the button — the forgot-password link. */
  aside?: React.ReactNode;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate every field at once rather than stopping at the first failure, so a
 * form with two problems reports both instead of making the reader fix one,
 * submit, and be told about the next.
 */
const validate = (
  fields: AuthField[],
  values: Record<string, string>
): Record<string, string> => {
  const errors: Record<string, string> = {};

  fields.forEach((field) => {
    const value = values[field.name] ?? '';

    if (field.required && !value.trim()) {
      errors[field.name] = `${field.label} is required`;
      return;
    }
    if (!value) return;

    if (field.type === 'email' && !EMAIL_PATTERN.test(value.trim())) {
      errors[field.name] = 'Enter a valid email address';
      return;
    }
    if (field.minLength && value.length < field.minLength) {
      errors[field.name] = `Use at least ${field.minLength} characters`;
      return;
    }
    if (field.matches && value !== (values[field.matches.field] ?? '')) {
      errors[field.name] = field.matches.message;
    }
  });

  return errors;
};

/**
 * The shared sign-in / registration / password-reset form.
 *
 * Styled from the design tokens rather than Tailwind's stock greys so the auth
 * pages read as the same shop as the rest of the site, and validated here so a
 * mistyped password is caught before the network sees it.
 */
export const AuthForm: React.FC<AuthFormProps> = ({
  onSubmit,
  fields,
  submitButtonText = 'Submit',
  isLoading = false,
  error,
  aside,
}) => {
  const [formData, setFormData] = React.useState<Record<string, string>>(
    fields.reduce((acc, field) => ({ ...acc, [field.name]: '' }), {})
  );
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  // Which password fields are currently in plain text, keyed by field name so
  // revealing the password does not also reveal the confirmation.
  const [revealed, setRevealed] = React.useState<Record<string, boolean>>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear the message as soon as the reader starts fixing it; keeping it up
    // while they type reads as though the correction were being rejected.
    setFieldErrors((prev) => (prev[name] ? { ...prev, [name]: '' } : prev));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validate(fields, formData);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    await onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {error && (
        <p
          role="alert"
          className="m-0 border px-4 py-3 text-[13.5px]"
          style={{ borderColor: 'var(--sale)', color: 'var(--sale)', background: '#fef2f2' }}
        >
          {error}
        </p>
      )}

      {fields.map((field) => {
        const fieldId = `auth-${field.name}`;
        const message = fieldErrors[field.name];
        const isPassword = field.type === 'password';
        const isRevealed = Boolean(revealed[field.name]);

        return (
          <div key={field.name} className="flex flex-col gap-1.5">
            <label
              htmlFor={fieldId}
              className="text-[11px] font-bold uppercase tracking-[0.12em]"
              style={{ color: 'var(--ink-3)' }}
            >
              {field.label}
            </label>

            <div className="relative">
              <input
                id={fieldId}
                name={field.name}
                type={isPassword && isRevealed ? 'text' : field.type}
                placeholder={field.placeholder}
                value={formData[field.name] ?? ''}
                onChange={handleChange}
                required={field.required}
                autoComplete={field.autoComplete}
                aria-invalid={message ? true : undefined}
                aria-describedby={message ? `${fieldId}-error` : undefined}
                className={`w-full bg-surface px-3 py-2.5 text-[14px] text-ink placeholder:text-[var(--ink-3)] ${
                  isPassword ? 'pr-[72px]' : ''
                }`}
                style={{ borderColor: message ? 'var(--sale)' : 'var(--border-strong)' }}
              />
              {isPassword && (
                <button
                  type="button"
                  onClick={() =>
                    setRevealed((prev) => ({ ...prev, [field.name]: !prev[field.name] }))
                  }
                  aria-pressed={isRevealed}
                  aria-label={isRevealed ? `Hide ${field.label}` : `Show ${field.label}`}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[10.5px] font-bold uppercase tracking-[0.1em] transition-colors hover:text-ink"
                  style={{ color: 'var(--ink-3)' }}
                >
                  {isRevealed ? 'Hide' : 'Show'}
                </button>
              )}
            </div>

            {message ? (
              <p id={`${fieldId}-error`} className="m-0 text-[12.5px]" style={{ color: 'var(--sale)' }}>
                {message}
              </p>
            ) : field.helpText ? (
              <p className="m-0 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
                {field.helpText}
              </p>
            ) : null}
          </div>
        );
      })}

      {aside}

      <Button type="submit" fullWidth variant="primary" size="lg" loading={isLoading}>
        {submitButtonText}
      </Button>
    </form>
  );
};
