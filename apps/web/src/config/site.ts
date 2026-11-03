/**
 * The store's fixed identity — the single place the brand name and contact
 * details are written down.
 *
 * Page titles get the name from the root layout's title template, so a page
 * sets only its own part ("Cart") and never repeats the brand. The admin can
 * still rename the store in Admin › Content › Brand; that value wins wherever
 * the content namespace is loaded (root metadata, header copy).
 *
 * Contact details come from the environment so a deployment can set them
 * without a code change. Phone and address render only when configured —
 * a placeholder number on a contact page is worse than none.
 */
export const SITE_NAME = 'TAILORAE';

export const SITE_TAGLINE = 'Fashion, tailored to you';

export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || 'support@tailorae.com';

export const SUPPORT_PHONE = process.env.NEXT_PUBLIC_SUPPORT_PHONE?.trim() || '';

/** Multi-line postal address; lines separated by `|` in the env value. */
export const SUPPORT_ADDRESS: string[] = (process.env.NEXT_PUBLIC_SUPPORT_ADDRESS ?? '')
  .split('|')
  .map((line) => line.trim())
  .filter(Boolean);
