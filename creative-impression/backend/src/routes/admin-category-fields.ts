import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { authMiddleware, adminOnly, AuthRequest } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { CATEGORY_SELECT, resolveTemplate } from '@/utils/category-tree';
import {
  ancestorChain,
  invalidateCategoryFields,
  mergeFields,
  mergeOption,
  pickFieldInput,
  relatedCategoryIds,
  type FieldCategory,
} from '@/utils/category-fields';
import { getArticleSpec } from '@/utils/product-spec';
import { revalidateCatalog } from '@/utils/revalidate';

/**
 * The category field builder: product fields an admin defines on a category
 * (Television: screen size, smart TV, refresh rate) without a code change.
 *
 * Mounted at /api/admin/categories, beside the category CRUD in admin.ts.
 * Fields are inherited down the tree, so a key must be unique along every
 * chain it can appear on: the category's ancestors and its descendants.
 * Deleting a field leaves the values products already carry in place; they
 * are simply no longer asked for or shown.
 */
const router = Router();
router.use(authMiddleware, adminOnly);

/** Every category with its fields and template, read fresh (not the cache). */
const loadRows = () =>
  prisma.category.findMany({
    select: { ...CATEGORY_SELECT, optionLabel: true, optionValues: true, fields: true },
  });

type Row = Awaited<ReturnType<typeof loadRows>>[number];

/** The panel's view of one category: own fields, inherited ones, option, template. */
function describe(rows: Row[], id: string) {
  const chain = ancestorChain(rows, id) as Array<Row & FieldCategory>;
  const self = chain[chain.length - 1];
  const merged = mergeFields(chain);
  const template = getArticleSpec(resolveTemplate(rows, id) ?? 'general');
  return {
    category: {
      id: self.id,
      name: self.name,
      optionLabel: self.optionLabel,
      optionValues: self.optionValues,
    },
    fields: [...self.fields].sort((a, b) => a.displayOrder - b.displayOrder || a.label.localeCompare(b.label)),
    inherited: merged.filter((f) => f.inherited),
    // What the category would use if it set nothing itself.
    inheritedOption: mergeOption(chain.slice(0, -1)),
    template: template
      ? {
          slug: template.slug,
          articleType: template.articleType,
          family: template.family,
          optionLabel: template.optionLabel,
          attributes: template.columns
            .filter((c) => c.scope === 'attribute')
            .map((c) => ({ key: c.key, label: c.label })),
        }
      : null,
  };
}

/** Another category on this one's chains already uses the key. */
function keyClash(rows: Row[], categoryId: string, key: string, ignoreFieldId?: string): string | null {
  const related = new Set(relatedCategoryIds(rows, categoryId));
  for (const row of rows) {
    if (!related.has(row.id)) continue;
    const field = row.fields.find((f) => f.key === key && f.id !== ignoreFieldId);
    if (field) {
      return row.id === categoryId
        ? `This category already has a field with the key ${key}`
        : `${row.name} already defines a field with the key ${key} (“${field.label}”), and products here would see both`;
    }
  }
  return null;
}

const changed = () => {
  invalidateCategoryFields();
  void revalidateCatalog('products');
};

// @route   GET /api/admin/categories/:id/fields
router.get('/:id/fields', async (req: AuthRequest, res: Response) => {
  try {
    const rows = await loadRows();
    if (!rows.some((r) => r.id === req.params.id)) {
      res.status(404).json({ success: false, message: 'Category not found' });
      return;
    }
    res.json({ success: true, data: describe(rows, req.params.id) });
  } catch (error) {
    console.error('[ADMIN] category fields failed:', error);
    res.status(500).json({ success: false, message: 'Failed to load the category fields' });
  }
});

