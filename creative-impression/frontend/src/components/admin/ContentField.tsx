'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { ContentPath } from '@/content/define';
import { resolveOrder, sameFieldValue, type ListItem } from '@/content/field';
import { ImagePicker } from './ImagePicker';
import { PickerControl } from './PickerControl';
import { ListControl } from './ListControl';
import { cn } from '@/utils/helpers';

/**
 * The small secondary-label voice (counts, meta lines). Exported so the list,
 * picker and image controls share one decision rather than several that drift.
 */
export const LABEL_VOICE = 'text-xs font-[550] text-[var(--a-text-dim)]';

/** Six-dot grip: marks a row as one of an ordered set. Moves are by button. */
export const Grip: React.FC = () => (
  <span className="ce-grip" aria-hidden="true">
    <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
      <circle cx="2.5" cy="2.5" r="1.25" />
      <circle cx="7.5" cy="2.5" r="1.25" />
      <circle cx="2.5" cy="7" r="1.25" />
      <circle cx="7.5" cy="7" r="1.25" />
      <circle cx="2.5" cy="11.5" r="1.25" />
      <circle cx="7.5" cy="11.5" r="1.25" />
    </svg>
  </span>
);

/** Up / down / remove buttons shared by every ordered row in the editor. */
export const RowActions: React.FC<{
  name: string;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onRemove?: () => void;
}> = ({ name, index, count, onMove, onRemove }) => (
  <span className="ce-row-actions">
    <button
      type="button"
      className="btn btn-sm ce-icon-btn"
      disabled={index === 0}
      aria-label={`Move ${name} up`}
      title="Move up"
      onClick={() => onMove(index, index - 1)}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 7.5 6 4.5l3 3" />
      </svg>
    </button>
    <button
      type="button"
      className="btn btn-sm ce-icon-btn"
      disabled={index === count - 1}
      aria-label={`Move ${name} down`}
      title="Move down"
      onClick={() => onMove(index, index + 1)}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 4.5 6 7.5l3-3" />
      </svg>
    </button>
    {onRemove && (
      <button
        type="button"
        className="btn btn-sm btn-ghost ce-icon-btn ce-icon-btn--remove"
        aria-label={`Remove ${name}`}
        title="Remove"
        onClick={onRemove}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M3.5 3.5l5 5M8.5 3.5l-5 5" />
        </svg>
      </button>
    )}
  </span>
);

/** One-line rendering of a stored value, for the "this is what is live" notes. */
export function formatContentValue(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return '(none)';
    // Ids read as the arrangement itself; a list of items reads as a count,
    // because joining objects would print "[object Object]".
    return value.every((entry) => typeof entry === 'string')
      ? value.join(' → ')
      : `${value.length} item${value.length === 1 ? '' : 's'}`;
  }
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '—';
  if (typeof value === 'string') return value.trim() === '' ? '(empty)' : value;
  return String(value);
}

const asText = (value: unknown): string => (typeof value === 'string' ? value : '');

const numberText = (value: unknown): string =>
  typeof value === 'number' && Number.isFinite(value) ? String(value) : '';

/**
 * `input[type=color]` accepts `#rrggbb` and nothing else, so a three-digit or
 * half-typed hex has to be expanded or dropped before it reaches the swatch.
 * The text box beside it stays the field's real editor.
 */
