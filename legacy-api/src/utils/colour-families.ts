/**
 * Colour families: the one fixed list every filter uses.
 *
 * A seller's colour name is free text ("Dusty Rose", "navy", "Nevy Blue",
 * "Black & Purple"). Filtering on that splits one colour into many chips and
 * misses typos. Instead each colour is also filed under a family from this
 * list — Myntra's own "prominent colour" values, so a listing exports cleanly —
 * and the storefront filters on the family only. The name stays for display.
 */

export interface ColourFamily {
  name: string;
  slug: string;
  /** Canonical swatch, used when the seller has not picked their own shade. */
  hex: string;
}

const FAMILY_HEX: Array<[string, string]> = [
  ['Black', '#1A1A1A'],
  ['White', '#F8F8F8'],
  ['Off White', '#F2EEE3'],
  ['Cream', '#F3E5C0'],
  ['Beige', '#D9C4A3'],
  ['Nude', '#E3BC9A'],
  ['Grey', '#8C8C8C'],
  ['Grey Melange', '#A9A9A9'],
  ['Charcoal', '#3E4144'],
  ['Silver', '#C0C0C0'],
  ['Steel', '#71797E'],
  ['Navy Blue', '#1F2A44'],
  ['Blue', '#2F5DA8'],
  ['Turquoise Blue', '#2BB3C0'],
  ['Teal', '#1F7A7A'],
  ['Sea Green', '#2E8B57'],
  ['Green', '#2E7D4F'],
  ['Lime Green', '#7CC242'],
  ['Fluorescent Green', '#39FF14'],
  ['Olive', '#6B6B2E'],
  ['Khaki', '#B5A36A'],
  ['Yellow', '#E9B600'],
  ['Mustard', '#C99A2E'],
  ['Gold', '#C9A227'],
  ['Champagne', '#E8D3A9'],
  ['Orange', '#E0702B'],
  ['Coral', '#F27A6B'],
  ['Peach', '#F6B89A'],
  ['Rust', '#B7472A'],
  ['Copper', '#B8733B'],
  ['Bronze', '#8C6A3C'],
  ['Red', '#C62828'],
  ['Maroon', '#6D1B2A'],
  ['Burgundy', '#7A1F3D'],
  ['Pink', '#F28AB2'],
  ['Rose', '#E07A93'],
  ['Rose Gold', '#C9897B'],
  ['Fuchsia', '#D6337F'],
  ['Magenta', '#C2185B'],
  ['Mauve', '#B784A7'],
  ['Lavender', '#B9A6DE'],
  ['Violet', '#7F4FC9'],
  ['Purple', '#6A3D9A'],
  ['Brown', '#7B4A2A'],
  ['Coffee Brown', '#5B3A29'],
  ['Camel Brown', '#B5875A'],
  ['Tan', '#C19A6B'],
  ['Taupe', '#8B7D6B'],
  ['Metallic', '#A8A9AD'],
  ['Transparent', '#EDEDED'],
  ['Multi', '#9E9E9E'],
];

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const COLOUR_FAMILIES: ColourFamily[] = FAMILY_HEX.map(([name, hex]) => ({
  name,
  slug: slugify(name),
  hex,
}));

/** Loose key: case, spaces, punctuation and "colour/color" suffixes ignored. */
const norm = (value: string): string =>
  value
    .toLowerCase()
    .replace(/colou?r(ed)?/g, '')
    .replace(/[^a-z]/g, '');

const BY_KEY = new Map<string, ColourFamily>();
for (const family of COLOUR_FAMILIES) {
  BY_KEY.set(norm(family.name), family);
  BY_KEY.set(family.slug, family);
}

/**
 * Everyday and Indian trade names for the families. Matching is on the loose
 * key, so "Off-White", "offwhite" and "OFF WHITE" are one entry.
 */
