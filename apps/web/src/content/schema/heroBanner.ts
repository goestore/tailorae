import { field } from '../field';

export const HERO_LAYOUTS = ['double', 'single'] as const;
export type HeroLayout = (typeof HERO_LAYOUTS)[number];

interface PanelDefaults {
  image: string;
  alt: string;
  href: string;
}

/**
 * The banner block at the top of a page, as one reusable field group, so every
 * page that carries a hero gets the same layout switch and the same fields.
 *
 * `layout` sits first because it decides the shape the uploads are cropped to:
 * pick it before choosing images. The panel keys stay `left*` / `right*` in both
 * layouts — the one-banner layout simply uses the first panel — so switching the
 * layout back and forth never loses what was uploaded for the second banner.
 */
export const heroBannerFields = (defaults: {
  layout: HeroLayout;
  left: PanelDefaults;
  right: PanelDefaults;
}) => ({
  layout: field.select(HERO_LAYOUTS, defaults.layout, {
    label: 'Banner layout',
    optionLabels: { double: 'Two banners side by side', single: 'One full-width banner' },
    help: 'Two banners: upload each at 1500 × 1000 px (3:2). One banner: upload 2400 × 900 px (8:3). Phones crop both, so keep the subject near the centre.',
  }),
  leftImage: field.image(defaults.left.image, {
    label: 'First banner image',
    help: 'On the left in the two-banner layout, the whole width in the one-banner layout. Upload a new one or choose from the library.',
  }),
  leftAlt: field.text(defaults.left.alt, {
    label: 'First banner description',
    max: 200,
    help: 'Read aloud to anyone using a screen reader. Describe the picture, not the promotion.',
  }),
  leftHref: field.text(defaults.left.href, {
    label: 'First banner link',
    max: 200,
    optional: true,
    help: 'Where clicking the banner goes. Leave empty for no link.',
  }),
  leftEyebrow: field.text('', {
    label: 'First banner kicker',
    max: 40,
    optional: true,
    help: 'The small line above the headline. Leave every copy field empty when the image already carries its own wording — the overlay would print on top of it.',
  }),
  leftHeading: field.text('', {
    label: 'First banner headline',
    max: 60,
    optional: true,
    help: 'Set this only for a plain photograph with no text baked into it.',
  }),
  leftCta: field.text('', {
    label: 'First banner button',
    max: 30,
    optional: true,
    help: 'Only shown when the banner has a link and a headline.',
  }),
  rightImage: field.image(defaults.right.image, {
    label: 'Second banner image',
    help: 'Only shown in the two-banner layout.',
  }),
  rightAlt: field.text(defaults.right.alt, {
    label: 'Second banner description',
    max: 200,
  }),
  rightHref: field.text(defaults.right.href, {
    label: 'Second banner link',
    max: 200,
    optional: true,
  }),
  rightEyebrow: field.text('', {
    label: 'Second banner kicker',
    max: 40,
    optional: true,
  }),
  rightHeading: field.text('', {
    label: 'Second banner headline',
    max: 60,
    optional: true,
  }),
  rightCta: field.text('', {
    label: 'Second banner button',
    max: 30,
    optional: true,
  }),
});
