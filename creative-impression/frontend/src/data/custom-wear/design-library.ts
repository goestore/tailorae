/**
 * Starter design library shown by "Browse Designs".
 *
 * Templates are described as data (not image files) so the modal renders them
 * as inline SVG at any size, and so the future canvas editor can consume the
 * same records. Replace this array with a CMS/design-service fetch later.
 */

import type { DesignTemplate, DesignTemplateCategory } from '@/types/custom-wear';

export const DESIGN_TEMPLATE_CATEGORIES: DesignTemplateCategory[] = [
  { id: 'all', label: 'All Designs' },
  { id: 'industry', label: 'Industry' },
  { id: 'text', label: 'Text & Wordmarks' },
  { id: 'logos', label: 'Logo Frames' },
  { id: 'icons', label: 'Icons' },
  { id: 'graphics', label: 'Graphics' },
];

export const DESIGN_TEMPLATES: DesignTemplate[] = [
  {
    id: 'tpl-corporate-monogram',
    name: 'Corporate Monogram',
    categoryId: 'logos',
    tags: ['corporate', 'monogram', 'left chest'],
    artwork: { kind: 'monogram', primary: 'CI', color: '#111111', background: '#F5F5F5' },
  },
  {
    id: 'tpl-circle-crest',
    name: 'Circle Crest',
    categoryId: 'logos',
    tags: ['crest', 'school', 'club'],
    artwork: { kind: 'badge', primary: 'EST', secondary: '2026', color: '#FFFFFF', background: '#1B2A4A' },
  },
  {
    id: 'tpl-team-wordmark',
    name: 'Team Wordmark',
    categoryId: 'text',
    tags: ['team', 'sports', 'full front'],
    artwork: { kind: 'wordmark', primary: 'TEAM', secondary: 'SQUAD 01', color: '#111111', background: '#FBB602' },
  },
  {
    id: 'tpl-staff-badge',
    name: 'Staff Badge',
    categoryId: 'industry',
    tags: ['events', 'hospitality', 'staff'],
    artwork: { kind: 'badge', primary: 'STAFF', color: '#FFFFFF', background: '#111111' },
  },
  {
    id: 'tpl-construction-hi-vis',
    name: 'Site Safety Mark',
    categoryId: 'industry',
    tags: ['construction', 'safety', 'back print'],
    artwork: { kind: 'wordmark', primary: 'SITE CREW', secondary: 'SAFETY FIRST', color: '#111111', background: '#FBB602' },
  },
  {
    id: 'tpl-cafe-roundel',
    name: 'Café Roundel',
    categoryId: 'industry',
    tags: ['hospitality', 'café', 'roundel'],
    artwork: { kind: 'badge', primary: 'CAFÉ', secondary: 'SINCE 2019', color: '#FFFFFF', background: '#6B1B26' },
  },
  {
    id: 'tpl-clinic-cross',
    name: 'Clinic Mark',
    categoryId: 'industry',
    tags: ['healthcare', 'clinic', 'left chest'],
    artwork: { kind: 'icon', primary: 'cross', color: '#FFFFFF', background: '#1B7F4B' },
  },
  {
    id: 'tpl-event-year',
    name: 'Event Year Stamp',
    categoryId: 'text',
    tags: ['event', 'year', 'centre front'],
    artwork: { kind: 'wordmark', primary: 'ANNUAL', secondary: 'MEET 2026', color: '#FFFFFF', background: '#1E4FD8' },
  },
  {
    id: 'tpl-initials-stack',
    name: 'Stacked Initials',
    categoryId: 'text',
    tags: ['monogram', 'minimal'],
    artwork: { kind: 'monogram', primary: 'AB', color: '#FFFFFF', background: '#111111' },
  },
  {
    id: 'tpl-mountain-icon',
    name: 'Mountain Icon',
    categoryId: 'icons',
    tags: ['outdoor', 'adventure', 'icon'],
    artwork: { kind: 'icon', primary: 'mountain', color: '#FFFFFF', background: '#0F4034' },
  },
  {
    id: 'tpl-bolt-icon',
    name: 'Energy Bolt',
    categoryId: 'icons',
    tags: ['sports', 'energy', 'icon'],
    artwork: { kind: 'icon', primary: 'bolt', color: '#111111', background: '#FBB602' },
  },
  {
    id: 'tpl-shield-icon',
    name: 'Shield Mark',
    categoryId: 'icons',
    tags: ['security', 'club', 'icon'],
    artwork: { kind: 'icon', primary: 'shield', color: '#FFFFFF', background: '#1B2A4A' },
  },
  {
    id: 'tpl-stripe-band',
    name: 'Stripe Band',
    categoryId: 'graphics',
    tags: ['graphic', 'band', 'sleeve'],
    artwork: { kind: 'wordmark', primary: '///', secondary: 'BAND', color: '#111111', background: '#E5E5E5' },
  },
  {
    id: 'tpl-arch-text',
    name: 'Arched Text',
    categoryId: 'graphics',
    tags: ['graphic', 'arch', 'upper back'],
    artwork: { kind: 'wordmark', primary: 'ESTABLISHED', secondary: 'QUALITY', color: '#FFFFFF', background: '#6B3FA0' },
  },
  {
    id: 'tpl-number-set',
    name: 'Player Number Set',
    categoryId: 'graphics',
    tags: ['sports', 'numbers', 'full back'],
    artwork: { kind: 'monogram', primary: '10', color: '#FFFFFF', background: '#C7262C' },
  },
  {
    id: 'tpl-retail-tagline',
    name: 'Retail Tagline',
    categoryId: 'text',
    tags: ['retail', 'tagline', 'centre front'],
    artwork: { kind: 'wordmark', primary: 'MADE TO', secondary: 'ORDER', color: '#111111', background: '#DCCDB4' },
  },
];

export const getDesignTemplateById = (id: string): DesignTemplate | undefined =>
  DESIGN_TEMPLATES.find((template) => template.id === id);
