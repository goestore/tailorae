import {
  filterableAttributes,
  getArticleSpec,
  templateInfo,
  listArticleTypes,
  missingForLive,
  pickVariantListingFields,
  prepareListingWrite,
  validateListingValues,
  isLiveCheckError,
  type ListingSnapshot,
} from '@/utils/product-spec';

/**
 * The catalogue is generated from Myntra's own templates, so these pin the
 * facts read from them: if a regenerated catalogue changes what a Dress
 * needs, the test says so instead of the change slipping into production.
 */

const dress = getArticleSpec('Dresses')!;
const col = (header: string) => dress.columns.find((c) => c.header === header)!;

describe('catalogue', () => {
  it('covers the eight apparel article types from the templates', () => {
    expect(
      listArticleTypes()
        .filter((t) => t.family === 'apparel')
        .map((t) => t.articleType)
        .sort()
    ).toEqual(['Clothing Set', 'Co-Ords', 'Dresses', 'Rompers', 'Shirts', 'Skirts', 'Tops', 'Trousers']);
  });

  it('merges the general templates, each naming its variant option', () => {
    const general = listArticleTypes().filter((t) => t.family === 'general');
    expect(general.map((t) => t.slug).sort()).toEqual([
      'bags-accessories',
      'beauty-personal-care',
      'electronics',
      'footwear',
      'general',
      'home-kitchen',
    ]);
    expect(general.find((t) => t.slug === 'footwear')?.optionLabel).toBe('UK size');
    expect(listArticleTypes().find((t) => t.slug === 'dresses')?.optionLabel).toBe('Size');
  });

  it('reads Myntra mandatory flags and dropdowns for Dresses', () => {
    expect(col('Fabric').required).toBe(true);
    expect(col('Fabric').options).toHaveLength(50);
    expect(col('Neck').options).toContain('V-Neck');
    expect(col('Occasion').required).toBe(false);
    expect(col('MRP')).toMatchObject({ scope: 'product', field: 'originalPrice', required: true });
    expect(col('GTIN')).toMatchObject({ scope: 'variant', field: 'gtin' });
    expect(col('Bust ( Inches )')).toMatchObject({ scope: 'measurement', required: true });
    expect(dress.sizes).toContain('XL');
  });
});

describe('general templates', () => {
  const footwear = getArticleSpec('Footwear')!;
  const electronics = getArticleSpec('electronics')!;

  it('gives footwear UK sizes 3 to 12 with half sizes, and electronics free options', () => {
    expect(footwear.sizes[0]).toBe('UK 3');
    expect(footwear.sizes).toContain('UK 7.5');
    expect(footwear.sizes[footwear.sizes.length - 1]).toBe('UK 12');
    expect(footwear.freeOptions).toBe(false);
    expect(electronics.sizes).toEqual([]);
    expect(electronics.freeOptions).toBe(true);
  });

  it('borrows countries from the Myntra catalogue and keeps HSN required', () => {
    const country = footwear.columns.find((c) => c.key === 'countryOfOrigin')!;
    expect(country.options).toContain('India');
    expect(footwear.columns.find((c) => c.key === 'hsn')).toMatchObject({ required: true, field: 'hsn' });
    expect(footwear.columns.some((c) => c.scope === 'measurement')).toBe(false);
  });

  it('validates general attributes, including numbers', () => {
    const data: Record<string, unknown> = {
      articleType: 'footwear',
      attributes: { upperMaterial: 'leather', soleMaterial: 'EVA' },
    };
    expect(validateListingValues(data, null)).toEqual([]);
    expect(data).toMatchObject({ articleType: 'Footwear', attributes: { upperMaterial: 'Leather' } });
    expect(validateListingValues({ attributes: { upperMaterial: 'Cheese' } }, 'Footwear').join(' ')).toMatch(
      /Upper material must be one of the listed options/
    );
    expect(validateListingValues({ attributes: { warrantyMonths: 'a year' } }, 'Electronics')[0]).toMatch(
      /Warranty \(months\) must be a number/
    );
    const ok: Record<string, unknown> = { attributes: { warrantyMonths: '12', modelNumber: 'X-100' } };
    expect(validateListingValues(ok, 'Electronics')).toEqual([]);
  });

  it('names the missing variant by its option label', () => {
    const keys = missingForLive({ articleType: 'Electronics', variants: [] });
    expect(keys.find((m) => m.key === 'sizes')?.label).toBe('At least one variant');
    expect(keys.map((m) => m.key)).toEqual(expect.arrayContaining(['modelNumber', 'warrantyMonths', 'hsn', 'front']));
  });

  it('exposes filterable attributes and template info', () => {
    expect(filterableAttributes('footwear').map((a) => a.key)).toEqual(
      expect.arrayContaining(['upperMaterial', 'soleMaterial', 'closure', 'occasion'])
    );
    expect(filterableAttributes('footwear').map((a) => a.key)).not.toContain('heelHeight');
    expect(templateInfo('Footwear')).toMatchObject({ family: 'general', optionLabel: 'UK size' });
    expect(templateInfo('Footwear')?.attributeLabels.upperMaterial).toBe('Upper material');
    expect(templateInfo(null)).toBeNull();
  });
});

