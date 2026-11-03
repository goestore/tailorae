import { COLOUR_FAMILIES, canonicalFamily, suggestFamily } from './colour-families';

const fam = (name: string, hex?: string) => suggestFamily(name, hex)?.name ?? null;

describe('colour families', () => {
  it('has unique slugs', () => {
    const slugs = COLOUR_FAMILIES.map((f) => f.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('reads any spelling of a family name', () => {
    for (const value of ['Navy Blue', 'navy blue', ' NAVY  BLUE ', 'navy-blue', 'Navyblue']) {
      expect(canonicalFamily(value)?.name).toBe('Navy Blue');
    }
    expect(canonicalFamily('Off-White')?.name).toBe('Off White');
    expect(canonicalFamily('grey melange')?.name).toBe('Grey Melange');
    expect(canonicalFamily('not a colour')).toBeNull();
  });

  it('maps everyday and trade names', () => {
    expect(fam('Navy')).toBe('Navy Blue');
    expect(fam('Wine')).toBe('Burgundy');
    expect(fam('Mehendi')).toBe('Olive');
    expect(fam('Ivory')).toBe('Off White');
    expect(fam('Rani Pink')).toBe('Magenta');
    expect(fam('Multicolour')).toBe('Multi');
    expect(fam('Gray')).toBe('Grey');
  });

  it('finds the colour noun inside a descriptive name', () => {
    expect(fam('Dusty Rose')).toBe('Rose');
    expect(fam('Bottle Green')).toBe('Green');
    expect(fam('Dark Navy Blue')).toBe('Navy Blue');
    expect(fam('Pastel Peach Floral')).toBe('Peach');
  });

  it('forgives one typo', () => {
    expect(fam('Mroon')).toBe('Maroon');
    expect(fam('Purpel')).toBe('Purple');
    expect(fam('Nevy Blue')).toBe('Navy Blue');
    expect(fam('Lavendar')).toBe('Lavender');
    expect(fam('Dusty Rse')).toBe('Rose');
    expect(fam('Tab')).toBeNull();
  });

  it('treats two colours as Multi', () => {
    expect(fam('Black & Purple')).toBe('Multi');
    expect(fam('Pink and Blue')).toBe('Multi');
  });

  it('falls back to the nearest family to the swatch', () => {
    expect(fam('Sunset Glow', '#C62929')).toBe('Red');
    expect(fam('Ocean', '#1F2A45')).toBe('Navy Blue');
    expect(fam('Ocean')).toBeNull();
  });
});
