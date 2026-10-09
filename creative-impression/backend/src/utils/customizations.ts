import { prisma } from '@/lib/prisma';
import { CATEGORY_SELECT, resolveTemplate } from '@/utils/category-tree';
import { findArticleType } from '@/utils/product-spec';
import { HttpError, isNonEmptyString } from '@/utils/helpers';

/**
 * Personalisation (printing a name, embroidering a logo) is a clothing service.
 * A television or a pair of shoes listed as "customizable" put "Made to order —
 * customize your professional wear" on its page, so the flag is only honoured
 * for products whose listing template is clothing.
 */

export interface CustomizationInput {
  name: string;
  type: string;
  isRequired: boolean;
  options: string | null;
  additionalCost: number;
  maxCharacters: number | null;
}

/**
 * Whether a product is clothing: its own article type decides, else the
 * template its category (or the nearest ancestor) lists under.
 */
export async function isClothing(articleType: unknown, categoryId: unknown): Promise<boolean> {
  const own = typeof articleType === 'string' ? findArticleType(articleType) : null;
  if (own) return own.family === 'apparel';
  if (typeof categoryId !== 'string' || !categoryId) return false;
  const rows = await prisma.category.findMany({ select: CATEGORY_SELECT });
  return findArticleType(resolveTemplate(rows, categoryId))?.family === 'apparel';
}

/**
 * Before a product write: a non-clothing product cannot be customizable. The
 * flag is switched off rather than refused, because the listing form hides the
 * switch for those templates and may still carry a value from before the
 * seller changed category.
 */
export async function guardCustomizable(
  data: Record<string, unknown>,
  stored?: { articleType?: string | null; categoryId?: string | null; isCustomizable?: boolean } | null
): Promise<void> {
  const wantsIt = data.isCustomizable ?? stored?.isCustomizable;
  if (!wantsIt) return;
  const clothing = await isClothing(data.articleType ?? stored?.articleType, data.categoryId ?? stored?.categoryId);
  if (!clothing) data.isCustomizable = false;
}

/**
 * The starting options when a seller first switches personalisation on, so
 * the product page has something to offer rather than an empty "Customize it"
 * box. Free by default; the seller sets prices and limits in the editor.
 */
const DEFAULT_OPTIONS: CustomizationInput[] = [
  { name: 'Text to print', type: 'text', isRequired: false, options: null, additionalCost: 0, maxCharacters: 30 },
  { name: 'Embroidery text', type: 'embroidery', isRequired: false, options: null, additionalCost: 0, maxCharacters: 20 },
];

/** After a product write: a customizable product with no options gets the defaults. */
export async function ensureDefaultCustomizations(productId: string): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { isCustomizable: true, _count: { select: { customizations: true } } },
  });
  if (!product?.isCustomizable || product._count.customizations > 0) return;
  await prisma.productCustomization.createMany({
    data: DEFAULT_OPTIONS.map((row) => ({ ...row, productId })),
  });
}

/** Validate the option list the customization editor sends. */
export function parseCustomizationRows(raw: unknown): { data: CustomizationInput[]; errors: string[] } {
  if (!Array.isArray(raw)) return { data: [], errors: ['customizations must be an array'] };
  const errors: string[] = [];
  const data = (raw as Record<string, unknown>[]).map((row, index) => {
    const label = `Option ${index + 1}`;
    if (!isNonEmptyString(row?.name)) errors.push(`${label}: a name is required`);
    const type = isNonEmptyString(row?.type) ? row.type.trim() : 'text';
    if (!['text', 'color', 'image', 'embroidery'].includes(type)) {
      errors.push(`${label}: type must be text, color, image or embroidery`);
    }
    const additionalCost = row?.additionalCost === undefined ? 0 : Number(row.additionalCost);
    if (!Number.isFinite(additionalCost) || additionalCost < 0) {
      errors.push(`${label}: extra cost must be zero or more`);
    }
    const maxCharacters =
      row?.maxCharacters === undefined || row.maxCharacters === null || row.maxCharacters === ''
        ? null
        : Number(row.maxCharacters);
    if (maxCharacters !== null && (!Number.isInteger(maxCharacters) || maxCharacters <= 0)) {
      errors.push(`${label}: character limit must be a whole number above zero`);
    }

    return {
      name: isNonEmptyString(row?.name) ? row.name.trim().slice(0, 120) : '',
      type,
      isRequired: row?.isRequired === true,
      // Stored as JSON on the model; the form sends the choices as a list.
      // An empty list is "no options to choose from", which the column says
      // as null — storing "[]" would be a second way to spell the same thing.
      options: Array.isArray(row?.options)
        ? (() => {
            const chosen = (row.options as unknown[]).filter((option) => isNonEmptyString(option));
            return chosen.length > 0 ? JSON.stringify(chosen) : null;
          })()
        : isNonEmptyString(row?.options)
          ? row.options
          : null,
      additionalCost: Number.isFinite(additionalCost) ? additionalCost : 0,
      maxCharacters,
    };
  });
  return { data, errors };
}

/**
 * Replace a product's options. The flag and the options are two halves of one
 * feature: saving options turns the flag on, clearing them turns it off.
 * Refused for anything that is not clothing.
 */
export async function replaceCustomizations(productId: string, data: CustomizationInput[]) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, articleType: true, categoryId: true },
  });
  if (!product) throw new HttpError(404, 'Product not found');
  if (data.length > 0 && !(await isClothing(product.articleType, product.categoryId))) {
    throw new HttpError(400, 'Printing and embroidery can only be offered on clothing');
  }

  return prisma.$transaction(async (tx) => {
    await tx.productCustomization.deleteMany({ where: { productId } });
    if (data.length > 0) {
      await tx.productCustomization.createMany({ data: data.map((row) => ({ ...row, productId })) });
    }
    await tx.product.update({ where: { id: productId }, data: { isCustomizable: data.length > 0 } });
    return tx.productCustomization.findMany({ where: { productId } });
  });
}