describe('validateListingValues', () => {
  it('normalises a dropdown value to Myntra spelling', () => {
    const data: Record<string, unknown> = { articleType: 'dresses', attributes: { fabric: 'cotton' }, ageGroup: 'kids-girls' };
    expect(validateListingValues(data, null)).toEqual([]);
    expect(data).toMatchObject({ articleType: 'Dresses', ageGroup: 'Kids-Girls', attributes: { fabric: 'Cotton' } });
  });

  it('refuses values that are not options, and attributes the type does not have', () => {
    const errors = validateListingValues({ attributes: { fabric: 'Moon dust', waistRise: 'High-Rise' } }, 'Dresses');
    expect(errors.join(' ')).toMatch(/Fabric must be one of/);
    expect(errors.join(' ')).toMatch(/waistRise is not an attribute of Dresses/);
  });

  it('checks HSN shape and unknown article types', () => {
    expect(validateListingValues({ hsn: '62A4' }, 'Dresses')).toContain('HSN must be 4 to 8 digits');
    expect(validateListingValues({ articleType: 'Spacesuits' }, null)[0]).toMatch(/articleType must be one of/);
  });
});

describe('pickVariantListingFields', () => {
  it('accepts GTIN and measurements, rejects bad ones', () => {
    expect(pickVariantListingFields({ gtin: '8901234567890', measurements: { bustIn: '17.5' } })).toEqual({
      data: { gtin: '8901234567890', measurements: { bustIn: 17.5 } },
      errors: [],
    });
    expect(pickVariantListingFields({ gtin: '12345' }).errors[0]).toMatch(/GTIN/);
    expect(pickVariantListingFields({ measurements: { bustIn: 900 } }).errors[0]).toMatch(/0 to 200/);
  });

  it('accepts extra option values and refuses a list', () => {
    expect(pickVariantListingFields({ options: { Storage: ' 128 GB ', Colour: '' } })).toEqual({
      data: { options: { Storage: '128 GB' } },
      errors: [],
    });
    expect(pickVariantListingFields({ options: ['128 GB'] }).errors[0]).toMatch(/options must be an object/);
  });
});

describe('missingForLive', () => {
  const base: ListingSnapshot = { articleType: 'Dresses', variants: [] };

  it('lists everything for an empty Dress, including sizes and the front image', () => {
    const keys = missingForLive(base).map((m) => m.key);
    expect(keys).toEqual(expect.arrayContaining(['sizes', 'fabric', 'front', 'mrp', 'hsn']));
  });

  it('is empty for a legacy product with no article type', () => {
    expect(missingForLive({ articleType: null, variants: [] })).toEqual([]);
  });

  it('counts sizes that lack a measurement', () => {
    const missing = missingForLive({
      ...base,
      variants: [{ size: 'S', measurements: { bustIn: 30 } }, { size: 'M', measurements: {} }],
    });
    expect(missing.find((m) => m.key === 'bustIn')?.label).toMatch(/\(1 size\)/);
  });

  it('takes bust or chest, and does not need a GTIN', () => {
    const missing = missingForLive({
      ...base,
      variants: [{ size: '0-3M', measurements: { chestIn: 17 } }],
    });
    const keys = missing.map((m) => m.key);
    expect(keys).not.toContain('bustIn');
    expect(keys).not.toContain('chestIn');
    expect(keys).not.toContain('gtin');
    expect(missingForLive({ ...base, variants: [{ size: 'S', measurements: {} }] }).find((m) => m.key === 'bustIn')?.label).toBe(
      'Bust or Chest (in) (1 size)'
    );
  });
});

describe('prepareListingWrite', () => {
  it('orders images by angle and sets the thumbnail to the front image', () => {
    const data: Record<string, unknown> = {
      articleType: 'Dresses',
      imageAngles: { back: '/b.webp', front: '/f.webp' },
    };
    expect(prepareListingWrite(data, null)).toEqual([]);
    expect(data.images).toEqual(['/f.webp', '/b.webp']);
    expect(data.thumbnail).toBe('/f.webp');
  });

  it('lets a draft through but refuses to make an incomplete listing live', () => {
    expect(prepareListingWrite({ articleType: 'Dresses', status: 'DRAFT' }, null)).toEqual([]);
    try {
      prepareListingWrite({ articleType: 'Dresses', status: 'ACTIVE' }, null);
      throw new Error('should have thrown');
    } catch (error) {
      expect(isLiveCheckError(error)).toBe(true);
    }
  });
});
