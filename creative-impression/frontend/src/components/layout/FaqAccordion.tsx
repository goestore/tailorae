'use client';

import React, { useState } from 'react';

export interface FaqItem {
  q: string;
  a: string;
}

/**
 * One answer open at a time. The first is open on load so the page never reads
 * as an empty list of headings.
 */
export const FaqAccordion: React.FC<{ items: FaqItem[] }> = ({ items }) => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="border-t border-line">
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        const panelId = `faq-panel-${index}`;
        return (
          <div key={item.q} className="border-b border-line">
            <h3 className="m-0">
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : index)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className="flex w-full items-center justify-between gap-4 py-4 text-left text-[15px] font-medium text-ink transition-colors hover:text-[var(--brand-700)]"
              >
                <span>{item.q}</span>
                <span
                  aria-hidden="true"
                  className="shrink-0 text-lg leading-none"
                  style={{ color: 'var(--ink-3)' }}
                >
                  {isOpen ? '−' : '+'}
                </span>
              </button>
            </h3>
            {isOpen && (
              <div
                id={panelId}
                className="max-w-[68ch] pb-5 text-[14.5px]"
                style={{ color: 'var(--ink-2)', lineHeight: 1.7 }}
              >
                {item.a}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
