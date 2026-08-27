import { describe, expect, it, vi } from 'vitest';
import { defineContent } from './define';
import { field } from './field';
import { parseStoredValues, resolveContent } from './resolve';
import { brandContent } from './schema/brand';

const demo = defineContent('demo', {
  hero: {
    heading: field.text('Default heading', { max: 20 }),
    align: field.select(['left', 'center'] as const, 'left'),
  },
  theme: {
    brand: field.color('#FBB602'),
    speed: field.number(32, { min: 8, max: 120 }),
  },
});

describe('defineContent', () => {
  it('derives defaults matching the schema shape', () => {
    expect(demo.defaults).toEqual({
      hero: { heading: 'Default heading', align: 'left' },
      theme: { brand: '#FBB602', speed: 32 },
    });
  });

  it('flattens every field into an addressable path', () => {
    expect(demo.paths.map((p) => p.address).sort()).toEqual([
      'demo#/hero/align',
      'demo#/hero/heading',
      'demo#/theme/brand',
      'demo#/theme/speed',
    ]);
  });

  it('builds a human trail for the admin', () => {
    const heading = demo.paths.find((p) => p.path === '/hero/heading');
    expect(heading?.trail).toEqual(['Hero', 'Heading']);
  });

  // The allowlist is the security boundary: a write to a path the schema does
  // not declare must be refused, not stored for something to read later.
  it('rejects writes to unknown paths', () => {
    expect(demo.validateWrite('/hero/nope', 'x')).toEqual({
      ok: false,
      reason: 'Unknown content path: /hero/nope',
    });
  });

  it('rejects values that fail the field validator', () => {
    expect(demo.validateWrite('/hero/heading', '')).toMatchObject({ ok: false });
    expect(demo.validateWrite('/hero/heading', 'x'.repeat(21))).toMatchObject({ ok: false });
    expect(demo.validateWrite('/hero/align', 'diagonal')).toMatchObject({ ok: false });
    expect(demo.validateWrite('/theme/brand', 'red')).toMatchObject({ ok: false });
    expect(demo.validateWrite('/theme/speed', 500)).toMatchObject({ ok: false });
  });

  it('accepts valid writes', () => {
    expect(demo.validateWrite('/hero/heading', 'New')).toEqual({ ok: true });
    expect(demo.validateWrite('/theme/brand', '#fff')).toEqual({ ok: true });
  });
});

describe('resolveContent', () => {
  it('returns defaults when nothing is published', () => {
    expect(resolveContent(demo)).toEqual(demo.defaults);
  });

  it('applies published values over defaults', () => {
    const result = resolveContent(demo, {
      values: [{ path: '/hero/heading', value: 'Published' }],
    });
    expect(result.hero.heading).toBe('Published');
    expect(result.hero.align).toBe('left');
  });

  it('applies draft on top of published', () => {
    const result = resolveContent(demo, {
      values: [{ path: '/hero/heading', value: 'Published' }],
      draft: [{ path: '/hero/heading', value: 'Draft' }],
    });
    expect(result.hero.heading).toBe('Draft');
  });

  // A bad publish must cost one field, not the page.
  it('drops invalid values and keeps the default', () => {
    const onReject = vi.fn();
    const result = resolveContent(demo, {
      values: [
        { path: '/hero/heading', value: 'x'.repeat(50) },
        { path: '/theme/brand', value: '#123456' },
      ],
      onReject,
    });
    expect(result.hero.heading).toBe('Default heading');
    expect(result.theme.brand).toBe('#123456');
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('drops values for paths the schema no longer has', () => {
    const onReject = vi.fn();
    const result = resolveContent(demo, {
      values: [{ path: '/hero/removedField', value: 'x' }],
      onReject,
    });
    expect(result).toEqual(demo.defaults);
    expect(onReject).toHaveBeenCalledWith('/hero/removedField', expect.stringContaining('Unknown'));
  });

  it('never mutates the compiled defaults', () => {
    resolveContent(demo, { values: [{ path: '/hero/heading', value: 'Mutated' }] });
    expect(demo.defaults.hero.heading).toBe('Default heading');
  });
});

describe('parseStoredValues', () => {
  it('returns null for missing or corrupt JSON', () => {
    expect(parseStoredValues(null)).toBeNull();
    expect(parseStoredValues('')).toBeNull();
    expect(parseStoredValues('{ truncated')).toBeNull();
    expect(parseStoredValues('{"not":"an array"}')).toBeNull();
  });

  it('keeps only entries that carry a path', () => {
    expect(parseStoredValues('[{"path":"/a","value":1},{"value":2}]')).toEqual([
      { path: '/a', value: 1 },
    ]);
  });
});

describe('brand namespace', () => {
  // Defaults must reproduce today's storefront, or moving content out of code
  // silently changes the site.
  it('defaults to the shipped announcement and brand colour', () => {
    const resolved = resolveContent(brandContent);
    expect(resolved.theme.brand).toBe('#FBB602');
    expect(resolved.announcement.message).toContain('FREE SHIPPING ON ORDERS OVER ₹999');
    expect(resolved.identity.name).toBe('Creative Impression');
  });

  it('exposes every value as an editable path', () => {
    const addresses = brandContent.paths.map((p) => p.path);
    expect(addresses).toContain('/announcement/message');
    expect(addresses).toContain('/theme/brand');
    expect(addresses).toContain('/layout/gutter');
    expect(brandContent.paths.length).toBeGreaterThan(10);
  });
});
