import { describe, expect, it } from 'vitest';
import { toApiCustomization, toEditorRow } from './api';
import { buildProductPayload, buildVariantPayload, draftFromProduct, type LoadedProduct } from './model';

const product = {
  id: 'p1',
  name: 'Linen Shirt',
  slug: 'linen-shirt',
  sku: 'LIN-1',
  categoryId: 'c1',
  pricePaise: 129950,
  mrpPaise: 199900,
  costPaise: 60000,
  quantity: 0,
  status: 'DRAFT',
  description: null,
  shortDescription: null,
  images: [],
  color: null,
} as LoadedProduct;

describe('listing form money', () => {
  it('shows API paise as rupees', () => {
    const draft = draftFromProduct(product, [
      { id: 'v1', sku: 'LIN-1-M', size: 'M', color: null, pricePaise: 139900, quantity: 4 },
    ]);
    expect(draft.price).toBe('1299.5');
    expect(draft.originalPrice).toBe('1999');
    expect(draft.costPrice).toBe('600');
    expect(draft.rows[0].price).toBe('1399');
  });

  it('still reads a product in the legacy rupee shape', () => {
    const draft = draftFromProduct({ ...product, pricePaise: undefined, price: 499 }, []);
    expect(draft.price).toBe('499');
  });

  it('sends rupees typed in the form as whole paise', () => {
    const draft = draftFromProduct(product, [
      { id: 'v1', sku: 'LIN-1-M', size: 'M', color: null, pricePaise: null, quantity: 4 },
    ]);
    const body = buildProductPayload({ ...draft, price: '1299.99' }, null, 'admin', undefined);
    expect(body.pricePaise).toBe(129999);
    expect(body.mrpPaise).toBe(199900);
    expect(body.costPaise).toBe(60000);
    expect(body).not.toHaveProperty('price');
    expect(buildVariantPayload(draft, { ...draft.rows[0], price: '10.5' }).pricePaise).toBe(1050);
    expect(buildVariantPayload(draft, draft.rows[0]).pricePaise).toBeNull();
  });

  it('keeps the seller payload free of staff-only fields', () => {
    const body = buildProductPayload(draftFromProduct(product, []), null, 'seller', 'DRAFT');
    expect(body).not.toHaveProperty('costPaise');
    expect(body).not.toHaveProperty('vendorId');
  });
});

describe('personalisation rows', () => {
  it('round-trips between the editor (rupees) and the API (paise)', () => {
    const editor = toEditorRow({ name: 'Name', type: 'EMBROIDERY', isRequired: true, options: null, additionalPaise: 14900, maxCharacters: 12 });
    expect(editor).toMatchObject({ type: 'embroidery', additionalCost: 149, maxCharacters: 12 });
    expect(toApiCustomization(editor)).toMatchObject({ type: 'EMBROIDERY', additionalPaise: 14900, options: null });
    expect(toApiCustomization({ ...editor, options: '["Left","Right"]' }).options).toEqual(['Left', 'Right']);
  });
});
