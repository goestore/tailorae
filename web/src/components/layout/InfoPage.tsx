import React, { type ReactNode } from 'react';
import { Breadcrumbs, type Crumb } from '@/components/common/Breadcrumbs';

export interface InfoSection {
  title: string;
  content: ReactNode;
}

export interface InfoPageProps {
  title: string;
  subtitle?: string;
  /** e.g. "June 2026" — shown under the title on policy pages. */
  updated?: string;
  sections?: InfoSection[];
  breadcrumbs?: Crumb[];
  children?: ReactNode;
}

/**
 * The shared shell for policy, help and reference pages.
 *
 * Every one of these is the same shape — a title, a date, and a stack of
 * headed prose — so they share one component rather than ten near-copies that
 * drift apart the first time the spacing is adjusted. The site footer comes
 * from `SiteFrame`, so this deliberately does not render one.
 */
export const InfoPage: React.FC<InfoPageProps> = ({
  title,
  subtitle,
  updated,
  sections = [],
  breadcrumbs,
  children,
}) => {
  const crumbs = breadcrumbs ?? [{ label: 'Home', href: '/' }, { label: title }];

  return (
    <main className="section-y">
      <div className="container-max">
        <div className="mx-auto" style={{ maxWidth: '840px' }}>
          <Breadcrumbs items={crumbs} />

          <header className="mt-6 border-b border-line pb-8">
            <h1
              className="m-0 text-ink"
              style={{ fontSize: 'clamp(30px, 4.5vw, 48px)', lineHeight: 1.05, letterSpacing: '-0.03em' }}
            >
              {title}
            </h1>
            {subtitle && (
              <p className="mt-3 max-w-[60ch] text-lg" style={{ color: 'var(--ink-2)' }}>
                {subtitle}
              </p>
            )}
            {updated && (
              <p className="mt-4 text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--ink-3)' }}>
                Last updated: {updated}
              </p>
            )}
          </header>

          {sections.length > 0 && (
            <div className="mt-10 flex flex-col gap-9">
              {sections.map((section) => (
                <section key={section.title}>
                  <h2
                    className="m-0 text-ink"
                    style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-0.01em' }}
                  >
                    {section.title}
                  </h2>
                  <div
                    className="mt-3 flex flex-col gap-3 text-[15px]"
                    style={{ color: 'var(--ink-2)', lineHeight: 1.7 }}
                  >
                    {section.content}
                  </div>
                </section>
              ))}
            </div>
          )}

          {children && <div className="mt-10">{children}</div>}
        </div>
      </div>
    </main>
  );
};
