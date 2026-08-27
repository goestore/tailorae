import React from 'react';
import type { ProductDescriptionBlock } from '@/types/custom-wear';

export interface ProductDescriptionProps {
  block?: ProductDescriptionBlock;
  highlights?: string[];
}

/**
 * Long-form product content. Every string comes from the product record, so no
 * two products share the same copy and it can move to a CMS unchanged.
 */
export const ProductDescription: React.FC<ProductDescriptionProps> = ({ block, highlights }) => {
  if (!block) return null;

  const benefits = block.benefits?.length ? block.benefits : highlights;

  return (
    <section className="cw-desc">
      <h2>{block.heading}</h2>
      {block.intro && <p className="cw-desc-intro">{block.intro}</p>}

      <div className="cw-desc-cols">
        {benefits && benefits.length > 0 && (
          <div>
            <h3 className="cw-eyebrow">Why this product</h3>
            <ul className="cw-desc-benefits">
              {benefits.map((benefit) => (
                <li key={benefit}>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
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
            <h3 className="cw-eyebrow">Commonly ordered for</h3>
            <ul className="cw-desc-uses">
              {block.useCases.map((useCase) => (
                <li key={useCase}>{useCase}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
};
