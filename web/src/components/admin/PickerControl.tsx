'use client';

import React, { useMemo, useState } from 'react';
import type { PickerSource } from '@/content/field';
import { loadPickerOptions, type PickerOption } from '@/content/picker-source';
import { Grip, RowActions } from './ContentField';

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
    className="ce-thumb"
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

  const chooseLabel = loading ? 'Loading…' : chosen.length > 0 ? 'Edit selection' : 'Choose';

  return (
    <div id={id} aria-describedby={describedBy} className="flex flex-col gap-2">
      {chosen.length === 0 ? (
        <div className="ce-well">
          <p>
            Nothing chosen — this section picks its own items automatically. Choose items to take
            control of exactly what shows and in what order.
          </p>
          {!loaded && (
            <button type="button" className="btn btn-sm" disabled={loading} onClick={load}>
              {chooseLabel}
            </button>
          )}
        </div>
      ) : (
        <ol className="ce-rows">
          {chosen.map((itemId, index) => {
            const option = byId.get(itemId);
            return (
              <li key={itemId} className="ce-row">
                <div className="ce-row-head">
                  <Grip />
                  <span className="ce-row-index">{index + 1}</span>
                  <Thumb url={option?.image} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="ce-row-name">
                      {/* Before the list loads there is nothing to resolve the id
                          against; showing the raw id is honest rather than blank. */}
                      {option?.label ?? (loaded ? `Unknown item (${itemId})` : itemId)}
                    </span>
                    {option?.meta && <span className="ce-row-meta">{option.meta}</span>}
                    {loaded && !option && (
                      <span className="ce-error">No longer in the catalog — it will not show</span>
                    )}
                  </span>
                  <RowActions
                    name={nameOf(itemId)}
                    index={index}
                    count={chosen.length}
                    onMove={move}
                    onRemove={() => remove(itemId)}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {(chosen.length > 0 || max !== undefined) && (
        <div className="ce-inline">
          {!loaded && chosen.length > 0 && (
            <button type="button" className="btn btn-sm" disabled={loading} onClick={load}>
              {chooseLabel}
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
            <span className="ce-count">
              {chosen.length}/{max} chosen
            </span>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="ce-error">
          {error}
        </p>
      )}

      {loaded && (
        <div className="ce-panel">
          <label htmlFor={`${id}-search`} className="ce-label">
            Available
          </label>
          <input
            id={`${id}-search`}
            type="search"
            value={search}
            placeholder="Search…"
            className="w-full"
            onChange={(event) => setSearch(event.target.value)}
          />

          {full && <p className="ce-help">That is the maximum. Remove one above to add another.</p>}

          {available.length === 0 ? (
            <p className="ce-help">
              {options.length === 0
                ? 'Nothing to choose from.'
                : search.trim() !== ''
                  ? 'Nothing matches that search.'
                  : 'Everything is already chosen.'}
            </p>
          ) : (
            <ul className="ce-rows max-h-72 overflow-y-auto">
              {available.map((option) => (
                <li key={option.id} className="ce-row">
                  <button
                    type="button"
                    className="ce-row-head w-full cursor-pointer border-0 bg-transparent text-left hover:bg-[var(--a-surface-2)] disabled:cursor-not-allowed"
                    disabled={full}
                    onClick={() => add(option.id)}
                  >
                    <Thumb url={option.image} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="ce-row-name">{option.label}</span>
                      {option.meta && <span className="ce-row-meta">{option.meta}</span>}
                    </span>
                    <span
                      aria-hidden="true"
                      className="shrink-0 px-2 text-base leading-none text-[var(--a-text-dim)]"
                    >
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
