jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import {
  ancestorChain,
  camelKey,
  cleanOptions,
  extrasFor,
  mergeFields,
  mergeOption,
  pickFieldInput,
  relatedCategoryIds,
  type FieldCategory,
  type FieldRow,
} from '@/utils/category-fields';
import { filterableAttributes, getArticleSpec, missingForLive, templateInfo, validateListingValues } from '@/utils/product-spec';

const field = (categoryId: string, key: string, patch: Partial<FieldRow> = {}): FieldRow => ({
  id: `${categoryId}-${key}`,
  categoryId,
  key,
  label: key,
  type: 'TEXT',
  options: [],
  unit: null,
  helpText: null,
  required: false,
  filterable: false,
  displayOrder: 0,
  ...patch,
});

const cat = (id: string, parentId: string | null, fields: FieldRow[] = [], patch: Partial<FieldCategory> = {}): FieldCategory => ({
  id,
  name: id.toUpperCase(),
  parentId,
  optionLabel: null,
  optionValues: [],
  fields,
  ...patch,
});

// Electronics › Television › LED TV
const rows: FieldCategory[] = [
  cat('elec', null, [field('elec', 'warranty', { type: 'NUMBER', unit: 'months' })], { optionLabel: 'Variant' }),
  cat(
    'tv',
    'elec',
    [
      field('tv', 'smartTv', { type: 'BOOLEAN', filterable: true, displayOrder: 1 }),
      field('tv', 'screenSize', {
        type: 'SELECT',
        options: ['32 inch', '43 inch', '55 inch'],
        required: true,
        filterable: true,
        displayOrder: 0,
      }),
    ],
    { optionValues: ['A', 'B'] }
  ),
  cat('led', 'tv', [field('led', 'ports', { type: 'MULTI_SELECT', options: ['HDMI', 'USB'] })], { optionLabel: 'Model' }),
  cat('other', null),
];

describe('category chain', () => {
  it('walks to the root, root first, and survives a loop', () => {
    expect(ancestorChain(rows, 'led').map((c) => c.id)).toEqual(['elec', 'tv', 'led']);
    expect(ancestorChain([cat('a', 'b'), cat('b', 'a')], 'a').map((c) => c.id)).toEqual(['b', 'a']);
    expect(ancestorChain(rows, 'missing')).toEqual([]);
  });

  it('relates a category to its ancestors and descendants only', () => {
    expect(relatedCategoryIds(rows, 'tv').sort()).toEqual(['elec', 'led', 'tv']);
    expect(relatedCategoryIds(rows, 'other')).toEqual(['other']);
  });
});

describe('mergeFields', () => {
  it('lists ancestors first, then display order, marking what is inherited', () => {
    const merged = mergeFields(ancestorChain(rows, 'led'));
    expect(merged.map((f) => f.key)).toEqual(['warranty', 'screenSize', 'smartTv', 'ports']);
    expect(merged.find((f) => f.key === 'screenSize')).toMatchObject({ inherited: true, definedBy: { id: 'tv' } });
    expect(merged.find((f) => f.key === 'ports')?.inherited).toBe(false);
  });

  it('lets the nearest definition of a key win', () => {
    const chain = [cat('a', null, [field('a', 'size', { label: 'Old' })]), cat('b', 'a', [field('b', 'size', { label: 'New' })])];
    expect(mergeFields(chain)).toHaveLength(1);
    expect(mergeFields(chain)[0]).toMatchObject({ label: 'New', definedBy: { id: 'b' } });
  });

  it('takes the nearest option label and values independently', () => {
    expect(mergeOption(ancestorChain(rows, 'led'))).toMatchObject({ optionLabel: 'Model', optionValues: ['A', 'B'] });
    expect(mergeOption(ancestorChain(rows, 'tv'))).toMatchObject({ optionLabel: 'Variant', labelFrom: { id: 'elec' } });
    expect(mergeOption([])).toMatchObject({ optionLabel: null, optionValues: [] });
  });
});

