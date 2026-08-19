import React from 'react';
import type { ProductDescriptionBlock } from '@/types/custom-wear';

export interface ProductDescriptionProps {
  block?: ProductDescriptionBlock;
}

/**
 * Long-form product content. Every string comes from the product record, so no
 * two products share the same copy and it can move to a CMS unchanged.
 */
export const ProductDescription: React.FC<ProductDescriptionProps> = ({ block }) => {
  if (!block) return null;

  return (
    <section className="py-10" style={{ borderTop: '1px solid var(--cw-border)' }}>
      <h2
        style={{
          margin: '0 0 12px',
          maxWidth: '24ch',
          fontFamily: 'var(--cw-font-heading)',
          fontSize: 'var(--cw-fs-section)',
          fontWeight: 600,
          lineHeight: 1.2,
          letterSpacing: '-0.015em',
          color: 'var(--cw-ink)',
        }}
      >
        {block.heading}
      </h2>

      {block.intro && (
        <p
          style={{
            margin: '0 0 26px',
            maxWidth: '68ch',
            color: 'var(--cw-ink-muted)',
            fontFamily: 'var(--cw-font-body)',
            fontSize: 'var(--cw-fs-body)',
            lineHeight: 1.75,
          }}
        >
          {block.intro}
        </p>
      )}

      <div className="grid gap-8 md:grid-cols-2">
        {block.benefits && block.benefits.length > 0 && (
          <div>
            <h3
              className="uppercase"
              style={{
                margin: '0 0 12px',
                color: 'var(--cw-ink-subtle)',
                fontFamily: 'var(--cw-font-body)',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.14em',
              }}
            >
              Why this product
            </h3>
            <ul className="flex flex-col gap-2.5">
              {block.benefits.map((benefit) => (
                <li
                  key={benefit}
                  className="flex gap-3"
                  style={{
                    color: 'var(--cw-ink-muted)',
                    fontFamily: 'var(--cw-font-body)',
                    fontSize: 'var(--cw-fs-small)',
                    lineHeight: 1.65,
                  }}
                >
                  <svg
                    aria-hidden="true"
                    className="mt-[3px] h-4 w-4 flex-shrink-0"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="var(--cw-primary)"
                    strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4 10.5 4 4 8-9" />
                  </svg>
                  {benefit}
                </li>
              ))}
            </ul>
          </div>
        )}

        {block.useCases && block.useCases.length > 0 && (
          <div>
            <h3
              className="uppercase"
              style={{
                margin: '0 0 12px',
                color: 'var(--cw-ink-subtle)',
                fontFamily: 'var(--cw-font-body)',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.14em',
              }}
            >
              Commonly ordered for
            </h3>
            <ul className="flex flex-wrap gap-2">
              {block.useCases.map((useCase) => (
                <li
                  key={useCase}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: 'var(--cw-surface-alt)',
                    borderRadius: 'var(--cw-radius-chip)',
                    color: 'var(--cw-ink-muted)',
                    fontFamily: 'var(--cw-font-body)',
                    fontSize: 'var(--cw-fs-micro)',
                    fontWeight: 500,
                  }}
                >
                  {useCase}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
};
