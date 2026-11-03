'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProductThumb } from '@/components/product/ProductThumb';
import { searchProducts, type SearchSuggestion } from '@/lib/products-api';
import { formatCurrency } from '@/utils/helpers';
import { clearRecentSearches, forgetSearch, rememberSearch, useRecentSearches } from './useRecentSearches';

/**
 * The search box, everywhere it appears.
 *
 * `GET /products/search/q` and `searchProducts()` had both been built and
 * neither was reachable from the UI — the header simply pushed a listing URL
 * and made the shopper wait for a full page to find out whether the catalogue
 * held anything. This is the missing half.
 *
 * It is an ARIA 1.2 combobox with a listbox popup, which means focus never
 * leaves the text field: arrowing through the suggestions moves
 * `aria-activedescendant` rather than focus, so the shopper can keep typing
 * mid-list and a screen reader announces the highlighted row without losing
 * the caret. Roving focus into the list would break both.
 */

/** Below this a query is still being typed, so we show history instead of guesses. */
const MIN_QUERY = 2;

/** Long enough to swallow a fast typist's burst, short enough to feel live. */
const DEBOUNCE_MS = 180;

/** A dropdown, not a results page. */
const SUGGESTION_LIMIT = 6;

type Option =
  | { kind: 'recent'; term: string }
  | { kind: 'product'; product: SearchSuggestion }
  | { kind: 'all'; term: string };

interface Result {
  /** The query these items answer, so a stale response can be spotted in render. */
  term: string;
  items: SearchSuggestion[];
  fuzzy: boolean;
}

const NO_RESULT: Result = { term: '', items: [], fuzzy: false };

export interface SearchAutocompleteProps {
  /** Prefills the field — the results page passes the query it is showing. */
  initialQuery?: string;
  placeholder?: string;
  /** Take the caret on mount. The header's expanding bar does. */
  autoFocus?: boolean;
  /**
   * Escape on a closed list, or a completed navigation. The header uses it to
   * collapse its search bar; the results page has nothing to collapse.
   */
  onDismiss?: () => void;
  className?: string;
}

const MagnifierIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
    />
  </svg>
);

const ClockIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.6}
      d="M12 7v5l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