const swatchValue = (value: unknown): string => {
  const text = asText(value).trim();
  if (/^#[0-9a-f]{6}$/i.test(text)) return text;
  if (/^#[0-9a-f]{3}$/i.test(text)) {
    return `#${text
      .slice(1)
      .split('')
      .map((channel) => channel + channel)
      .join('')}`;
  }
  return '#000000';
};

/**
 * Reorders a fixed set of sections.
 *
 * Buttons rather than drag-and-drop: this has to work with a keyboard and a
 * screen reader, and a two-button row does that natively while dragging needs
 * a parallel keyboard implementation to match. Each move announces itself
 * through the live region so the new position is audible, not just visible.
 */
const OrderControl: React.FC<
  ControlProps & { ids: readonly string[]; labels?: Readonly<Record<string, string>> }
> = ({ id, value, describedBy, ids, labels, onChange, onBlur }) => {
  const order = resolveOrder(value, ids);
  const [announcement, setAnnouncement] = useState('');
  const nameOf = (sectionId: string) => labels?.[sectionId] ?? sectionId;

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
    setAnnouncement(`${nameOf(moved)} moved to position ${to + 1} of ${next.length}.`);
    onBlur();
  };

  return (
    <div id={id} aria-describedby={describedBy}>
      <ol className="ce-rows">
        {order.map((sectionId, index) => (
          <li key={sectionId} className="ce-row">
            <div className="ce-row-head">
              <Grip />
              <span className="ce-row-index">{index + 1}</span>
              <span className="ce-row-name">{nameOf(sectionId)}</span>
              <RowActions
                name={nameOf(sectionId)}
                index={index}
                count={order.length}
                onMove={move}
              />
            </div>
          </li>
        ))}
      </ol>
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
};

interface ControlProps {
  id: string;
  value: unknown;
  invalid: boolean;
  describedBy?: string;
  onChange: (value: unknown) => void;
  onBlur: () => void;
}

/**
 * Numbers keep their own text state. The box has to hold "-" or "1." while
 * they are being typed, and rewriting it from the parsed number would eat the
 * character under the cursor. Only the parsed number leaves the control, so
 * nothing downstream ever receives a numeric string.
 */
const NumberControl: React.FC<ControlProps & { min?: number; max?: number }> = ({
  id,
  value,
  invalid,
  describedBy,
  min,
  max,
  onChange,
  onBlur,
}) => {
  const [text, setText] = useState(() => numberText(value));
  const pushed = useRef<unknown>(value);

  useEffect(() => {
    // A value that did not come from this box — a discarded draft, a switched
    // namespace — replaces what is typed. The admin's own keystrokes do not,
    // because they arrive back identical to what was just pushed up.
    if (!Object.is(pushed.current, value)) {
      pushed.current = value;
      setText(numberText(value));
    }
  }, [value]);

  return (
    <input
      id={id}
      suppressHydrationWarning
      type="number"
      min={min}
      max={max}
      value={text}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      className="max-w-[12rem] text-sm"
      onChange={(event) => {
        const next = event.target.value;
        // Blank has to become NaN rather than 0: `Number('')` is 0, and a
        // plausible-looking 0 stored for a field the admin had just emptied is
        // exactly the kind of change nobody reviews. NaN fails validate().
        const parsed = next.trim() === '' ? Number.NaN : Number(next);
        pushed.current = parsed;
        setText(next);
        onChange(parsed);
      }}
      onBlur={onBlur}
    />
  );
};

/**
 * The input for one field, and nothing else.
 *
 * Split out from `ContentField` because a list item needs the same controls
 * without the surrounding row of label, path, live value and revert link. Both
 * callers dispatch on `field.kind` through here, so a new field type gains its
 * control in one place rather than two that drift.
 */
export interface FieldControlProps {
  field: ContentPath['field'];
  id: string;
  value: unknown;
  error: string | null;
  describedBy?: string;
  /** Used where a control needs its own accessible name, e.g. the colour swatch. */
  label: string;
  onChange: (value: unknown) => void;
  onBlur: () => void;
}

export const FieldControl: React.FC<FieldControlProps> = ({
  field,
  id,
  value,
  error,
  describedBy,
  label,
  onChange,
  onBlur,
}) => {
  const shared = {
    id,
    suppressHydrationWarning: true,
    'aria-invalid': error ? (true as const) : undefined,
    'aria-describedby': describedBy,
    onBlur,
  };

  const text = asText(value);

  switch (field.kind) {
    case 'textarea':
      return (
        <textarea
          {...shared}
          rows={3}
          value={text}
          className="text-sm"
          onChange={(event) => onChange(event.target.value)}
        />
      );

    case 'number':
      return (
        <NumberControl
          id={id}
          value={value}
          invalid={Boolean(error)}
          describedBy={describedBy}
          min={field.min}
          max={field.max}
          onChange={onChange}
          onBlur={onBlur}
        />
      );

    case 'boolean':
      return (
        <span className="flex items-center gap-2">
          <input
            {...shared}
            type="checkbox"
            checked={value === true}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span className="text-[13px] text-[var(--a-text)]">{value === true ? 'On' : 'Off'}</span>
        </span>
      );

    case 'select':
      return (
        <select
          {...shared}
          value={text}
          className="max-w-[16rem] text-sm"
          onChange={(event) => onChange(event.target.value)}
        >
          {field.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );

    case 'color':
      return (
        <span className="flex items-center gap-2">
          <input
            type="color"
            value={swatchValue(value)}
            aria-label={`${label} — colour picker`}
            className="h-8 w-10 shrink-0 cursor-pointer rounded-[var(--a-radius-sm)]"
            // Uppercased to match the hex casing the schema defaults use, so
            // re-picking the colour already set does not read as a change.
            onChange={(event) => onChange(event.target.value.toUpperCase())}
            onBlur={onBlur}
          />
          <input
            {...shared}
            type="text"
            value={text}
            spellCheck={false}
            className="max-w-[10rem] font-mono text-sm uppercase"
            onChange={(event) => onChange(event.target.value)}
          />
        </span>
      );

    case 'image':
      return (
        <ImagePicker
          id={id}
          value={text}
          invalid={Boolean(error)}
          describedBy={describedBy}
          onChange={onChange}
          onBlur={onBlur}
        />
      );

    case 'list':
      return field.itemFields ? (
        <ListControl
          id={id}
          value={value}
          describedBy={describedBy}
          itemFields={field.itemFields}
          max={field.max}
          fallback={field.defaultValue as readonly ListItem[]}
          onChange={onChange}
          onBlur={onBlur}
        />
      ) : (
        <p className="form-error">This list is missing its item definition.</p>
      );

    case 'picker':
      return field.source ? (
        <PickerControl
          id={id}
          value={value}
          describedBy={describedBy}
          source={field.source}
          max={field.max}
          onChange={onChange}
          onBlur={onBlur}
        />
      ) : (
        // A picker with no source cannot offer anything; saying so beats
        // rendering an empty box that looks broken.
        <p className="form-error">This field is missing its source.</p>
      );

    case 'order':
      return (
        <OrderControl
          id={id}
          invalid={Boolean(error)}
          describedBy={describedBy}
          value={value}
          ids={field.options ?? []}
          labels={field.optionLabels}
          onChange={onChange}
          onBlur={onBlur}
        />
      );

    case 'length':
      return (
        <input
          {...shared}
          type="text"
          value={text}
          spellCheck={false}
          className="max-w-[22rem] font-mono text-sm"
          onChange={(event) => onChange(event.target.value)}
        />
      );

    default:
      return (
        <input
          {...shared}
          type="text"
          value={text}
          className="text-sm"
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }
};

export interface ContentFieldProps {
  entry: ContentPath;
  /** Draft over published over default — what the editor is holding. */
  value: unknown;
  /** What the storefront renders right now. The gap between the two is the warning. */
  publishedValue: unknown;
  /** Shown inline; set on blur rather than per keystroke so half-typed values do not nag. */
  error: string | null;
  onChange: (value: unknown) => void;
  onBlur: () => void;
  onRevert: () => void;
}

/**
 * One editable value, rendered from its field kind.
 *
 * Every branch here is driven by `entry.field`, never by the namespace or the
 * path, so a field added to any schema arrives with the right control, its own
 * label, help and validator, and no edit to this file.
 */
export const ContentField: React.FC<ContentFieldProps> = ({
  entry,
  value,
  publishedValue,
  error,
  onChange,
  onBlur,
  onRevert,
}) => {
  const { field } = entry;
  const label = entry.trail[entry.trail.length - 1] ?? entry.path;
  const id = `cf-${entry.address.replace(/[^a-zA-Z0-9]+/g, '-')}`;
  const helpId = field.help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined;
  const changed = !sameFieldValue(value, publishedValue);

  // Only the character counter still needs the raw text here; the controls
  // themselves now live in FieldControl.
  const text = asText(value);
  const overLimit = field.max !== undefined && text.length > field.max;

  return (
    <div className={cn('ce-field', changed && 'ce-field--changed')}>
      <div className="ce-field-label">
        {/* The JSON pointer is the address the API and support use; it stays
            reachable as a tooltip without cluttering the form. */}
        <label htmlFor={id} className="ce-label" title={entry.path}>
          {label}
        </label>
        {(changed || field.private) && (
          <span className="ce-tags">
            {changed && <span className="ce-badge ce-badge--attention">Unpublished</span>}
            {field.private && <span className="ce-badge">Private</span>}
          </span>
        )}
      </div>

      <div className="ce-control">
        <FieldControl
          field={field}
          id={id}
          value={value}
          error={error}
          describedBy={describedBy}
          label={label}
          onChange={onChange}
          onBlur={onBlur}
        />

        {field.help && (
          <p id={helpId} className="ce-help">
            {field.help}
          </p>
        )}

        {field.max !== undefined && (field.kind === 'text' || field.kind === 'textarea') && (
          <p className={overLimit ? 'ce-error' : 'ce-help'}>
            {text.length}/{field.max} characters
          </p>
        )}

        {error && (
          <p id={errorId} role="alert" className="ce-error">
            {error}
          </p>
        )}

        {changed && (
          <p className="ce-live">
            <span className="font-[550]">Live</span>
            <span>{formatContentValue(publishedValue)}</span>
            <button type="button" className="btn btn-sm btn-ghost" onClick={onRevert}>
              Revert
            </button>
          </p>
        )}
      </div>
    </div>
  );
};
