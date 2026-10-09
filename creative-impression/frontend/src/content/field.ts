/**
 * Field primitives for the content registry.
 *
 * A field declares one editable value: its type, its default, how it is
 * labelled in the admin, and what counts as a valid write. Declaring it once
 * yields the storefront's types, the admin form, the write validator and the
 * field's address — so "everything is editable" is a property of the registry
 * rather than a claim about how thorough someone was.
 */

export type FieldKind =
  | 'text'
  | 'textarea'
  | 'number'
  | 'boolean'
  | 'select'
  | 'color'
  | 'image'
  | 'length'
  | 'order'
  | 'picker'
  | 'list';

export interface FieldMeta<T> {
  readonly kind: FieldKind;
  /** Value used when nothing is published — today's hardcoded content. */
  readonly defaultValue: T;
  /** Admin label. Falls back to a humanised path segment. */
  readonly label?: string;
  /** Shown under the input; use it for the "why", not to restate the label. */
  readonly help?: string;
  /** Options for `select`; the full set of ids for `order`. */
  readonly options?: readonly string[];
  /** Human labels for `options`, keyed by id. Used by `order`. */
  readonly optionLabels?: Readonly<Record<string, string>>;
  /**
   * Where a `picker` gets its choices. The admin resolves this to a fetch; the
   * registry deliberately knows only the name, because the catalog lives in the
   * database and cannot be enumerated at build time.
   */
  readonly source?: PickerSource;
  /**
   * The shape of one entry in a `list`. Each key is a field, so an item is
   * validated and rendered by the same machinery as a top-level value.
   */
  readonly itemFields?: ListItemFields;
  readonly min?: number;
  readonly max?: number;
  /**
   * Never sent to the storefront. For values that are operationally sensitive
   * — cost prices, fraud thresholds — where exposing the number is the risk.
   */
  readonly private?: boolean;
  /** Returns null when valid, otherwise the reason. */
  validate(value: unknown): string | null;
  /**
   * Repairs a valid-but-incomplete stored value before the storefront sees it.
   *
   * Only structured fields need it. A list validates with keys missing — so
   * that adding a field does not invalidate every item saved before it — which
   * means something has to fill those in, and it must be the same something the
   * admin uses or the form would not be showing the page.
   */
  normalise?(value: unknown): unknown;
}

/** Marker so the registry can tell a field from a nested group. */
export const FIELD = Symbol('content.field');

export type Field<T> = FieldMeta<T> & { readonly [FIELD]: true };

const make = <T>(meta: Omit<FieldMeta<T>, 'validate'> & { validate: FieldMeta<T>['validate'] }): Field<T> =>
  ({ ...meta, [FIELD]: true }) as Field<T>;

const isString = (value: unknown): value is string => typeof value === 'string';

interface TextOptions {
  label?: string;
  help?: string;
  max?: number;
  /** Empty strings are rejected unless this is set. */
  optional?: boolean;
}

const textLike = (kind: 'text' | 'textarea') =>
  (defaultValue: string, options: TextOptions = {}): Field<string> =>
    make<string>({
      kind,
      defaultValue,
      label: options.label,
      help: options.help,
      max: options.max,
      validate: (value) => {
        if (!isString(value)) return 'Must be text.';
        if (!options.optional && value.trim() === '') return 'Cannot be empty.';
        if (options.max && value.length > options.max) {
          return `Must be ${options.max} characters or fewer.`;
        }
        return null;
      },
    });