const ALIASES: Record<string, string> = {
  navy: 'Navy Blue', nevy: 'Navy Blue', navyblue: 'Navy Blue', midnight: 'Navy Blue', ink: 'Navy Blue',
  sky: 'Blue', skyblue: 'Blue', royal: 'Blue', royalblue: 'Blue', denim: 'Blue', indigo: 'Blue',
  cobalt: 'Blue', powderblue: 'Blue', babyblue: 'Blue', lightblue: 'Blue', darkblue: 'Navy Blue',
  aqua: 'Turquoise Blue', turquoise: 'Turquoise Blue', cyan: 'Turquoise Blue', ferozi: 'Turquoise Blue',
  peacock: 'Teal', petrol: 'Teal',
  mint: 'Sea Green', seagreen: 'Sea Green', emerald: 'Green', bottlegreen: 'Green', forest: 'Green',
  parrot: 'Lime Green', parrotgreen: 'Lime Green', lime: 'Lime Green', neon: 'Fluorescent Green', neongreen: 'Fluorescent Green',
  mehendi: 'Olive', mehndi: 'Olive', armygreen: 'Olive', military: 'Olive',
  ivory: 'Off White', offwhite: 'Off White', ecru: 'Off White', pearl: 'Off White',
  milk: 'White', snow: 'White',
  sand: 'Beige', fawn: 'Beige', skin: 'Nude',
  ash: 'Grey', gray: 'Grey', lightgrey: 'Grey', greymelange: 'Grey Melange', melange: 'Grey Melange',
  slate: 'Charcoal', darkgrey: 'Charcoal', jetblack: 'Black', onyx: 'Black',
  lemon: 'Yellow', haldi: 'Mustard', ochre: 'Mustard',
  saffron: 'Orange', tangerine: 'Orange', kesari: 'Orange',
  salmon: 'Coral', apricot: 'Peach',
  wine: 'Burgundy', plum: 'Burgundy', oxblood: 'Burgundy', crimson: 'Red', scarlet: 'Red', cherry: 'Red', brick: 'Rust',
  rani: 'Magenta', ranipink: 'Magenta', hotpink: 'Fuchsia', babypink: 'Pink', blush: 'Pink', dustyrose: 'Rose',
  onion: 'Mauve', onionpink: 'Mauve', lilac: 'Lavender', orchid: 'Violet', jamun: 'Purple', grape: 'Purple', aubergine: 'Purple',
  chocolate: 'Coffee Brown', coffee: 'Coffee Brown', mocha: 'Coffee Brown', walnut: 'Brown', camel: 'Camel Brown', caramel: 'Camel Brown',
  golden: 'Gold', silvery: 'Silver',
  multi: 'Multi', multicolor: 'Multi', multicolour: 'Multi', assorted: 'Multi', printed: 'Multi', rainbow: 'Multi',
};
const ALIAS_KEY = new Map(Object.entries(ALIASES).map(([alias, name]) => [norm(alias), name]));

export function familyByName(name: string | null | undefined): ColourFamily | null {
  if (!name) return null;
  const key = norm(name);
  return BY_KEY.get(key) ?? BY_KEY.get(slugify(name)) ?? null;
}

/**
 * The family a stored value means, tolerating case, spacing and the aliases
 * above. Used to validate a seller's pick and to read old filter URLs.
 */
export function canonicalFamily(value: string | null | undefined): ColourFamily | null {
  if (!value) return null;
  const direct = familyByName(value);
  if (direct) return direct;
  const alias = ALIAS_KEY.get(norm(value));
  return alias ? familyByName(alias) : null;
}

/** One-character edits apart: catches "Mroon", "Purpel", "Beig". */
function closeEnough(a: string, b: string): boolean {
  // Both sides at least three letters, so "tan" never matches "tab" by accident
  // of being short, while a dropped letter in "Rse" still finds Rose.
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 3 || Math.max(a.length, b.length) < 4) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else if (a[i + 1] === b[j] && a[i] === b[j + 1]) {
      i += 2;
      j += 2;
    } else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Best family for a seller's colour name, and their chosen swatch if any.
 * Order: the whole name, then each word from the last (the noun in "Dusty
 * Rose", "Bottle Green"), allowing one typo; two or more distinct families in
 * the name ("Black & Purple") make it Multi; failing all that, the family
 * nearest the swatch. Null when nothing is a reasonable guess.
 */
export function suggestFamily(name: string | null | undefined, hex?: string | null): ColourFamily | null {
  const whole = canonicalFamily(name ?? '');
  if (whole) return whole;

  const words = (name ?? '')
    .split(/[^a-zA-Z]+/)
    .map((w) => w.trim())
    .filter(Boolean);
  const found: ColourFamily[] = [];
  // Two-word families first ("Navy Blue" inside "Dark Navy Blue Check").
  for (let i = 0; i < words.length - 1; i++) {
    const pair = canonicalFamily(`${words[i]} ${words[i + 1]}`);
    if (pair && !found.includes(pair)) found.push(pair);
  }
  for (const word of [...words].reverse()) {
    let family = canonicalFamily(word);
    if (!family) {
      const key = norm(word);
      const near =
        COLOUR_FAMILIES.find((f) => closeEnough(key, norm(f.name))) ??
        [...ALIAS_KEY.entries()].find(([alias]) => closeEnough(key, alias));
      family = near ? ('slug' in near ? near : familyByName(near[1])) : null;
    }
    if (family && !found.some((f) => f.slug === family!.slug)) found.push(family);
  }
  // "Navy Blue" also contains "Blue": a family wholly inside a longer one found
  // in the same name is not a second colour.
  const distinct = found.filter(
    (f) => !found.some((g) => g !== f && norm(g.name).includes(norm(f.name)))
  );
  if (distinct.length === 1) return distinct[0];
  if (distinct.length > 1) return familyByName('Multi');

  const rgb = hex ? hexToRgb(hex) : null;
  if (!rgb) return null;
  let best: ColourFamily | null = null;
  let bestDistance = Infinity;
  for (const family of COLOUR_FAMILIES) {
    if (family.name === 'Multi' || family.name === 'Transparent' || family.name === 'Metallic') continue;
    const [r, g, b] = hexToRgb(family.hex)!;
    // Weighted RGB distance — close enough to perception for picking a family.
    const d = 2 * (r - rgb[0]) ** 2 + 4 * (g - rgb[1]) ** 2 + 3 * (b - rgb[2]) ** 2;
    if (d < bestDistance) {
      bestDistance = d;
      best = family;
    }
  }
  return best;
}