export const SearchAutocomplete: React.FC<SearchAutocompleteProps> = ({
  initialQuery = '',
  placeholder = 'Search products, styles or SKU',
  autoFocus = false,
  onDismiss,
  className = '',
}) => {
  const router = useRouter();
  const recent = useRecentSearches();

  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState<Result>(NO_RESULT);
  const [isPending, setIsPending] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reactId = useId();
  const inputId = `search-input-${reactId}`;
  const listboxId = `search-listbox-${reactId}`;
  const statusId = `search-status-${reactId}`;
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  const trimmed = query.trim();
  const showRecent = trimmed.length < MIN_QUERY;

  // The response is only this query's answer if it was fetched for this query.
  // Anything else on screen is the previous term's list, still showing while
  // the new one is in flight — better than blanking the panel on every letter.
  const isFresh = result.term === trimmed;
  const suggestions = showRecent || !isFresh ? [] : result.items;

  /**
   * "See all results" is always the last row once the query is long enough,
   * even with nothing above it. It gives Enter somewhere to go and it is the
   * route to the proper empty state, which can say more than a dropdown can.
   */
  const options: Option[] = showRecent
    ? recent.map((term) => ({ kind: 'recent' as const, term }))
    : [
        ...suggestions.map((product) => ({ kind: 'product' as const, product })),
        { kind: 'all' as const, term: trimmed },
      ];

  // Clamped in render rather than corrected from an effect: the list shrinks as
  // results arrive, and an index left pointing past the end would put
  // `aria-activedescendant` on an element that no longer exists.
  const active = highlight >= 0 && highlight < options.length ? highlight : -1;
  const expanded = isOpen && options.length > 0;

  /** Debounced, abortable, and never setting state straight from the effect body. */
  useEffect(() => {
    const term = query.trim();
    // Nothing to fetch for a closed panel: the results page mounts this with
    // its query already in the field, and asking the API for suggestions
    // nobody can see is a request per search-result page view.
    if (!isOpen || term.length < MIN_QUERY) return undefined;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setIsPending(true);
      searchProducts(term, { limit: SUGGESTION_LIMIT, signal: controller.signal })
        .then((data) => setResult({ term, items: data.items, fuzzy: data.fuzzy }))
        .catch(() => {
          // An abort is the next keystroke, not a failure; leave the panel be.
          if (!controller.signal.aborted) setResult({ term, items: [], fuzzy: false });
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsPending(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, isOpen]);

  /** A click anywhere else closes the panel without stealing the click. */
  useEffect(() => {
    if (!expanded) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [expanded]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  /**
   * Keep the highlighted row on screen. `aria-activedescendant` does not move
   * the viewport the way real focus would, so once the list is long enough to
   * scroll, arrowing past the fold would otherwise highlight a row nobody can
   * see.
   */
  useEffect(() => {
    if (active < 0) return;
    document.getElementById(`${listboxId}-option-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, listboxId]);

  const close = () => {
    setIsOpen(false);
    setHighlight(-1);
  };

  const goToSearch = (term: string) => {
    const value = term.trim();
    if (!value) return;
    rememberSearch(value);
    close();
    router.push(`/search?q=${encodeURIComponent(value)}`);
    onDismiss?.();
  };

  const goToProduct = (product: SearchSuggestion) => {
    // The query is worth keeping even though the shopper left the results
    // behind — it is what they were looking for, and it is what they will
    // reach for again.
    rememberSearch(trimmed);
    close();
    router.push(`/products/${product.slug}`);
    onDismiss?.();
  };

  const choose = (option: Option) => {
    if (option.kind === 'product') goToProduct(option.product);
    else goToSearch(option.term);
  };

  const move = (delta: number) => {
    if (options.length === 0) return;
    setIsOpen(true);
    // Wraps in both directions: pressing up from the field jumps to the last
    // suggestion, which is what a shopper reaching for the bottom expects.
    const next = active < 0 && delta < 0 ? options.length - 1 : (active + delta + options.length) % options.length;
    setHighlight(next);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'Home':
        if (expanded) {
          event.preventDefault();
          setHighlight(0);
        }
        break;
      case 'End':
        if (expanded) {
          event.preventDefault();
          setHighlight(options.length - 1);
        }
        break;
      case 'Enter':
        if (active >= 0) {
          // The form would otherwise submit the raw text and ignore the row
          // the shopper had highlighted.
          event.preventDefault();
          choose(options[active]);
        }
        break;
      case 'Escape':
        event.preventDefault();
        // First Escape dismisses the suggestions, second dismisses the search
        // itself. Collapsing the whole bar on the first press loses the query
        // someone was only trying to see past.
        if (expanded) close();
        else onDismiss?.();
        break;
      case 'Tab':
        close();
        break;
      default:
        break;
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    goToSearch(query);
  };

  const statusText = showRecent
    ? ''
    : isPending && !isFresh
      ? 'Searching'
      : suggestions.length > 0
        ? `${suggestions.length} ${suggestions.length === 1 ? 'suggestion' : 'suggestions'}${result.fuzzy ? ', none exact' : ''}`
        : isFresh
          ? `No products match ${trimmed}`
          : '';

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <form role="search" onSubmit={handleSubmit} aria-label="Product search">
        <label htmlFor={inputId} className="sr-only">
          Search products
        </label>
        <div className="relative">
          <input
            id={inputId}
            ref={inputRef}
            type="search"
            role="combobox"
            aria-expanded={expanded}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? optionId(active) : undefined}
            aria-describedby={statusId}
            autoComplete="off"
            placeholder={placeholder}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setIsOpen(true);
              // A changed query means a different list; keeping the old index
              // would highlight an unrelated row.
              setHighlight(-1);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
            className="h-11 w-full border border-line bg-surface-2 pl-4 pr-11 text-sm text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-[var(--brand)] focus:bg-surface"
            style={{ borderRadius: 'var(--r-control)' }}
            suppressHydrationWarning={true}
          />
          <button
            type="submit"
            aria-label="Search"
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-3 transition-colors hover:text-ink"
          >
            <MagnifierIcon className="h-5 w-5" />
          </button>
        </div>
      </form>

      {/* Announced, never shown: the visual list is right there for anyone who
          can see it. */}
      <p id={statusId} role="status" aria-live="polite" className="sr-only">
        {statusText}
      </p>

      {expanded && (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden border border-line bg-surface shadow-2"
          style={{ borderRadius: 'var(--r-control)' }}
        >
          {showRecent && (
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <span
                aria-hidden="true"
                className="text-[11px] font-semibold uppercase tracking-[0.08em]"
                style={{ color: 'var(--ink-3)' }}
              >
                Recent searches
              </span>
              <button
                type="button"
                onClick={() => {
                  clearRecentSearches();
                  inputRef.current?.focus();
                }}
                className="text-[11px] underline underline-offset-2 transition-colors hover:text-ink"
                style={{ color: 'var(--ink-3)' }}
              >
                Clear
              </button>
            </div>
          )}

          {!showRecent && isFresh && result.fuzzy && (
            <p
              aria-hidden="true"
              className="m-0 border-b border-line px-3 py-2 text-[12px]"
              style={{ color: 'var(--ink-3)' }}
            >
              No exact match for &ldquo;{trimmed}&rdquo;. Did you mean:
            </p>
          )}

          {!showRecent && isFresh && !result.fuzzy && suggestions.length === 0 && (
            <p
              aria-hidden="true"
              className="m-0 border-b border-line px-3 py-2 text-[12px]"
              style={{ color: 'var(--ink-3)' }}
            >
              Nothing in the catalogue matches that yet.
            </p>
          )}

          <ul
            role="listbox"
            id={listboxId}
            aria-label={showRecent ? 'Recent searches' : 'Product suggestions'}
            className="m-0 max-h-[min(60vh,24rem)] list-none overflow-y-auto p-0"
          >
            {options.map((option, index) => {
              const isActive = index === active;
              const rowClass = `flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                isActive ? 'bg-[var(--brand-soft)]' : 'bg-transparent'
              }`;

              if (option.kind === 'recent') {
                return (
                  <li
                    key={`recent-${option.term}`}
                    id={optionId(index)}
                    role="option"
                    aria-selected={isActive}
                    className={`${rowClass} justify-between`}
                    onMouseEnter={() => setHighlight(index)}
                    // The listbox is driven from the input by
                    // aria-activedescendant, so the row itself is not a focus
                    // stop and a plain click handler is the whole interaction.
                    onClick={() => choose(option)}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <ClockIcon className="h-4 w-4 shrink-0" />
                      <span className="truncate text-sm text-ink">{option.term}</span>
                    </span>
                    {/* A mouse affordance only. Nesting a focusable control
                        inside an option would put a second tab stop inside a
                        listbox that is meant to have none, so it is taken out
                        of the tab order and hidden from assistive tech —
                        keyboard and screen-reader users have Clear above. */}
                    <button
                      type="button"
                      aria-hidden="true"
                      tabIndex={-1}
                      onClick={(event) => {
                        event.stopPropagation();
                        forgetSearch(option.term);
                      }}
                      className="shrink-0 px-1 text-base leading-none transition-colors hover:text-ink"
                      style={{ color: 'var(--ink-3)' }}
                      title={`Remove ${option.term}`}
                    >
                      &times;
                    </button>
                  </li>
                );
              }

              if (option.kind === 'all') {
                return (
                  <li
                    key="see-all"
                    id={optionId(index)}
                    role="option"
                    aria-selected={isActive}
                    className={`${rowClass} border-t border-line`}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => choose(option)}
                  >
                    <MagnifierIcon className="h-4 w-4 shrink-0" />
                    <span className="truncate text-sm font-medium text-ink">
                      See all results for &ldquo;{option.term}&rdquo;
                    </span>
                  </li>
                );
              }

              const { product } = option;
              return (
                <li
                  key={product.id}
                  id={optionId(index)}
                  role="option"
                  aria-selected={isActive}
                  className={rowClass}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => choose(option)}
                >
                  <ProductThumb
                    src={product.thumbnail}
                    alt={product.name}
                    className="h-14 w-[42px] shrink-0 border border-line"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{product.name}</span>
                    {product.category && (
                      <span className="block truncate text-[11px]" style={{ color: 'var(--ink-3)' }}>
                        {product.category.name}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold text-ink">
                      {formatCurrency(product.price)}
                    </span>
                    {product.originalPrice != null && product.originalPrice > product.price && (
                      <span className="block text-[11px] line-through" style={{ color: 'var(--ink-3)' }}>
                        {formatCurrency(product.originalPrice)}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};