describe('category fields as template columns', () => {
  const extras = extrasFor(rows, 'led');

  it('maps types to catalogue kinds with inline options', () => {
    const byKey = Object.fromEntries(extras.columns.map((c) => [c.key, c]));
    expect(byKey.screenSize).toMatchObject({ kind: 'select', scope: 'attribute', group: 'discoverability', values: ['32 inch', '43 inch', '55 inch'] });
    expect(byKey.smartTv).toMatchObject({ kind: 'boolean', values: ['Yes', 'No'] });
    expect(byKey.warranty).toMatchObject({ kind: 'number', unit: 'months' });
    expect(byKey.ports.kind).toBe('multiselect');
  });

  it('joins the listing form spec and names the variant option', () => {
    const spec = getArticleSpec('electronics', extras)!;
    expect(spec.optionLabel).toBe('Model');
    expect(spec.optionValues).toEqual(['A', 'B']);
    expect(spec.columns.find((c) => c.key === 'screenSize')?.options).toEqual(['32 inch', '43 inch', '55 inch']);
    // The template's own attributes are still there.
    expect(spec.columns.some((c) => c.key === 'modelNumber')).toBe(true);
    // Clothing keeps its size chart name.
    expect(getArticleSpec('Dresses', extras)!.optionLabel).toBe('Size');
  });

  it('validates values by type and normalises them', () => {
    const data: Record<string, unknown> = {
      attributes: { screenSize: '55 INCH', smartTv: true, warranty: '12', ports: 'hdmi, usb' },
    };
    expect(validateListingValues(data, 'Electronics', { extraColumns: extras.columns })).toEqual([]);
    expect(data.attributes).toEqual({ screenSize: '55 inch', smartTv: 'Yes', warranty: '12', ports: ['HDMI', 'USB'] });

    const bad = validateListingValues(
      { attributes: { screenSize: '50 inch', smartTv: 'maybe', warranty: 'a year', ports: ['VGA'] } },
      'Electronics',
      { extraColumns: extras.columns }
    );
    expect(bad).toHaveLength(4);
    // Without the category the same keys are unknown, as before.
    expect(validateListingValues({ attributes: { screenSize: '55 inch' } }, 'Electronics')[0]).toMatch(/not an attribute/);
  });

  it('keeps a stored value of a deleted field instead of refusing it', () => {
    const errors = validateListingValues({ attributes: { oldField: 'x' } }, 'Electronics', {
      extraColumns: extras.columns,
      storedAttributes: { oldField: 'x' },
    });
    expect(errors).toEqual([]);
  });

  it('works without a template', () => {
    expect(validateListingValues({ attributes: { screenSize: '43 inch' } }, null, { extraColumns: extras.columns })).toEqual([]);
  });

  it('requires required category fields to go live', () => {
    const keys = (attributes: Record<string, unknown>) =>
      missingForLive({ articleType: 'General product', attributes, variants: [{ size: 'A' }] }, extras.columns).map((m) => m.key);
    expect(keys({})).toContain('screenSize');
    expect(keys({ screenSize: '55 inch' })).not.toContain('screenSize');
    expect(missingForLive({ articleType: null, attributes: {}, variants: [] }, extras.columns).map((m) => m.key)).toEqual(['screenSize']);
  });

  it('adds filterable fields and spec-table labels and units', () => {
    const filters = filterableAttributes('electronics', extras.columns).map((f) => f.key);
    expect(filters).toEqual(expect.arrayContaining(['screenSize', 'smartTv']));
    expect(filters).not.toContain('ports');
    const info = templateInfo('electronics', extras)!;
    expect(info.attributeLabels.screenSize).toBe('screenSize');
    expect(info.attributeUnits).toMatchObject({ warranty: 'months' });
  });
});

describe('admin input', () => {
  it('makes camelCase keys from labels', () => {
    expect(camelKey('Screen size')).toBe('screenSize');
    expect(camelKey('Refresh rate (Hz)')).toBe('refreshRate');
    expect(camelKey('4K support')).toBe('field4kSupport');
    expect(camelKey('Energy-rating stars')).toBe('energyRatingStars');
  });

  it('cleans option lists', () => {
    expect(cleanOptions(' HD, Full HD ,hd,, 4K')).toEqual(['HD', 'Full HD', '4K']);
    expect(cleanOptions([1, 'a'])).toEqual(['1', 'a']);
    expect(cleanOptions({})).toBeNull();
  });

  it('checks a new field', () => {
    expect(pickFieldInput({ label: 'Screen size', type: 'SELECT', options: '32 inch, 43 inch' }, null)).toEqual({
      data: { label: 'Screen size', key: 'screenSize', type: 'SELECT', options: ['32 inch', '43 inch'] },
      errors: [],
    });
    expect(pickFieldInput({ label: 'Resolution', type: 'SELECT' }, null).errors).toContain('A list field needs at least one option');
    expect(pickFieldInput({ label: 'x'.repeat(61) }, null).errors[0]).toMatch(/60 characters/);
    expect(pickFieldInput({ label: 'Hz', type: 'NUMBER', options: ['1'], unit: 'Hz' }, null).data).toMatchObject({ options: [], unit: 'Hz' });
    expect(pickFieldInput({ label: 'Hz', type: 'DATE' }, null).errors[0]).toMatch(/type must be/);
  });

  it('refuses a key change on update and rechecks the merged type', () => {
    const current = { key: 'screenSize', label: 'Screen size', type: 'TEXT' as const, options: [] };
    expect(pickFieldInput({ key: 'other' }, current).errors[0]).toMatch(/cannot be changed/);
    expect(pickFieldInput({ type: 'SELECT' }, current).errors).toContain('A list field needs at least one option');
    expect(pickFieldInput({ required: true }, current)).toEqual({ data: { required: true }, errors: [] });
  });
});
