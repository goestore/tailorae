'use client';

import React, { useId, useState } from 'react';
import { customWearContent } from '@/config/custom-wear/content';
import type { ProductAccordionSection } from '@/types/custom-wear';

export interface ProductAccordionsProps {
  sections: ProductAccordionSection[];
}

/**
 * Product information accordions. Order comes from
 * `customWearContent.productPage.accordionOrder`, so an editor can reorder or
 * drop a panel without touching this component.
 */
export const ProductAccordions: React.FC<ProductAccordionsProps> = ({ sections }) => {
  const { accordionOrder, defaultOpenAccordionId } = customWearContent.productPage;
  const baseId = useId();

  const ordered = [...sections].sort((a, b) => {
    const indexA = accordionOrder.indexOf(a.id);
    const indexB = accordionOrder.indexOf(b.id);
    return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
  });

  const [openIds, setOpenIds] = useState<string[]>([defaultOpenAccordionId]);

  const toggle = (id: string) =>
    setOpenIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
    );

  return (
    <div style={{ borderTop: '1px solid var(--cw-border)' }}>
      {ordered.map((section) => {
        const isOpen = openIds.includes(section.id);
        const panelId = `${baseId}-${section.id}`;

        return (
          <section key={section.id} style={{ borderBottom: '1px solid var(--cw-border)' }}>
            <h3 style={{ margin: 0 }}>
              <button
                suppressHydrationWarning
                type="button"
                onClick={() => toggle(section.id)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className="flex w-full items-center justify-between gap-3 py-4 text-left"
                style={{
                  fontFamily: 'var(--cw-font-body)',
                  fontSize: 'var(--cw-fs-body)',
                  fontWeight: 600,
                  color: 'var(--cw-ink)',
                }}
              >
                {section.title}
                <svg
                  aria-hidden="true"
                  className={`h-4 w-4 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  style={{ color: 'var(--cw-ink-subtle)' }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
                </svg>
              </button>
            </h3>

            <div id={panelId} hidden={!isOpen} className="pb-5">
              {section.paragraphs?.map((paragraph, index) => (
                <p
                  key={index}
                  style={{
                    margin: index === 0 ? '0 0 10px' : '10px 0',
                    color: 'var(--cw-ink-muted)',
                    fontFamily: 'var(--cw-font-body)',
                    fontSize: 'var(--cw-fs-small)',
                    lineHeight: 1.7,
                    maxWidth: '68ch',
                  }}
                >
                  {paragraph}
                </p>
              ))}

              {section.bullets && section.bullets.length > 0 && (
                <ul className="mt-1 flex flex-col gap-1.5">
                  {section.bullets.map((bullet, index) => (
                    <li
                      key={index}
                      className="flex gap-2.5"
                      style={{
                        color: 'var(--cw-ink-muted)',
                        fontFamily: 'var(--cw-font-body)',
                        fontSize: 'var(--cw-fs-small)',
                        lineHeight: 1.6,
                      }}
                    >
                      <span
                        aria-hidden="true"
                        className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: 'var(--cw-primary)' }}
                      />
                      {bullet}
                    </li>
                  ))}
                </ul>
              )}

              {section.specs && section.specs.length > 0 && (
                <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  {section.specs.map((spec) => (
                    <div
                      key={spec.label}
                      className="flex justify-between gap-3 py-1.5"
                      style={{ borderBottom: '1px solid var(--cw-border)' }}
                    >
                      <dt
                        style={{
                          color: 'var(--cw-ink-subtle)',
                          fontFamily: 'var(--cw-font-body)',
                          fontSize: 'var(--cw-fs-micro)',
                        }}
                      >
                        {spec.label}
                      </dt>
                      <dd
                        style={{
                          margin: 0,
                          textAlign: 'right',
                          color: 'var(--cw-ink)',
                          fontFamily: 'var(--cw-font-body)',
                          fontSize: 'var(--cw-fs-micro)',
                          fontWeight: 600,
                        }}
                      >
                        {spec.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              {section.templates && section.templates.length > 0 && (
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {section.templates.map((template) => (
                    <li key={template.id}>
                      <a
                        href={template.url}
                        download
                        className="flex items-center gap-3 p-3 transition-colors hover:bg-neutral-50"
                        style={{
                          border: '1px solid var(--cw-border)',
                          borderRadius: 'var(--cw-radius-control)',
                          textDecoration: 'none',
                        }}
                      >
                        <span
                          className="flex h-9 w-9 flex-shrink-0 items-center justify-center"
                          style={{
                            backgroundColor: 'var(--cw-surface-alt)',
                            borderRadius: '6px',
                            color: 'var(--cw-ink-muted)',
                            fontFamily: 'var(--cw-font-body)',
                            fontSize: '10px',
                            fontWeight: 700,
                          }}
                        >
                          {template.fileType}
                        </span>
                        <span className="min-w-0">
                          <span
                            className="block"
                            style={{
                              color: 'var(--cw-ink)',
                              fontFamily: 'var(--cw-font-body)',
                              fontSize: 'var(--cw-fs-micro)',
                              fontWeight: 600,
                            }}
                          >
                            Download {template.label}
                          </span>
                          {template.description && (
                            <span
                              className="block"
                              style={{
                                color: 'var(--cw-ink-subtle)',
                                fontFamily: 'var(--cw-font-body)',
                                fontSize: '11px',
                              }}
                            >
                              {template.description}
                            </span>
                          )}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
};
