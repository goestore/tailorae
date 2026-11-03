'use client';

import React from 'react';

/**
 * The form controls the seller area needs that `@/components/common` does not
 * ship.
 *
 * `Input` covers single-line fields; a textarea and a select had been pasted
 * inline wherever one was wanted, which is how two forms in the same area end
 * up looking subtly different. The markup here is `Input`'s, field for field,
 * so a seller filling in their bank details and a seller writing a product
 * description are looking at the same control.
 *
 * A private folder (`_components`) rather than a shared one: these exist to
 * keep the seller pages consistent with the storefront, not to become a second
 * design system competing with it.
 */

export const CONTROL_CLASS =
  'block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-black placeholder-neutral-500 transition-colors focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';

const LABEL_CLASS = 'block text-sm font-medium text-black';

interface FieldShellProps {
  id: string;
  label?: string;
  helperText?: string;
  children: React.ReactNode;
}

const FieldShell: React.FC<FieldShellProps> = ({ id, label, helperText, children }) => (
  <div className="space-y-1">
    {label && (
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
    )}
    {children}
    {helperText && <p className="text-sm text-neutral-500">{helperText}</p>}
  </div>
);

export interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  id: string;
  label?: string;
  helperText?: string;
}

export const TextArea: React.FC<TextAreaProps> = ({
  id,
  label,
  helperText,
  className,
  ...props
}) => (
  <FieldShell id={id} label={label} helperText={helperText}>
    <textarea id={id} className={[CONTROL_CLASS, className].filter(Boolean).join(' ')} {...props} />
  </FieldShell>
);

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  id: string;
  label?: string;
  helperText?: string;
}

export const Select: React.FC<SelectProps> = ({
  id,
  label,
  helperText,
  className,
  children,
  ...props
}) => (
  <FieldShell id={id} label={label} helperText={helperText}>
    <select id={id} className={[CONTROL_CLASS, className].filter(Boolean).join(' ')} {...props}>
      {children}
    </select>
  </FieldShell>
);
