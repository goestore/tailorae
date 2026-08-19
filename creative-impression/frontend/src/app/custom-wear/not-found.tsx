import Link from 'next/link';
import { CUSTOM_WEAR_CATEGORY_GROUPS, categoryHref } from '@/config/custom-wear/taxonomy';
import { CustomWearThemeProvider } from '@/components/custom-wear';

/** Shown for unknown genders, categories and product slugs under /custom-wear. */
export default function CustomWearNotFound() {
  return (
    <CustomWearThemeProvider>
      <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-20 text-center">
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--cw-font-heading)',
            fontSize: 'var(--cw-fs-section)',
            fontWeight: 600,
            color: 'var(--cw-ink)',
          }}
        >
          We could not find that Custom Wear page
        </h1>
        <p
          style={{
            margin: '12px 0 24px',
            color: 'var(--cw-ink-muted)',
            fontFamily: 'var(--cw-font-body)',
            fontSize: 'var(--cw-fs-small)',
            lineHeight: 1.6,
          }}
        >
          The link may be out of date. Start from a category below, or browse everything.
        </p>

        <Link href="/custom-wear" className="cw-cta cw-cta--accent mb-8">
          All Custom Wear
        </Link>

        <div className="flex flex-wrap justify-center gap-2">
          {CUSTOM_WEAR_CATEGORY_GROUPS.flatMap((group) =>
            group.categories.slice(0, 3).map((category) => (
              <Link
                key={category.id}
                href={categoryHref(category)}
                className="transition-colors hover:bg-neutral-100"
                style={{
                  fontFamily: 'var(--cw-font-body)',
                  fontSize: 'var(--cw-fs-micro)',
                  fontWeight: 600,
                  color: 'var(--cw-ink-muted)',
                  border: '1px solid var(--cw-border)',
                  borderRadius: 'var(--cw-radius-chip)',
                  padding: '8px 12px',
                }}
              >
                {group.label} {category.label}
              </Link>
            ))
          )}
        </div>
      </div>
    </CustomWearThemeProvider>
  );
}
