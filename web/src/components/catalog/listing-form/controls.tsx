'use client';

import React, { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';

/**
 * Form controls for the listing form.
 *
 * They read only shared tokens (--ink*, --surface*, --border, --brand), which
 * the admin shell re-points to its dark palette, so one control looks native
 * in both the storefront seller area and the admin console.
 */

/** Ids of fields the go-live check says are empty, once the user has asked. */
export const MissingContext = createContext<Set<string>>(new Set());

const useMissing = (id: string) => useContext(MissingContext).has(id);

export const RequiredMark: React.FC = () => <span className="lf-req">Required</span>;

interface FieldShellProps {
  id: string;
  label: React.ReactNode;
  required?: boolean;
  hint?: React.ReactNode;
  wide?: boolean;
  children: (aria: {
    'aria-invalid'?: boolean;
    'aria-describedby'?: string;
    'aria-required'?: boolean;
  }) => React.ReactNode;
}

export const FieldShell: React.FC<FieldShellProps> = ({
  id,
  label,
  required,
  hint,
  wide,
  children,
}) => {
  const missing = useMissing(id);
  const described = [hint ? `${id}-hint` : '', missing ? `${id}-missing` : '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={`lf-field${wide ? ' lf-field--wide' : ''}`} data-missing={missing || undefined}>
      <label htmlFor={id} className="lf-label">
        <span>{label}</span>
        {required && <RequiredMark />}
      </label>
      {children({
        'aria-invalid': missing || undefined,
        'aria-describedby': described || undefined,
        'aria-required': required || undefined,
      })}
      {hint && (
        <p id={`${id}-hint`} className="lf-hint">
          {hint}
        </p>
      )}
      {missing && (
        <p id={`${id}-missing`} className="lf-missing-msg">
          Needed to go live
        </p>
      )}
    </div>
  );
};

interface TextFieldProps {
  id: string;
  label: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  hint?: React.ReactNode;
  wide?: boolean;
  type?: 'text' | 'number' | 'date' | 'url';
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  mono?: boolean;
  min?: number;
  step?: number | string;
  maxLength?: number;
  onBlur?: () => void;
}

export const TextField: React.FC<TextFieldProps> = ({
  id,
  label,
  value,
  onChange,
  required,
  hint,
  wide,
  type = 'text',
  placeholder,
  inputMode,
  mono,
  min,
  step,
  maxLength,
  onBlur,
}) => (
  <FieldShell id={id} label={label} required={required} hint={hint} wide={wide}>
    {(aria) => (
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        min={min}
        step={step}
        maxLength={maxLength}
        className={`lf-input${mono ? ' lf-mono' : ''}`}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        {...aria}
      />
    )}
  </FieldShell>
);

interface AreaFieldProps {
  id: string;
  label: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  hint?: React.ReactNode;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
}

export const AreaField: React.FC<AreaFieldProps> = ({
  id,
  label,
  value,
  onChange,
  required,
  hint,
  rows = 3,
  maxLength,
  placeholder,
}) => (
  <FieldShell id={id} label={label} required={required} hint={hint} wide>
    {(aria) => (
      <textarea
        id={id}
        rows={rows}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        className="lf-input"
        onChange={(event) => onChange(event.target.value)}
        {...aria}
      />
    )}
  </FieldShell>
);

export interface Option {
  value: string;
  label: string;
}

const toOptions = (options: Array<string | Option>): Option[] =>
  options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));

/** Lists longer than this become a searchable combobox. */
const FILTER_AT = 30;

interface SelectFieldProps {
  id: string;
  label: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  options: Array<string | Option>;
  required?: boolean;
  hint?: React.ReactNode;
  wide?: boolean;
  placeholder?: string;
  /** Text naming the field in the filter box's accessible label. */
  name?: string;
}

/**
 * A native select for short lists; a single searchable combobox for long ones
 * (Character has ~300 options, countries ~250). One control either way, so a
 * long list never stands taller than the fields beside it.
 */