// @route   POST /api/admin/categories/:id/fields
router.post('/:id/fields', async (req: AuthRequest, res: Response) => {
  try {
    const rows = await loadRows();
    const category = rows.find((r) => r.id === req.params.id);
    if (!category) {
      res.status(404).json({ success: false, message: 'Category not found' });
      return;
    }
    const { data, errors } = pickFieldInput((req.body ?? {}) as Record<string, unknown>, null);
    const clash = data.key ? keyClash(rows, category.id, data.key) : null;
    if (clash) errors.push(clash);
    if (errors.length) {
      res.status(400).json({ success: false, message: errors.join('. ') });
      return;
    }
    if (category.fields.length >= 60) {
      res.status(400).json({ success: false, message: 'A category can have at most 60 fields' });
      return;
    }
    const field = await prisma.categoryField.create({
      data: {
        ...(data as Required<Pick<typeof data, 'key' | 'label'>> & typeof data),
        categoryId: category.id,
        displayOrder: data.displayOrder ?? Math.max(-1, ...category.fields.map((f) => f.displayOrder)) + 1,
      },
    });
    changed();
    res.status(201).json({ success: true, message: `${field.label} added`, data: { field } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ success: false, message: 'This category already has a field with that key' });
      return;
    }
    console.error('[ADMIN] category field create failed:', error);
    res.status(500).json({ success: false, message: 'Failed to add the field' });
  }
});

// @route   PUT /api/admin/categories/:id/fields/order
// @desc    Body { ids: [fieldId, …] } in the new order. Declared before
//          /:fieldId, which would otherwise take "order" for an id.
router.put('/:id/fields/order', async (req: AuthRequest, res: Response) => {
  try {
    const ids = (req.body ?? {}).ids as unknown;
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
      res.status(400).json({ success: false, message: 'ids must be the field ids in their new order' });
      return;
    }
    const own = await prisma.categoryField.findMany({ where: { categoryId: req.params.id }, select: { id: true } });
    const ownIds = new Set(own.map((f) => f.id));
    if (ids.length !== ownIds.size || !ids.every((id) => ownIds.has(id as string))) {
      res.status(400).json({ success: false, message: "ids must list every one of this category's fields once" });
      return;
    }
    await prisma.$transaction(
      (ids as string[]).map((id, displayOrder) => prisma.categoryField.update({ where: { id }, data: { displayOrder } }))
    );
    changed();
    res.json({ success: true, message: 'Order saved' });
  } catch (error) {
    console.error('[ADMIN] category field order failed:', error);
    res.status(500).json({ success: false, message: 'Failed to reorder the fields' });
  }
});

// @route   PUT /api/admin/categories/:id/fields/:fieldId
router.put('/:id/fields/:fieldId', async (req: AuthRequest, res: Response) => {
  try {
    const current = await prisma.categoryField.findFirst({
      where: { id: req.params.fieldId, categoryId: req.params.id },
    });
    if (!current) {
      res.status(404).json({ success: false, message: 'Field not found' });
      return;
    }
    const { data, errors } = pickFieldInput((req.body ?? {}) as Record<string, unknown>, current);
    if (errors.length) {
      res.status(400).json({ success: false, message: errors.join('. ') });
      return;
    }
    const field = await prisma.categoryField.update({ where: { id: current.id }, data });
    changed();
    res.json({ success: true, message: `${field.label} saved`, data: { field } });
  } catch (error) {
    console.error('[ADMIN] category field update failed:', error);
    res.status(500).json({ success: false, message: 'Failed to save the field' });
  }
});

// @route   DELETE /api/admin/categories/:id/fields/:fieldId
// @desc    Products keep the values they carry; they are just no longer shown.
router.delete('/:id/fields/:fieldId', async (req: AuthRequest, res: Response) => {
  try {
    const result = await prisma.categoryField.deleteMany({
      where: { id: req.params.fieldId, categoryId: req.params.id },
    });
    if (result.count === 0) {
      res.status(404).json({ success: false, message: 'Field not found' });
      return;
    }
    changed();
    res.json({ success: true, message: 'Field deleted. Products keep the values they already had.' });
  } catch (error) {
    console.error('[ADMIN] category field delete failed:', error);
    res.status(500).json({ success: false, message: 'Failed to delete the field' });
  }
});

export default router;
