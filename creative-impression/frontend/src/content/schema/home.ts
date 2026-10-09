import { HOME_SECTIONS } from '@/config/home-sections';
import { ICON_NAMES } from '@/components/common/Icon';
import { defineContent } from '../define';
import { field } from '../field';

/**
 * The home page.
 *
 * Three kinds of control live here, and they are deliberately different
 * shapes:
 *
 * `sections.order` decides which band comes after which.
 *
 * The `picks` fields decide which items a band shows and in what order. Each
 * defaults to an empty list, which means "not curated" — the band keeps
 * choosing automatically, so an untouched field never empties a section. The
 * moment one item is chosen the list becomes exact: those items, that order.
 *
 * Everything else is the copy and imagery around them.
 *
 * Every default reproduces what the page ships with, so resolving this against
 * an empty database renders today's home page.
 */
export const homeContent = defineContent('home', {
  sections: {
    order: field.order(HOME_SECTIONS, {
      label: 'Section order',
      help: 'The order bands appear down the page. Move a section and publish to change the live page.',
    }),
  },

  hero: {
    leftImage: field.image('/images/Female Model Neutral.webp', {
      label: 'Left banner image',
      help: 'Shown at the top left of the page. Upload a new one or choose from the library.',
    }),
    leftAlt: field.text('Creative Impression Female Model', {
      label: 'Left banner description',
      max: 200,
      help: 'Read aloud to anyone using a screen reader. Describe the picture, not the promotion.',
    }),
    leftHref: field.text('/products', {
      label: 'Left banner link',
      max: 200,
      optional: true,
      help: 'Where clicking the banner goes. Leave empty for no link.',
    }),
    leftEyebrow: field.text('', {
      label: 'Left banner kicker',
      max: 40,
      optional: true,
      help: 'The small line above the headline. Leave every copy field empty when the image already carries its own wording, which the banners uploaded today do — the overlay would print on top of it.',
    }),
    leftHeading: field.text('', {
      label: 'Left banner headline',
      max: 60,
      optional: true,
      help: 'Set this only for a plain photograph with no text baked into it.',
    }),
    leftCta: field.text('', {
      label: 'Left banner button',
      max: 30,
      optional: true,
      help: 'Only shown when the banner has a link and a headline.',
    }),
    rightImage: field.image('/images/Male Model Neutral.webp', {
      label: 'Right banner image',
    }),
    rightAlt: field.text('Creative Impression Male Model', {
      label: 'Right banner description',
      max: 200,
    }),
    rightHref: field.text('/b2b', {
      label: 'Right banner link',
      max: 200,
      optional: true,
    }),
    rightEyebrow: field.text('', {
      label: 'Right banner kicker',
      max: 40,
      optional: true,
    }),
    rightHeading: field.text('', {
      label: 'Right banner headline',
      max: 60,
      optional: true,
    }),
    rightCta: field.text('', {
      label: 'Right banner button',
      max: 30,
      optional: true,
    }),
  },

  bestSelling: {
    heading: field.text('BEST SELLING', { label: 'Heading', max: 60 }),
    picks: field.picker('products', {
      label: 'Products to show',
      max: 20,
      help: 'Pick the products and drag them into the order you want. Photos, names and prices come from the product itself, so editing a product updates this section.',
    }),
  },

  featured: {
    heading: field.text('Featured Products', { label: 'Heading', max: 60 }),
    picks: field.picker('products', {
      label: 'Products to show',
      max: 20,
      help: 'Leave empty to show whichever products are flagged as featured.',
    }),
  },

  whyChooseUs: {
    heading: field.text('Why Choose Creative Impression?', { label: 'Heading', max: 80 }),
    items: field.list(
      {
        title: field.text('', { label: 'Title', max: 60 }),
        description: field.textarea('', { label: 'Description', max: 300 }),
        icon: field.select(ICON_NAMES as [string, ...string[]], 'sparkle', {
          label: 'Icon',
          help: 'One of the line icons the site draws. An unknown name would render nothing.',
        }),
      },
      [
        {
          title: 'Premium Quality',
          description:
            'Highest quality fabrics and printing techniques for your custom apparel needs',
          icon: 'sparkle',
        },
        {
          title: 'Fast Delivery',
          description: 'Quick turnaround times with reliable shipping partners across India',
          icon: 'truck',
        },
        {
          title: 'Competitive Pricing',
          description: 'Best prices with bulk discounts, special offers, and wholesale pricing',
          icon: 'tag',
        },
        {
          title: 'Fashion Manufacturing',
          description:
            'Made Easy Design It. Choose It. Receive It. From sketches to finished products, we manage every step.',
          icon: 'sewing',
        },
      ],
      {
        label: 'Cards',
        max: 12,
        help: 'The cards run four to a row on a wide screen, so multiples of four sit best.',
      }
    ),
  },

  services: {
    heading: field.text('Our Services', { label: 'Heading', max: 80 }),
    items: field.list(
      {
        title: field.text('', { label: 'Title', max: 60 }),
        description: field.textarea('', { label: 'Description', max: 300 }),
        icon: field.select(ICON_NAMES as [string, ...string[]], 'printer', { label: 'Icon' }),
        href: field.text('/products', { label: 'Link', max: 200 }),
      },
      [
        {
          title: 'Custom Printing',
          description: 'Screen printing, DTG, embroidery, and heat transfer services',
          icon: 'printer',
          href: '/customization',
        },
        {
          title: 'B2B Wholesale',
          description: 'Bulk orders with special pricing for businesses and resellers',
          icon: 'building',
          href: '/b2b',
        },
        {
          title: 'Ready-to-Wear',
          description: 'Premium fashion apparel for retail customers',
          icon: 'tshirt',
          href: '/products',
        },
        {
          title: 'Design Services',
          description: 'Professional design assistance for your custom projects',
          icon: 'palette',
          href: '/b2b',
        },
      ],
      { label: 'Cards', max: 12 }
    ),
  },

  cta: {
    heading: field.text('Ready to Start Your Order?', { label: 'Heading', max: 80 }),
    body: field.textarea(
      'Join thousands of satisfied customers who trust Creative Impression for their fashion and printing needs.',
      { label: 'Body text', max: 300 }
    ),
    // Emptying a label is how a button is removed — `OrderCta` drops it — so
    // these must accept an empty string. Declared required, the value would be
    // rejected on the way in and the button would stubbornly reappear.
    primaryLabel: field.text('Shop Products', {
      label: 'Primary button',
      max: 40,
      optional: true,
      help: 'Leave empty to remove this button.',
    }),
    primaryHref: field.text('/products', { label: 'Primary button link', max: 200 }),
    secondaryLabel: field.text('Get Quote', {
      label: 'Secondary button',
      max: 40,
      optional: true,
      help: 'Leave empty to remove this button.',
    }),
    secondaryHref: field.text('/info/contact', { label: 'Secondary button link', max: 200 }),
  },

  categories: {
    // The tiles themselves (which categories, their order and images) are
    // set on each category in Admin › Categories › Homepage.
    heading: field.text('EXPLORE ALL CATEGORIES', { label: 'Heading', max: 60 }),
  },
});

export type HomeContent = typeof homeContent.defaults;