export const SelectField: React.FC<SelectFieldProps> = ({
  id,
  label,
  value,
  onChange,
  options,
  required,
  hint,
  wide,
  placeholder = 'Select…',
  name,
}) => {
  const all = useMemo(() => toOptions(options), [options]);
  const filterable = all.length > FILTER_AT;
  const known = value === '' || all.some((o) => o.value === value);

  return (
    <FieldShell id={id} label={label} required={required} hint={hint} wide={wide}>
      {(aria) =>
        filterable ? (
          <Combobox
            id={id}
            value={value}
            options={all}
            onChange={onChange}
            placeholder={`Search ${all.length} options`}
            name={name ?? (typeof label === 'string' ? label : undefined)}
            aria={aria}
          />
        ) : (
          <select
            id={id}
            value={value}
            className="lf-input"
            onChange={(event) => onChange(event.target.value)}
            {...aria}
          >
            <option value="">{placeholder}</option>
            {!known && <option value={value}>{value} (not in Myntra’s list)</option>}
            {all.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )
      }
    </FieldShell>
  );
};

/**
 * Accessible combobox (ARIA 1.2 pattern): the input filters, the list pops
 * below, ↑/↓ move, Enter picks, Esc closes. Closed, the input shows the chosen
 * label; focusing it clears the text so typing starts a fresh search.
 */
function Combobox({
  id,
  value,
  options,
  onChange,
  placeholder,
  name,
  aria,
}: {
  id: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  placeholder: string;
  name?: string;
  aria: Record<string, unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const selected = options.find((o) => o.value === value);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
    return list.slice(0, 200);
  }, [options, query]);

  const pick = (option: Option | undefined) => {
    if (!option) return;
    onChange(option.value);
    setOpen(false);
    setQuery('');
  };

  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.children[active] as HTMLElement | undefined;
    node?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const listId = `${id}-list`;
  return (
    <div className="lf-combo">
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && shown[active] ? `${id}-opt-${active}` : undefined}
        className="lf-input lf-combo-input"
        autoComplete="off"
        value={open ? query : (selected?.label ?? (value ? `${value} (not in Myntra’s list)` : ''))}
        placeholder={open && selected ? selected.label : placeholder}
        onFocus={() => {
          setOpen(true);
          setQuery('');
          setActive(Math.max(0, options.findIndex((o) => o.value === value)));
        }}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, shown.length - 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (event.key === 'Enter') {
            if (open) {
              event.preventDefault();
              pick(shown[active]);
            }
          } else if (event.key === 'Escape') {
            setOpen(false);
            setQuery('');
          }
        }}
        {...aria}
      />
      {value && !open && (
        <button
          type="button"
          className="lf-combo-clear"
          aria-label={`Clear ${name ?? 'selection'}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onChange('')}
        >
          ×
        </button>
      )}
      <span className="lf-combo-caret" aria-hidden="true" />
      {open && (
        <ul id={listId} role="listbox" ref={listRef} className="lf-combo-list" aria-label={name}>
          {shown.length === 0 ? (
            <li className="lf-combo-empty">No matches</li>
          ) : (
            shown.map((option, index) => (
              <li
                key={option.value}
                id={`${id}-opt-${index}`}
                role="option"
                aria-selected={option.value === value}
                className={`lf-combo-option${index === active ? ' is-active' : ''}${
                  option.value === value ? ' is-selected' : ''
                }`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(option)}
              >
                {option.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

interface ChipInputProps {
  id: string;
  label: React.ReactNode;
  values: string[];
  onChange: (values: string[]) => void;
  hint?: React.ReactNode;
  placeholder?: string;
  required?: boolean;
  max?: number;
  /** Singular noun for the remove buttons, e.g. "tag". */
  noun: string;
  extra?: React.ReactNode;
}

/** Free-text values as removable chips. Enter or comma adds one. */
export const ChipInput: React.FC<ChipInputProps> = ({
  id,
  label,
  values,
  onChange,
  hint,
  placeholder,
  required,
  max = 30,
  noun,
  extra,
}) => {
  const [text, setText] = useState('');
  const add = (raw: string) => {
    const parts = raw
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) => !values.some((v) => v.toLowerCase() === part.toLowerCase()));
    if (parts.length) onChange([...values, ...parts].slice(0, max));
    setText('');
  };
  return (
    <FieldShell id={id} label={label} required={required} hint={hint} wide>
      {(aria) => (
        <div className="lf-chips-field">
          {values.length > 0 && (
            <ul className="lf-chips" aria-label={`${noun}s added`}>
              {values.map((value) => (
                <li key={value} className="lf-chip">
                  <span>{value}</span>
                  <button
                    type="button"
                    className="lf-chip-x"
                    aria-label={`Remove ${noun} ${value}`}
                    onClick={() => onChange(values.filter((v) => v !== value))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="lf-inline">
            <input
              id={id}
              type="text"
              value={text}
              placeholder={placeholder}
              className="lf-input"
              disabled={values.length >= max}
              onChange={(event) => {
                const next = event.target.value;
                if (next.includes(',')) add(next);
                else setText(next);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  add(text);
                } else if (event.key === 'Backspace' && text === '' && values.length) {
                  onChange(values.slice(0, -1));
                }
              }}
              onBlur={() => text.trim() && add(text)}
              {...aria}
            />
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => add(text)}
              disabled={!text.trim()}
            >
              Add
            </button>
            {extra}
          </div>
        </div>
      )}
    </FieldShell>
  );
};

interface CheckFieldProps {
  label: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: React.ReactNode;
}

export const CheckField: React.FC<CheckFieldProps> = ({ label, checked, onChange, hint }) => {
  const id = useId();
  return (
    <div className="lf-check">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      <div>
        <label htmlFor={id} className="lf-label lf-label--inline">
          {label}
        </label>
        {hint && (
          <p id={`${id}-hint`} className="lf-hint">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
};

interface SectionProps {
  id: string;
  title: string;
  step: number;
  description?: React.ReactNode;
  status?: React.ReactNode;
  children: React.ReactNode;
}

export const Section: React.FC<SectionProps> = ({
  id,
  title,
  step,
  description,
  status,
  children,
}) => (
  <section
    id={`lf-section-${id}`}
    className="lf-section"
    aria-labelledby={`lf-section-${id}-title`}
  >
    <header className="lf-section-head">
      <div className="min-w-0">
        <h2 id={`lf-section-${id}-title`} className="lf-section-title">
          <span className="lf-step" aria-hidden="true">
            {step}
          </span>
          {title}
        </h2>
        {description && <p className="lf-section-sub">{description}</p>}
      </div>
      {status}
    </header>
    <div className="lf-section-body">{children}</div>
  </section>
);