export const field = {
  text: textLike('text'),
  textarea: textLike('textarea'),

  number: (
    defaultValue: number,
    options: { label?: string; help?: string; min?: number; max?: number; private?: boolean } = {}
  ): Field<number> =>
    make<number>({
      kind: 'number',
      defaultValue,
      label: options.label,
      help: options.help,
      min: options.min,
      max: options.max,
      private: options.private,
      validate: (value) => {
        const n = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(n)) return 'Must be a number.';
        if (options.min !== undefined && n < options.min) return `Must be at least ${options.min}.`;
        if (options.max !== undefined && n > options.max) return `Must be at most ${options.max}.`;
        return null;
      },
    }),

  boolean: (defaultValue: boolean, options: { label?: string; help?: string } = {}): Field<boolean> =>
    make<boolean>({
      kind: 'boolean',
      defaultValue,
      label: options.label,
      help: options.help,
      validate: (value) => (typeof value === 'boolean' ? null : 'Must be true or false.'),
    }),

  /**
   * A closed set. The admin renders a dropdown and the validator rejects
   * anything outside it, so a typo cannot reach a component that switches on
   * the value.
   */
  select: <const T extends readonly string[]>(
    options: T,
    defaultValue: T[number],
    meta: { label?: string; help?: string } = {}
  ): Field<T[number]> =>
    make<T[number]>({
      kind: 'select',
      defaultValue,
      label: meta.label,
      help: meta.help,
      options,
      validate: (value) =>
        isString(value) && (options as readonly string[]).includes(value)
          ? null
          : `Must be one of: ${options.join(', ')}.`,
    }),

  /** Hex colour. Rejected rather than coerced — a bad colour is invisible until it ships. */
  color: (defaultValue: string, options: { label?: string; help?: string } = {}): Field<string> =>
    make<string>({
      kind: 'color',
      defaultValue,
      label: options.label,
      help: options.help,
      validate: (value) =>
        isString(value) && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim())
          ? null
          : 'Must be a hex colour, e.g. #FBB602.',
    }),

  /** A path or URL to an image. Empty means "use no image", which is valid. */
  image: (defaultValue: string, options: { label?: string; help?: string } = {}): Field<string> =>
    make<string>({
      kind: 'image',
      defaultValue,
      label: options.label,
      help: options.help,
      validate: (value) => (isString(value) ? null : 'Must be an image path.'),
    }),

  /**
   * An arrangement of a fixed set of things — the sections of a page.
   *
   * The value is the ids in the order they should render. Validation is
   * deliberately permissive about completeness: it rejects unknown ids and
   * duplicates, but not a list that is missing one, because a saved order
   * predates every section added after it. `resolveOrder` fills those in at
   * read time rather than throwing the whole arrangement away.
   */
  order: (
    items: readonly OrderItem[],
    options: { label?: string; help?: string } = {}
  ): Field<readonly string[]> => {
    const ids = items.map((item) => item.id);
    const known = new Set(ids);

    return make<readonly string[]>({
      kind: 'order',
      defaultValue: ids,
      label: options.label,
      help: options.help,
      options: ids,
      optionLabels: Object.fromEntries(items.map((item) => [item.id, item.label])),
      normalise: (value) => resolveOrder(value, ids),
      validate: (value) => {
        if (!Array.isArray(value)) return 'Must be a list of sections.';
        const seen = new Set<string>();
        for (const id of value) {
          if (typeof id !== 'string') return 'Every entry must be a section id.';
          if (!known.has(id)) return `Unknown section: ${id}.`;
          if (seen.has(id)) return `${id} is listed more than once.`;
          seen.add(id);
        }
        return null;
      },
    });
  },

  /**
   * An ordered selection of things that live outside the registry — catalog
   * products, storefront sections.
   *
   * The value is the chosen ids in the order they should appear, which is why
   * one field covers picking, ordering and removing at once. An empty list is
   * meaningful and is the default: it means "no curation", and the section
   * falls back to whatever it shows automatically. That way turning this on is
   * an act, not something an empty database does by accident.
   *
   * Ids cannot be validated against the real catalog here — this module is
   * compiled into the bundle and the catalog is in Postgres — so validation
   * covers shape only. Ids that no longer resolve are dropped at render time.
   */
  picker: (
    source: PickerSource,
    options: { label?: string; help?: string; max?: number } = {}
  ): Field<readonly string[]> =>
    make<readonly string[]>({
      kind: 'picker',
      defaultValue: [],
      label: options.label,
      help: options.help,
      max: options.max,
      source,
      validate: (value) => {
        if (!Array.isArray(value)) return 'Must be a list of selections.';
        if (options.max !== undefined && value.length > options.max) {
          return `Choose at most ${options.max}.`;
        }
        const seen = new Set<string>();
        for (const id of value) {
          if (typeof id !== 'string' || id.trim() === '') return 'Every entry must be an id.';
          if (seen.has(id)) return 'The same item is selected more than once.';
          seen.add(id);
        }
        return null;
      },
    }),

  /**
   * A repeating set of items — the cards in a marketing band.
   *
   * One field, one stored value: the whole list lives at a single path as an
   * array. Giving every item's every key its own path would look tidier until
   * the first reorder, when each of those paths would have to be rewritten and
   * any draft against them would be pointing at the wrong item.
   *
   * Items are validated per declared field, and missing keys are allowed:
   * adding a field to `itemFields` must not invalidate every item saved before
   * it. `resolveList` fills those in at read time.
   */
  list: (
    itemFields: ListItemFields,
    defaultValue: readonly ListItem[],
    options: { label?: string; help?: string; max?: number } = {}
  ): Field<readonly ListItem[]> =>
    make<readonly ListItem[]>({
      kind: 'list',
      defaultValue,
      label: options.label,
      help: options.help,
      max: options.max,
      itemFields,
      normalise: (value) => resolveList(value, itemFields, defaultValue),
      validate: (value) => {
        if (!Array.isArray(value)) return 'Must be a list of items.';
        if (options.max !== undefined && value.length > options.max) {
          return `At most ${options.max} items.`;
        }

        for (let index = 0; index < value.length; index += 1) {
          const item = value[index];
          if (typeof item !== 'object' || item === null || Array.isArray(item)) {
            return `Item ${index + 1} is not a set of values.`;
          }

          for (const [key, itemField] of Object.entries(itemFields)) {
            // Absent is fine — it resolves to the field's default. Present and
            // wrong is not, because that value would reach the storefront.
            if (!(key in (item as ListItem))) continue;
            const reason = itemField.validate((item as ListItem)[key]);
            if (reason) return `Item ${index + 1}, ${itemField.label ?? key}: ${reason}`;
          }
        }

        return null;
      },
    }),

  /**
   * A CSS length or clamp expression. Validated loosely on purpose: the design
   * tokens legitimately hold `clamp(28px, 3.6vw, 46px)`, and a stricter rule
   * would reject the values the site already uses.
   */
  length: (defaultValue: string, options: { label?: string; help?: string } = {}): Field<string> =>
    make<string>({
      kind: 'length',
      defaultValue,
      label: options.label,
      help: options.help,
      validate: (value) => {
        if (!isString(value) || value.trim() === '') return 'Cannot be empty.';
        return /^[0-9a-z%.,()\s\-+*/]+$/i.test(value) ? null : 'Not a valid CSS length.';
      },
    }),
};

