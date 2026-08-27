'use client';

import React, { useMemo, useState } from 'react';
import type { PickerSource } from '@/content/field';
import { loadPickerOptions, type PickerOption } from '@/content/picker-source';
import { cn } from '@/utils/helpers';
import { LABEL_VOICE } from './ContentField';

/**
 * Chooses which items a section shows, and in what order.
 *
 * Two lists rather than one: what is chosen, in order, with move and remove;
 * and what is still available, filtered by a search box. Keeping them apart is
 * what lets the same control answer both "which of these appear" and "which is
 * first", which a checkbox list cannot.
 *
 * An empty selection is a real state and the default. It means the section has
 * not been curated and falls back to whatever it shows on its own, so an
 * untouched field never blanks a section.
 */

const previewable = (value: string): boolean => value !== '' && /^[^"'()\s]+$/.test(value);

const Thumb: React.FC<{ url?: string }> = ({ url }) => (
  <span
    aria-hidden="true"
    className="block h-10 w-10 shrink-0 border border-line bg-surface-2 bg-cover bg-center"
    style={url && previewable(url) ? { backgroundImage: `url("${url}")` } : undefined}
  />
);

interface PickerControlProps {
  id: string;
  value: unknown;
  describedBy?: string;
  source: PickerSource;
  max?: number;
  onChange: (value: string[]) => void;
  onBlur: () => void;
}

export const PickerControl: React.FC<PickerControlProps> = ({
  id,
  value,
  describedBy,
  source,
  max,
  onChange,
  onBlur,
}) => {
  const [options, setOptions] = useState<PickerOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [announcement, setAnnouncement] = useState('');

  const chosen = useMemo(
    () => (Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []),
    [value]
  );

  const byId = useMemo(() => new Map(options.map((option) => [option.id, option])), [options]);

  /**
   * Options load on demand, from a click rather than an effect: the catalog is
   * a network round trip and most fields in an editor are never opened.
   */
  const load = () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    loadPickerOptions(source)
      .then((next) => {
        setOptions(next);
        setLoaded(true);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  const commit = (next: string[], message: string) => {
    onChange(next);
    setAnnouncement(message);
    onBlur();
  };

  const nameOf = (itemId: string) => byId.get(itemId)?.label ?? itemId;

  const move = (from: number, to: number) => {
    if (to < 0 || to >= chosen.length) return;
    const next = [...chosen];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    commit(next, `${nameOf(moved)} moved to position ${to + 1} of ${next.length}.`);
  };

  const remove = (itemId: string) =>
    commit(
      chosen.filter((entry) => entry !== itemId),
      `${nameOf(itemId)} removed.`
    );

  const add = (itemId: string) => {
    if (chosen.includes(itemId)) return;
    if (max !== undefined && chosen.length >= max) return;
    commit([...chosen, itemId], `${nameOf(itemId)} added at position ${chosen.length + 1}.`);
  };

  const available = useMemo(() => {
    const term = search.trim().toLowerCase();
    return options
      .filter((option) => !chosen.includes(option.id))
      .filter((option) => term === '' || option.label.toLowerCase().includes(term));
  }, [options, chosen, search]);

  const full = max !== undefined && chosen.length >= max;

  return (
    <div id={id} aria-describedby={describedBy} className="flex flex-col gap-3">
      {chosen.length === 0 ? (
        <p className="border border-dashed border-line-strong bg-surface-2 px-3 py-2.5 text-sm text-ink-2">
          Nothing chosen — this section picks its own items automatically. Add one below to take
          control of exactly what shows and in what order.
        </p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {chosen.map((itemId, index) => {
            const option = byId.get(itemId);
            return (
              <li
                key={itemId}
                className="flex items-center gap-3 border border-line bg-surface-2 px-3 py-2"
              >
                <span className={cn(LABEL_VOICE, 'w-5 shrink-0 tabular-nums')}>{index + 1}</span>
                <Thumb url={option?.image} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm text-ink">
                    {/* Before the list loads there is nothing to resolve the id
                        against; showing the raw id is honest rather than blank. */}
                    {option?.label ?? (loaded ? `Unknown item (${itemId})` : itemId)}
                  </span>
                  {option?.meta && <span className={LABEL_VOICE}>{option.meta}</span>}
                  {loaded && !option && (
                    <span className={cn(LABEL_VOICE, 'text-red-600')}>
                      No longer in the catalog — it will not show
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline px-2"
                    disabled={index === 0}
                    aria-label={`Move ${nameOf(itemId)} up`}
                    onClick={() => move(index, index - 1)}
                  >
                    <span aria-hidden="true">↑</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline px-2"
                    disabled={index === chosen.length - 1}
                    aria-label={`Move ${nameOf(itemId)} down`}
                    onClick={() => move(index, index + 1)}
                  >
                    <span aria-hidden="true">↓</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost px-2"
                    aria-label={`Remove ${nameOf(itemId)}`}
                    onClick={() => remove(itemId)}
                  >
                    <span aria-hidden="true">✕</span>
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!loaded && (
          <button type="button" className="btn btn-sm btn-outline" disabled={loading} onClick={load}>
            {loading ? 'Loading…' : chosen.length > 0 ? 'Edit selection' : 'Choose items'}
          </button>
        )}
        {chosen.length > 0 && (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => commit([], 'Selection cleared.')}
          >
            Clear selection
          </button>
        )}
        {max !== undefined && (
          <span className={LABEL_VOICE}>
            {chosen.length}/{max} chosen
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}

      {loaded && (
        <div className="border border-line bg-surface p-3">
          <label htmlFor={`${id}-search`} className={cn(LABEL_VOICE, 'block')}>
            Available
          </label>
          <input
            id={`${id}-search`}
            type="search"
            value={search}
            placeholder="Search…"
            className="mt-1 w-full text-sm"
            onChange={(event) => setSearch(event.target.value)}
          />

          {full && (
            <p className="form-help mt-2">
              That is the maximum. Remove one above to add another.
            </p>
          )}

          {available.length === 0 ? (
            <p className="mt-2 text-sm text-ink-3">
              {options.length === 0
                ? 'Nothing to choose from.'
                : search.trim() !== ''
                  ? 'Nothing matches that search.'
                  : 'Everything is already chosen.'}
            </p>
          ) : (
            <ul className="mt-2 flex max-h-72 flex-col gap-1 overflow-y-auto pr-1">
              {available.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 border border-line bg-surface px-3 py-2 text-left hover:bg-surface-2 disabled:opacity-50"
                    disabled={full}
                    onClick={() => add(option.id)}
                  >
                    <Thumb url={option.image} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm text-ink">{option.label}</span>
                      {option.meta && <span className={LABEL_VOICE}>{option.meta}</span>}
                    </span>
                    <span aria-hidden="true" className="shrink-0 text-lg leading-none text-ink-3">
                      +
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
};
