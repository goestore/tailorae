'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  CUSTOM_WEAR_CATEGORY_GROUPS,
  categoryHref,
  getCategoryById,
} from '@/config/custom-wear/taxonomy';
import { customWearContent } from '@/config/custom-wear/content';

export interface CategoryFilterProps {
  selectedCategoryId: string | null;
  /** Called on click; the href is still real so links are shareable/crawlable. */
  onSelect: (categoryId: string | null) => void;
  /** Desktop keeps groups expanded; the mobile drawer starts collapsed. */
  defaultExpandAll?: boolean;
}

/**
 * The 15 Custom Wear categories, grouped by Men / Women / Kids.
 *
 * Rendered as real `<Link>`s to the pretty route, but intercepted so filtering
 * happens client-side without a full page reload. Middle-click and "open in new
 * tab" still work because the href is genuine.
 */
export const CategoryFilter: React.FC<CategoryFilterProps> = ({
  selectedCategoryId,
  onSelect,
  defaultExpandAll = true,
}) => {
  const selectedGender = getCategoryById(selectedCategoryId)?.gender;

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      CUSTOM_WEAR_CATEGORY_GROUPS.map((group) => [
        group.gender,
        defaultExpandAll || group.gender === selectedGender,
      ])
    )
  );

  const toggleGroup = (gender: string) =>
    setOpenGroups((current) => ({ ...current, [gender]: !current[gender] }));

  return (
    <nav aria-label={customWearContent.labels.categoriesHeading}>
      <h3
        className="uppercase"
        style={{
          margin: '0 0 12px',
          fontFamily: 'var(--cw-font-body)',
          fontSize: 'var(--cw-fs-micro)',
          fontWeight: 700,
          letterSpacing: '0.12em',
          color: 'var(--cw-ink)',
        }}
      >
        {customWearContent.labels.categoriesHeading}
      </h3>

      <button
        suppressHydrationWarning
        type="button"
        onClick={() => onSelect(null)}
        aria-current={selectedCategoryId === null ? 'true' : undefined}
        className="mb-2 block w-full text-left transition-colors"
        style={{
          fontFamily: 'var(--cw-font-body)',
          fontSize: 'var(--cw-fs-small)',
          fontWeight: selectedCategoryId === null ? 700 : 500,
          color: selectedCategoryId === null ? 'var(--cw-ink)' : 'var(--cw-ink-muted)',
          padding: '6px 8px',
          borderRadius: 'var(--cw-radius-chip)',
          backgroundColor: selectedCategoryId === null ? 'var(--cw-primary-soft)' : 'transparent',
          borderLeft: `3px solid ${selectedCategoryId === null ? 'var(--cw-primary)' : 'transparent'}`,
        }}
      >
        All Custom Wear
      </button>

      <ul className="flex flex-col">
        {CUSTOM_WEAR_CATEGORY_GROUPS.map((group) => {
          const isOpen = openGroups[group.gender] ?? true;
          const panelId = `cw-category-group-${group.gender}`;

          return (
            <li key={group.gender} className="py-1">
              <button
                suppressHydrationWarning
                type="button"
                onClick={() => toggleGroup(group.gender)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left"
                style={{
                  fontFamily: 'var(--cw-font-body)',
                  fontSize: 'var(--cw-fs-small)',
                  fontWeight: 700,
                  color: 'var(--cw-ink)',
                }}
              >
                {group.label}
                <svg
                  aria-hidden="true"
                  className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  style={{ color: 'var(--cw-ink-subtle)' }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
                </svg>
              </button>

              <ul id={panelId} hidden={!isOpen} className="flex flex-col gap-0.5 pl-1 pt-1">
                {group.categories.map((category) => {
                  const isSelected = category.id === selectedCategoryId;
                  return (
                    <li key={category.id}>
                      <Link
                        href={categoryHref(category)}
                        aria-current={isSelected ? 'page' : undefined}
                        onClick={(event) => {
                          // Let modified clicks fall through to a real navigation.
                          if (
                            event.metaKey ||
                            event.ctrlKey ||
                            event.shiftKey ||
                            event.button !== 0
                          ) {
                            return;
                          }
                          event.preventDefault();
                          onSelect(isSelected ? null : category.id);
                        }}
                        className="block transition-colors"
                        style={{
                          fontFamily: 'var(--cw-font-body)',
                          fontSize: 'var(--cw-fs-small)',
                          fontWeight: isSelected ? 700 : 400,
                          color: isSelected ? 'var(--cw-ink)' : 'var(--cw-ink-muted)',
                          padding: '6px 8px',
                          borderRadius: 'var(--cw-radius-chip)',
                          backgroundColor: isSelected ? 'var(--cw-primary-soft)' : 'transparent',
                          borderLeft: `3px solid ${isSelected ? 'var(--cw-primary)' : 'transparent'}`,
                        }}
                      >
                        {category.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
