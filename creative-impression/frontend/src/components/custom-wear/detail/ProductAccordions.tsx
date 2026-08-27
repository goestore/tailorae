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

  if (ordered.length === 0) return null;

  return (
    <div className="cw-acc">
      {ordered.map((section) => {
        const isOpen = openIds.includes(section.id);
        const panelId = `${baseId}-${section.id}`;

        return (
          <section key={section.id} className="cw-acc-item">
            <h3 className="cw-acc-h">
              <button
                suppressHydrationWarning
                type="button"
                onClick={() => toggle(section.id)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className="cw-acc-btn"
              >
                {section.title}
                <svg
                  aria-hidden="true"
                  className="cw-acc-caret"
                  data-open={isOpen ? 'true' : undefined}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
                </svg>
              </button>
            </h3>

            <div id={panelId} hidden={!isOpen} className="cw-acc-panel">
              {section.paragraphs?.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}

              {section.bullets && section.bullets.length > 0 && (
                <ul className="cw-acc-bullets">
                  {section.bullets.map((bullet, index) => (
                    <li key={index}>{bullet}</li>
                  ))}
                </ul>
              )}

              {section.specs && section.specs.length > 0 && (
                <dl className="cw-acc-specs">
                  {section.specs.map((spec) => (
                    <div key={spec.label}>
                      <dt>{spec.label}</dt>
                      <dd>{spec.value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {section.templates && section.templates.length > 0 && (
                <ul className="cw-acc-files">
                  {section.templates.map((template) => (
                    <li key={template.id}>
                      <a href={template.url} download>
                        <span className="cw-acc-file-type">{template.fileType}</span>
                        <span className="cw-acc-file-text">
                          <span className="cw-acc-file-name">Download {template.label}</span>
                          {template.description && <span>{template.description}</span>}
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
