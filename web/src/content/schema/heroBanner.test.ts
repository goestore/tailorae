import { describe, expect, it } from 'vitest';
import { homeContent } from './home';

describe('home hero layout', () => {
  it('defaults to two banners', () => {
    expect(homeContent.defaults.hero.layout).toBe('double');
  });

  it('accepts only the two layouts', () => {
    expect(homeContent.validateWrite('/hero/layout', 'single')).toEqual({ ok: true });
    expect(homeContent.validateWrite('/hero/layout', 'triple')).toMatchObject({ ok: false });
  });

  it('labels the layouts for the admin dropdown', () => {
    expect(homeContent.fieldAt('/hero/layout')?.optionLabels).toEqual({
      double: 'Two banners side by side',
      single: 'One full-width banner',
    });
  });
});