/**
 * Where a picker's choices come from.
 *
 * `products` is the catalog in Postgres. (Homepage category tiles used to be
 * a picker too; they are now managed on the categories themselves.)
 */
export type PickerSource = 'products';

/** The declared shape of one list entry. */
export type ListItemFields = Readonly<Record<string, Field<unknown>>>;

/** One entry in a `list` value. */
export type ListItem = Record<string, unknown>;

/**
 * Builds one complete item from whatever was stored for it.
 *
 * Stored items drift from their schema in both directions, and neither may
 * cost the whole list: a key added to the schema after this item was saved
 * takes its field's default, a key that is no longer declared is dropped, and
 * a value that fails its validator falls back rather than reaching a
 * component that cannot render it.
 */
function normaliseItem(stored: unknown, itemFields: ListItemFields): ListItem {
  const source = (typeof stored === 'object' && stored !== null ? stored : {}) as ListItem;
  const item: ListItem = {};

  for (const [key, itemField] of Object.entries(itemFields)) {
    const value = source[key];
    item[key] = itemField.validate(value) === null ? value : itemField.defaultValue;
  }

  return item;
}

/**
 * Reads a stored list into renderable items.
 *
 * Returns `fallback` — the shipped items — only when nothing usable is
 * stored. An explicitly empty list is honoured: someone who removed every item
 * meant it, and quietly restoring the defaults would make removal impossible.
 *
 * Exported because the storefront and the admin must agree on the result; if
 * they normalised differently the form would not be showing the page.
 */
export function resolveList(
  stored: unknown,
  itemFields: ListItemFields,
  fallback: readonly ListItem[]
): readonly ListItem[] {
  if (!Array.isArray(stored)) return fallback;
  return stored.map((entry) => normaliseItem(entry, itemFields));
}

/** One entry an `order` field can arrange. */
export interface OrderItem {
  readonly id: string;
  readonly label: string;
}

/**
 * Reconciles a stored order against the ids that currently exist.
 *
 * Stored orders go stale in both directions: a section added to the registry
 * is missing from every order saved before it, and a section removed leaves an
 * id behind. Neither should cost the arrangement someone chose, so unknown ids
 * are dropped and unmentioned ones are appended in their canonical order.
 *
 * Exported because the storefront and the admin must agree on the result — if
 * they reconciled differently, the preview would not be the page.
 */
export function resolveOrder(stored: unknown, all: readonly string[]): readonly string[] {
  if (!Array.isArray(stored)) return all;

  const known = new Set(all);
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const id of stored) {
    if (typeof id !== 'string' || !known.has(id) || seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }

  // Anything the stored order never mentioned keeps its position relative to
  // the rest, at the end rather than silently vanishing from the page.
  for (const id of all) {
    if (!seen.has(id)) ordered.push(id);
  }

  return ordered;
}

/**
 * Whether two field values represent the same edit.
 *
 * `Object.is` alone is wrong for an `order` field: every reorder builds a
 * fresh array, so an arrangement moved and then moved back would compare
 * unequal and the admin would report an unpublished change that does not
 * exist. Both the form and the per-field "changed" flag have to agree on this,
 * which is why it lives here rather than in either component.
 */
export function sameFieldValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => Object.is(item, b[index]));
  }
  return Object.is(a, b);
}

export const isField = (value: unknown): value is Field<unknown> =>
  typeof value === 'object' && value !== null && FIELD in value;
