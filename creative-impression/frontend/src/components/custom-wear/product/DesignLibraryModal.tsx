'use client';

import React, { useMemo, useState } from 'react';
import { Modal } from '@/components/common';
import { DESIGN_TEMPLATES, DESIGN_TEMPLATE_CATEGORIES } from '@/data/custom-wear/design-library';
import type { DesignTemplate, DesignTemplateArtwork } from '@/types/custom-wear';

export interface DesignLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTemplateId: string | null;
  onSelect: (template: DesignTemplate) => void;
}

/**
 * "Browse Designs" library.
 *
 * Templates render as inline SVG from structured data, so they scale cleanly
 * and the same records can feed the future on-garment canvas editor.
 */
export const DesignLibraryModal: React.FC<DesignLibraryModalProps> = ({
  isOpen,
  onClose,
  selectedTemplateId,
  onSelect,
}) => {
  const [categoryId, setCategoryId] = useState('all');
  const [query, setQuery] = useState('');

  const templates = useMemo(() => {
    const search = query.trim().toLowerCase();
    return DESIGN_TEMPLATES.filter((template) => {
      const matchesCategory = categoryId === 'all' || template.categoryId === categoryId;
      const matchesQuery =
        !search ||
        template.name.toLowerCase().includes(search) ||
        template.tags.some((tag) => tag.includes(search));
      return matchesCategory && matchesQuery;
    });
  }, [categoryId, query]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Browse Designs" size="xl">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {DESIGN_TEMPLATE_CATEGORIES.map((category) => {
              const isActive = category.id === categoryId;
              return (
                <button
                  suppressHydrationWarning
                  key={category.id}
                  type="button"
                  onClick={() => setCategoryId(category.id)}
                  aria-pressed={isActive}
                  className="transition-colors"
                  style={{
                    fontFamily: 'var(--cw-font-body)',
                    fontSize: 'var(--cw-fs-micro)',
                    fontWeight: 600,
                    padding: '7px 11px',
                    borderRadius: 'var(--cw-radius-chip)',
                    border: `1px solid ${isActive ? 'var(--cw-primary)' : 'var(--cw-border)'}`,
                    backgroundColor: isActive ? 'var(--cw-primary)' : 'var(--cw-white)',
                    color: isActive ? 'var(--cw-on-primary)' : 'var(--cw-ink-muted)',
                  }}
                >
                  {category.label}
                </button>
              );
            })}
          </div>

          <div className="sm:w-[220px]">
            <label htmlFor="cw-design-search" className="sr-only">
              Search designs
            </label>
            <input
              suppressHydrationWarning
              id="cw-design-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search designs"
              className="w-full"
            />
          </div>
        </div>

        {templates.length === 0 ? (
          <p
            style={{
              color: 'var(--cw-ink-subtle)',
              fontFamily: 'var(--cw-font-body)',
              fontSize: 'var(--cw-fs-small)',
              padding: '24px 0',
              textAlign: 'center',
            }}
          >
            No designs match that search. Try another keyword, or upload your own artwork.
          </p>
        ) : (
          <ul className="grid max-h-[52vh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
            {templates.map((template) => {
              const isSelected = template.id === selectedTemplateId;
              return (
                <li key={template.id}>
                  <button
                    suppressHydrationWarning
                    type="button"
                    onClick={() => onSelect(template)}
                    aria-pressed={isSelected}
                    className="flex w-full flex-col overflow-hidden text-left transition-transform hover:-translate-y-0.5"
                    style={{
                      borderRadius: 'var(--cw-radius-control)',
                      border: `2px solid ${isSelected ? 'var(--cw-primary)' : 'var(--cw-border)'}`,
                    }}
                  >
                    <TemplatePreview artwork={template.artwork} />
                    <span
                      className="px-2.5 py-2"
                      style={{
                        fontFamily: 'var(--cw-font-body)',
                        fontSize: 'var(--cw-fs-micro)',
                        fontWeight: 600,
                        color: 'var(--cw-ink)',
                      }}
                    >
                      {template.name}
                      {isSelected && (
                        <span
                          className="mt-0.5 block"
                          style={{ color: 'var(--cw-success)', fontWeight: 700 }}
                        >
                          Selected
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <p
          style={{
            margin: 0,
            color: 'var(--cw-ink-subtle)',
            fontFamily: 'var(--cw-font-body)',
            fontSize: 'var(--cw-fs-micro)',
            lineHeight: 1.6,
          }}
        >
          Pick a starting point and our design team adapts it to your brand colours and text before
          production. Prefer your own artwork? Close this and use Upload Design.
        </p>
      </div>
    </Modal>
  );
};

const ICON_PATHS: Record<string, string> = {
  cross: 'M40 22h20v18h18v20H60v18H40V60H22V40h18z',
  mountain: 'M14 76 38 30l14 24 8-12 26 34z',
  bolt: 'M56 12 28 56h18l-6 32 30-46H52z',
  shield: 'M50 12 82 24v26c0 20-14 32-32 38-18-6-32-18-32-38V24z',
};

/** Renders a template as inline SVG at a fixed 100×100 viewBox. */
const TemplatePreview: React.FC<{ artwork: DesignTemplateArtwork }> = ({ artwork }) => (
  <span className="block w-full" style={{ aspectRatio: '1 / 1', background: artwork.background }}>
    <svg viewBox="0 0 100 100" width="100%" height="100%" role="img" aria-hidden="true">
      {artwork.kind === 'monogram' && (
        <text
          x="50"
          y="50"
          textAnchor="middle"
          dominantBaseline="central"
          fill={artwork.color}
          fontSize="38"
          fontWeight="700"
          fontFamily="var(--cw-font-heading)"
        >
          {artwork.primary}
        </text>
      )}

      {artwork.kind === 'badge' && (
        <>
          <circle cx="50" cy="50" r="34" fill="none" stroke={artwork.color} strokeWidth="2.5" />
          <text
            x="50"
            y={artwork.secondary ? 46 : 50}
            textAnchor="middle"
            dominantBaseline="central"
            fill={artwork.color}
            fontSize="15"
            fontWeight="700"
            letterSpacing="1.5"
          >
            {artwork.primary}
          </text>
          {artwork.secondary && (
            <text
              x="50"
              y="62"
              textAnchor="middle"
              dominantBaseline="central"
              fill={artwork.color}
              fontSize="8"
              letterSpacing="2"
            >
              {artwork.secondary}
            </text>
          )}
        </>
      )}

      {artwork.kind === 'wordmark' && (
        <>
          <text
            x="50"
            y={artwork.secondary ? 44 : 50}
            textAnchor="middle"
            dominantBaseline="central"
            fill={artwork.color}
            fontSize="14"
            fontWeight="700"
            letterSpacing="1"
          >
            {artwork.primary}
          </text>
          {artwork.secondary && (
            <>
              <line x1="26" y1="53" x2="74" y2="53" stroke={artwork.color} strokeWidth="1.5" />
              <text
                x="50"
                y="63"
                textAnchor="middle"
                dominantBaseline="central"
                fill={artwork.color}
                fontSize="9"
                letterSpacing="2"
              >
                {artwork.secondary}
              </text>
            </>
          )}
        </>
      )}

      {artwork.kind === 'icon' && (
        <path d={ICON_PATHS[artwork.primary] ?? ICON_PATHS.shield} fill={artwork.color} />
      )}
    </svg>
  </span>
);
