'use client';

import { CustomizationEditor } from '@/components/admin/CustomizationEditor';
import type { ProductCustomizationRow } from '@/lib/admin-products';
import './listing-form.css';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  createVariant,
  deleteVariant,
  getProduct,
  listBrands,
  listCategories,
  listProducts,
  listSellerOptions,
  slugify,
  suggestVariantSku,
  updateVariant,
  type ProductStatus,
  type SellerOption,
} from '@/lib/admin-products';
import {
  createSellerVariant,
  deleteSellerVariant,
  getSellerProduct,
  getSellerProducts,
  updateSellerVariant,
} from '@/lib/seller-api';
import {
  ListingSaveError,
  getArticleSpec,
  getLastBusinessDetails,
  listArticleTypes,
  listCategoryChoices,
  listPublicBrands,
  addBrand,
  saveListingProduct,
  type ArticleSpec,
  type ArticleTypeSummary,
  type MissingField,
  type SavedProduct,
} from '@/lib/catalogue-api';
import {
  AreaField,
  CheckField,
  MissingContext,
  Section,
  SelectField,
  TextField,
  ChipInput,
  type Option,
} from './controls';
import { BusinessSection, productColumn } from './BusinessSection';
import { AttributesSection } from './AttributesSection';
import { SizesSection } from './SizesSection';
import { ImagesSection } from './ImagesSection';
import { Checklist } from './Checklist';
import {
  EMPTY_DRAFT,
  SECTIONS,
  buildChecklist,
  buildProductPayload,
  buildRows,
  buildVariantPayload,
  draftAsCopy,
  draftFromProduct,
  fieldId,
  isApparel,
  measureId,
  orderSizes,
  rowFieldId,
  saveBlockers,
  targetForMissing,
  type FormMode,
  type ListingDraft,
  type LoadedProduct,
  type LoadedVariant,
  type SectionId,
  type VariantRow,
} from './model';

export interface ListingFormProps {
  mode: FormMode;
  /** Present when editing an existing product. */
  productId?: string;
  /** Told the stored status after every save, so the page header can follow. */
  onSaved?: (product: SavedProduct) => void;
}

interface CategoryOption {
  id: string;
  name: string;
  isActive?: boolean;
  /** Nesting level; 0 is a top-level department. */
  depth?: number;
  /** The listing template this category (or its nearest parent) uses. */
  template?: string | null;
}

/** "Kids › Dresses" reads as an indented child in the picker. */
const categoryLabel = (c: CategoryOption) =>
  `${c.depth ? `${'   '.repeat(c.depth - 1)}↳ ` : ''}${c.name}${c.isActive === false ? ' (hidden)' : ''}`;

type Banner = {
  tone: 'error' | 'success' | 'info';
  text: string;
  items?: string[];
  /** A next step, e.g. opening the listing that already has this article number. */
  link?: { href: string; label: string };
} | null;

const FLASH_KEY = 'ci:listing-flash';

const editHref = (mode: FormMode, id: string) =>
  mode === 'admin' ? `/admin/products/${id}` : `/seller/products/${id}`;
const newHref = (mode: FormMode) => (mode === 'admin' ? '/admin/products/new' : '/seller/products/new');

/** A product with its variants, from whichever console is asking. */
async function loadFull(
  mode: FormMode,
  id: string
): Promise<{ product: LoadedProduct; variants: LoadedVariant[] }> {
  if (mode === 'admin') {
    const product = (await getProduct(id)) as unknown as LoadedProduct & {
      variants?: LoadedVariant[];
    };
    return { product, variants: product.variants ?? [] };
  }
  const product = await getSellerProduct(id);
  return {
    product: product as unknown as LoadedProduct,
    variants: (product.variants ?? []) as LoadedVariant[],
  };
}

const norm = (value: string) => value.toLowerCase().replace(/[^a-z]/g, '');

/** A category whose name matches the article type, else the age group. */
function suggestCategory(
  categories: CategoryOption[],
  articleType: string,
  ageGroup: string
): CategoryOption | null {
  if (!articleType && !ageGroup) return null;
  // Who it is for decides the category first: the shop's sections are Women,
  // Men and Kids, and a girls' dress filed under a "Dresses" category was
  // reachable from no section at all. The article type already says it is a
  // dress.
  const age = ageGroup.toLowerCase();
  const word = age.includes('women')
    ? 'women'
    : age.includes('men')
      ? 'men'
      : age.startsWith('kids')
        ? 'kids'
        : '';
  const byAge = word ? categories.find((c) => norm(c.name) === word) : undefined;
  if (byAge) return byAge;
  const type = norm(articleType);
  const stem = type.replace(/s$/, '');
  return (
    (type &&
      categories.find((c) => {
        const name = norm(c.name);
        return name === type || name === stem || (stem.length > 3 && name.includes(stem));
      })) ||
    null
  );
}

/** "BLUE COTTON DRESS" → "BLUE-COTT-DRES-K3F9", with a tail fixed per form. */
function skuFromName(name: string, tail: string): string {
  const stem = name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word.slice(0, 4))
    .join('-');
  return stem ? `${stem}-${tail}` : '';
}

const variantApi = (mode: FormMode) =>
  mode === 'admin'
    ? {
        create: (pid: string, body: ReturnType<typeof buildVariantPayload>) =>
          createVariant(pid, body),
        update: async (
          pid: string,
          vid: string,
          body: Partial<ReturnType<typeof buildVariantPayload>>
        ) => {
          await updateVariant(pid, vid, body);
        },
        remove: (pid: string, vid: string) => deleteVariant(pid, vid),
      }
    : {
        create: (pid: string, body: ReturnType<typeof buildVariantPayload>) =>
          createSellerVariant(pid, body),
        update: (pid: string, vid: string, body: Partial<ReturnType<typeof buildVariantPayload>>) =>
          updateSellerVariant(pid, vid, body),
        remove: (pid: string, vid: string) => deleteSellerVariant(pid, vid),
      };

export const ListingForm: React.FC<ListingFormProps> = ({ mode, productId: initialId, onSaved }) => {
  const router = useRouter();
  // Print / embroidery options of a saved clothing product.
  const [customizations, setCustomizations] = useState<ProductCustomizationRow[] | null>(null);
  const [customizationsKey, setCustomizationsKey] = useState(0);
  const [draft, setDraft] = useState<ListingDraft>(EMPTY_DRAFT);
  const [spec, setSpec] = useState<ArticleSpec | null>(null);
  const [types, setTypes] = useState<ArticleTypeSummary[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [brands, setBrands] = useState<Option[]>([]);
  const [sellers, setSellers] = useState<SellerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(initialId ?? null);
  const [storedStatus, setStoredStatus] = useState<string | null>(null);
  const [moderation, setModeration] = useState<{ status?: string; note?: string | null } | null>(
    null
  );
  const [serverVariantIds, setServerVariantIds] = useState<string[]>([]);
  const [slugTouched, setSlugTouched] = useState(Boolean(initialId));
  const [skuTouched, setSkuTouched] = useState(Boolean(initialId));
  const [busy, setBusy] = useState<null | 'draft' | 'publish'>(null);
  const [typeBusy, setTypeBusy] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);
  const [serverMissing, setServerMissing] = useState<MissingField[]>([]);
  const [showMissing, setShowMissing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pendingType, setPendingType] = useState<{ spec: ArticleSpec; lost: string[] } | null>(
    null
  );
  const [activeSection, setActiveSection] = useState<SectionId>('type');
  const skuTail = useRef<string>('');
  /** The template slug the form applied from a category, not one picked by hand. */
  const autoType = useRef<string | null>(null);

  /* ── Loading ─────────────────────────────────────────────────────── */

  useEffect(() => {
    let cancelled = false;
    // Admins see every category, hidden ones too; a seller sees the active
    // tree. Both come parents-first with the template each one lists with.
    const categoriesP: Promise<CategoryOption[]> =
      mode === 'admin'
        ? listCategories().then((rows) =>
            rows.map((c) => ({
              id: c.id,
              name: c.name,
              isActive: c.isActive,
              depth: c.depth ?? 0,
              template: c.resolvedTemplate ?? null,
            }))
          )
        : listCategoryChoices().then((rows) =>
            rows.map((c) => ({ id: c.id, name: c.name, depth: c.depth, template: c.listingTemplate }))
          );
    const brandsP: Promise<Option[]> = (
      (mode === 'admin' ? listBrands() : listPublicBrands()) as Promise<
        Array<{ id: string; name: string; isActive?: boolean }>
      >
    ).then((rows) =>
      rows.map((b) => ({
        value: b.id,
        label: b.isActive === false ? `${b.name} (hidden)` : b.name,
      }))
    );
    const sellersP = mode === 'admin' ? listSellerOptions() : Promise.resolve<SellerOption[]>([]);
    const productP = initialId ? loadFull(mode, initialId) : Promise.resolve(null);
    const lastP = initialId ? Promise.resolve(null) : getLastBusinessDetails();

    Promise.all([listArticleTypes(), categoriesP, brandsP, sellersP, productP, lastP])
      .then(async ([typeRows, categoryRows, brandRows, sellerRows, loaded, last]) => {
        const loadedSpec = loaded?.product.articleType
          ? await getArticleSpec(loaded.product.articleType, loaded.product.categoryId).catch(
              () => null
            )
          : null;
        if (cancelled) return;
        setTypes(typeRows);
        setCategories(categoryRows);
        setBrands(brandRows);
        setSellers(sellerRows);
        setSpec(loadedSpec);
        if (loaded) {
          setDraft(draftFromProduct(loaded.product, loaded.variants));
          setCustomizations(
            ((loaded.product as unknown as { customizations?: ProductCustomizationRow[] })
              .customizations ?? []) as ProductCustomizationRow[]
          );
          setStoredStatus(String(loaded.product.status));
          setModeration({
            status: loaded.product.moderationStatus,
            note: loaded.product.moderationNote,
          });
          setServerVariantIds(loaded.variants.map((v) => v.id));
        } else if (last) {
          setDraft({
            ...EMPTY_DRAFT,
            manufacturerDetails: last.manufacturerDetails ?? '',
            packerDetails: last.packerDetails ?? '',
            importerDetails: last.importerDetails ?? '',
            countriesOfOrigin: [...(last.countriesOfOrigin ?? []), '', '', '', '', ''].slice(0, 5),
            brandId:
              last.brandId && brandRows.some((b) => b.value === last.brandId) ? last.brandId : '',
            hsn: last.hsn ?? '',
          });
        }
        try {
          const flash = sessionStorage.getItem(FLASH_KEY);
          if (flash) {
            sessionStorage.removeItem(FLASH_KEY);
            setBanner({ tone: 'success', text: flash });
          }
        } catch {
          // Storage can be unavailable; the notice is only a courtesy.
        }
      })
      .catch((error: Error) => {
        if (!cancelled) setLoadError(error.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, initialId]);

  /* ── Unsaved changes ─────────────────────────────────────────────── */

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  /* ── Which section is on screen ──────────────────────────────────── */

  useEffect(() => {
    if (loading) return;
    const nodes = SECTIONS.map((s) => document.getElementById(`lf-section-${s.id}`)).filter(
      (n): n is HTMLElement => Boolean(n)
    );
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0])
          setActiveSection(visible[0].target.id.replace('lf-section-', '') as SectionId);
      },
      { rootMargin: '-15% 0px -70% 0px' }
    );
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [loading, spec]);

  /* ── Editing ─────────────────────────────────────────────────────── */

  const update = useCallback(
    (patch: Partial<ListingDraft>) => {
      setDraft((d) => {
        const next = { ...d, ...patch };
        // The article type is picked first, before anyone says who the garment
        // is for, so the category it suggests is a guess ("Dresses"). When the
        // age group arrives, a category the form chose itself follows it
        // (Kids-Girls → Kids); one the user picked by hand is left alone.
        if ('ageGroup' in patch && !('categoryId' in patch) && patch.ageGroup !== d.ageGroup) {
          const guessed = suggestCategory(categories, d.articleType, d.ageGroup)?.id;
          if (!d.categoryId || d.categoryId === guessed) {
            next.categoryId =
              suggestCategory(categories, d.articleType, patch.ageGroup ?? '')?.id ?? d.categoryId;
          }
        }
        return next;
      });
      setDirty(true);
    },
    [categories]
  );

  /**
   * One colour's family, merged into the latest draft. Suggestions arrive
   * asynchronously, so building the map from a stale draft could undo a family
   * the seller picked in the meantime — this reads the current one.
   */
  const onColourFamily = useCallback((colour: string, family: string | null, onlyIfEmpty = false) => {
    setDraft((d) => {
      if (onlyIfEmpty && d.colourFamilies[colour]) return d;
      const next = { ...d.colourFamilies };
      if (family) next[colour] = family;
      else delete next[colour];
      // Myntra's "Prominent colour" is the same fixed list: the listing's first
      // colour fills it when the seller has not set it themselves.
      const first = (d.colours.find((c) => c.trim()) ?? d.brandColour).trim();
      const fillProminent = family && colour === first && !d.primaryColour.trim();
      return { ...d, colourFamilies: next, ...(fillProminent ? { primaryColour: family } : {}) };
    });
    setDirty(true);
  }, []);

  const withRows = (
    d: ListingDraft,
    colours: string[],
    sizes: string[],
    sku = d.sku
  ): ListingDraft => ({
    ...d,
    colours,
    sizes,
    rows: buildRows(colours, sizes, d.rows, sku, spec?.sizes ?? []),
  });

  const applySku = (d: ListingDraft, sku: string): ListingDraft => ({
    ...d,
    sku,
    rows: d.rows.map((row) =>
      row.skuTouched || !row.size
        ? row
        : {
            ...row,
            // Colour only when the listing really has several (see buildRows).
            sku: sku
              ? suggestVariantSku(sku, d.colours.filter(Boolean).length > 1 ? row.colour : '', row.size)
              : '',
          }
    ),
  });

  const onName = (name: string) => {
    if (!skuTail.current) skuTail.current = Math.random().toString(36).slice(2, 6).toUpperCase();
    const tail = skuTail.current;
    setDraft((d) => {
      let next: ListingDraft = { ...d, name };
      if (!slugTouched) next.slug = slugify(name);
      if (!skuTouched) next = applySku(next, skuFromName(name, tail));
      return next;
    });
    setDirty(true);
  };

  const onSku = (sku: string) => {
    setSkuTouched(true);
    setDraft((d) => applySku(d, sku.toUpperCase().replace(/\s+/g, '-')));
    setDirty(true);
  };

  const onSlug = (slug: string) => {
    setSlugTouched(true);
    update({ slug: slugify(slug.replace(/\s/g, '-')) || slug.toLowerCase() });
  };

  const onSizes = (sizes: string[]) => {
    setDraft((d) => {
      const ordered = orderSizes(sizes, spec?.sizes ?? []);
      // The first size picked brings the brand colour in as the first colour.
      const colours =
        d.colours.length === 0 && d.brandColour.trim() && ordered.length
          ? [d.brandColour.trim()]
          : d.colours;
      return withRows(d, colours, ordered);
    });
    setDirty(true);
  };

  const onColours = (colours: string[]) => {
    setDraft((d) => withRows(d, colours, d.sizes));
    setDirty(true);
  };

  const onRow = (index: number, patch: Partial<VariantRow>) => {
    setDraft((d) => ({
      ...d,
      rows: d.rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
    setDirty(true);
  };

  const onRemoveRow = (index: number) => {
    setDraft((d) => ({ ...d, rows: d.rows.filter((_, i) => i !== index) }));
    setDirty(true);
  };

  const onMeasure = (size: string, key: string, value: string) => {
    setDraft((d) => ({
      ...d,
      measurements: {
        ...d.measurements,
        [size]: { ...(d.measurements[size] ?? {}), [key]: value },
      },
    }));
    setDirty(true);
  };

  /* ── Article type ────────────────────────────────────────────────── */

  const applySpec = (nextSpec: ArticleSpec) => {
    setPendingType(null);
    setSpec(nextSpec);
    setDraft((d) => {
      const attrCols = new Map(
        nextSpec.columns.filter((c) => c.scope === 'attribute').map((c) => [c.key, c])
      );
      const attributes = Object.fromEntries(
        Object.entries(d.attributes).filter(([key, value]) => {
          const col = attrCols.get(key);
          return col && (!col.options || col.options.includes(value));
        })
      );
      const measureKeys = new Set(
        nextSpec.columns.filter((c) => c.scope === 'measurement').map((c) => c.key)
      );
      const measurements = Object.fromEntries(
        Object.entries(d.measurements).map(([size, m]) => [
          size,
          Object.fromEntries(Object.entries(m).filter(([key]) => measureKeys.has(key))),
        ])
      );
      const categoryId =
        d.categoryId || suggestCategory(categories, nextSpec.articleType, d.ageGroup)?.id || '';
      return { ...d, articleType: nextSpec.articleType, attributes, measurements, categoryId };
    });
    setDirty(true);
  };

  const chooseType = (next: string, categoryId: string = draft.categoryId) => {
    if (!next || next === draft.articleType) return;
    setTypeBusy(true);
    getArticleSpec(next, categoryId)
      .then((nextSpec) => {
        const attrCols = new Map(
          nextSpec.columns.filter((c) => c.scope === 'attribute').map((c) => [c.key, c])
        );
        const measureKeys = new Set(
          nextSpec.columns.filter((c) => c.scope === 'measurement').map((c) => c.key)
        );
        const lost = [
          ...Object.entries(draft.attributes)
            .filter(([key, value]) => {
              if (!value) return false;
              const col = attrCols.get(key);
              return !col || (col.options && !col.options.includes(value));
            })
            .map(([key]) => spec?.columns.find((c) => c.key === key)?.label ?? key),
          ...[
            ...new Set(
              Object.values(draft.measurements).flatMap((m) =>
                Object.entries(m)
                  .filter(([key, value]) => value && !measureKeys.has(key))
                  .map(([key]) => spec?.columns.find((c) => c.key === key)?.label ?? key)
              )
            ),
          ],
        ];
        if (draft.articleType && lost.length > 0) setPendingType({ spec: nextSpec, lost });
        else applySpec(nextSpec);
      })
      .catch((error: Error) => setBanner({ tone: 'error', text: error.message }))
      .finally(() => setTypeBusy(false));
  };

  /**
   * The category is picked first, and its template becomes the article type:
   * Footwear lists with UK sizes, Electronics with model and warranty. A type
   * the seller chose by hand is never overridden; one the form chose from an
   * earlier category follows the new category.
   */
  const chooseCategory = (id: string) => {
    update({ categoryId: id });
    // A department with no template of its own (a new one the admin just
    // made) lists with the General template plus the category's own fields.
    const template = id ? (categories.find((c) => c.id === id)?.template ?? 'general') : null;
    const target = template ? types.find((t) => t.slug === template) : undefined;
    if (!target || target.articleType === draft.articleType) return;
    const previousAuto = types.find((t) => t.slug === autoType.current)?.articleType;
    if (draft.articleType && draft.articleType !== previousAuto) return;
    autoType.current = target.slug;
    chooseType(target.articleType, id);
  };

  /**
   * The category's own fields and option name ride on the spec, so a new
   * category (same template, different fields) reloads it. Values typed for
   * fields the new category lacks stay in the draft but are not sent.
   */
  useEffect(() => {
    if (!draft.articleType) return;
    let cancelled = false;
    getArticleSpec(draft.articleType, draft.categoryId || null)
      .then((next) => {
        if (!cancelled) setSpec((current) => (current?.articleType === next.articleType ? next : current));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [draft.articleType, draft.categoryId]);

  /* ── Copy from an existing product ───────────────────────────────── */


  const copyFrom = async (id: string, asColour = false) => {
    const { product, variants } = await loadFull(mode, id);
    const copySpec = product.articleType
      ? await getArticleSpec(product.articleType, product.categoryId).catch(() => null)
      : null;
    if (!skuTail.current) skuTail.current = Math.random().toString(36).slice(2, 6).toUpperCase();
    const base = draftAsCopy(draftFromProduct(product, variants));
    // Another colour of the same design joins its colour group; the source
    // joins it too if it was not in one yet (the group is named after it).
    let group = '';
    if (asColour) {
      group = (product.colourGroupId ?? '').trim() || product.sku;
      base.colourGroupId = group;
      if (!product.colourGroupId) {
        await saveListingProduct(mode, id, { colourGroupId: group }).catch(() => undefined);
      }
    }
    const sku = skuFromName(base.name, skuTail.current);
    setSpec(copySpec);
    setDraft(
      applySku(
        { ...base, slug: slugify(base.name), vendorId: mode === 'admin' ? base.vendorId : '' },
        sku
      )
    );
    setSlugTouched(false);
    setSkuTouched(false);
    setDirty(true);
    setBanner({
      tone: 'info',
      text: asColour
        ? `A new colour of “${product.name}”. The design, sizes and measurements came across; add this colour's name, brand colour, SKUs, photos and stock. Both share colour group ${group}, so the product page links them.`
        : `Copied from “${product.name}”. SKUs, slug, images, colours and stock were left out. Its sizes and measurements came across — remove any size this product does not come in, then add its colour and photos.`,
    });
  };

  // "Add another colour" opens the new-product form with ?colourOf=<id>. It
  // runs once the form's own first load (categories, last business details)
  // has landed, so that load cannot overwrite the copy.
  const colourOfStarted = useRef(false);
  useEffect(() => {
    if (productId || colourOfStarted.current || categories.length === 0) return;
    const sourceId = new URLSearchParams(window.location.search).get('colourOf');
    if (!sourceId) return;
    colourOfStarted.current = true;
    // Started from a resolved promise: every state change lands in a callback.
    Promise.resolve(sourceId)
      .then((id) => copyFrom(id, true))
      .catch((error: Error) =>
        setBanner({ tone: 'error', text: `Could not start the new colour: ${error.message}` })
      );
    // copyFrom is recreated every render; this must run once per arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, productId]);

  /* ── Checklist ───────────────────────────────────────────────────── */

  const checklist = useMemo(() => buildChecklist(draft, spec), [draft, spec]);
  const openItems = checklist.filter((item) => !item.done);
  const ready = openItems.length === 0 && Boolean(spec);

  const missingIds = useMemo(() => {
    const ids = new Set<string>();
    if (!showMissing) return ids;
    for (const item of openItems) ids.add(item.target);
    if (spec) {
      for (const column of spec.columns) {
        if (!column.required) continue;
        if (column.scope === 'variant' && column.field) {
          const field = column.field;
          draft.rows.forEach((row, index) => {
            if (!row.size) return;
            const empty =
              field === 'sizeOnLabel'
                ? row.sizeOnLabel === ''
                : field === 'standardSize'
                  ? !row.standardSize
                  : field === 'gtin'
                    ? !row.gtin.trim()
                    : field === 'sku'
                      ? !row.sku.trim()
                      : false;
            if (empty) ids.add(rowFieldId(index, field));
          });
        }
        if (column.scope === 'measurement') {
          const keys = [column.key, ...(column.anyOf ?? [])];
          draft.sizes.forEach((size, index) => {
            if (!keys.some((key) => (draft.measurements[size]?.[key] ?? '').trim()))
              ids.add(measureId(index, column.key));
          });
        }
      }
    }
    return ids;
  }, [showMissing, openItems, spec, draft.rows, draft.sizes, draft.measurements]);

  const sectionMissing = (id: SectionId) => openItems.filter((item) => item.section === id).length;

  const jump = (target: string) => {
    setShowMissing(true);
    const el = document.getElementById(target);
    if (!el) return;
    const details = el.closest('details');
    if (details && !details.open) details.open = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    (el as HTMLElement).focus({ preventScroll: true });
  };

  const goSection = (id: SectionId) => {
    const el = document.getElementById(`lf-section-${id}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveSection(id);
  };

  /* ── Saving ──────────────────────────────────────────────────────── */

  const isLive = storedStatus === 'ACTIVE';
  const secondaryStatus: ProductStatus = draft.status === 'ACTIVE' ? 'DRAFT' : draft.status;

  const save = async (intent: 'draft' | 'publish') => {
    setBanner(null);
    setShowMissing(true);
    const blockers = saveBlockers(draft);
    if (blockers.length) {
      setBanner({
        tone: 'error',
        text: 'Fix these before saving:',
        items: blockers.map((b) => b.label),
      });
      jump(blockers[0].target);
      return;
    }

    setBusy(intent);
    const snapshot = draft;
    let id = productId;
    let productSaved = false;
    let created = false;
    let navigated = false;
    let reviewNote = '';
    try {
      // 1. The product itself, as a draft unless it is already live (a live
      //    listing stays live while it is edited; the server re-checks it).
      const status: ProductStatus | undefined =
        intent === 'publish' ? (isLive ? undefined : 'DRAFT') : secondaryStatus;
      const saved = await saveListingProduct(
        mode,
        id,
        buildProductPayload(snapshot, spec, mode, status)
      );
      productSaved = true;
      if (/review/i.test(saved.message)) reviewNote = saved.message;
      created = !id;
      id = saved.product.id;
      if (created) {
        setProductId(id);
        setSlugTouched(true);
        setSkuTouched(true);
      }
      setStoredStatus(saved.product.status);
      onSaved?.(saved.product);
      // Switching personalisation on gives the product starter options on the
      // server; read them back so the editor shows what the shopper will see.
      if (snapshot.isCustomizable && spec && isApparel(spec)) {
        loadFull(mode, id)
          .then((fresh) => {
            setCustomizations(
              ((fresh.product as unknown as { customizations?: ProductCustomizationRow[] })
                .customizations ?? []) as ProductCustomizationRow[]
            );
            setCustomizationsKey((k) => k + 1);
          })
          .catch(() => undefined);
      }
      if (saved.product.moderationStatus)
        setModeration((m) => ({ ...m, status: saved.product.moderationStatus }));
      setDraft((d) => ({ ...d, slug: saved.product.slug ?? d.slug }));

      // 2. Sizes: removals first, so a SKU can move from a removed row to a new one.
      const api = variantApi(mode);
      const keep = new Set(snapshot.rows.map((r) => r.id).filter(Boolean));
      const errors: string[] = [];
      const remaining: string[] = [];
      for (const vid of serverVariantIds) {
        if (keep.has(vid)) continue;
        try {
          await api.remove(id, vid);
        } catch (error) {
          remaining.push(vid);
          errors.push((error as Error).message);
        }
      }
      const idsByKey = new Map<string, string>();
      for (const row of snapshot.rows) {
        const body = buildVariantPayload(snapshot, row);
        const label = `${row.colour ? `${row.colour} ` : ''}${row.size || row.sku}`;
        try {
          if (row.id) {
            await api.update(id, row.id, body);
            idsByKey.set(row.key, row.id);
          } else {
            const createdVariant = await api.create(id, body);
            idsByKey.set(row.key, createdVariant.id);
            // Create stores the basics; the listing values go on with an update.
            const { standardSize, sizeOnLabel, gtin, measurements } = body;
            if (standardSize || sizeOnLabel !== null || gtin || Object.keys(measurements).length) {
              await api.update(id, createdVariant.id, {
                standardSize,
                sizeOnLabel,
                gtin,
                measurements,
              });
            }
          }
        } catch (error) {
          errors.push(`${label}: ${(error as Error).message}`);
        }
      }
      setServerVariantIds([...idsByKey.values(), ...remaining]);
      setDraft((d) => ({
        ...d,
        rows: d.rows.map((row) =>
          idsByKey.has(row.key) ? { ...row, id: idsByKey.get(row.key) } : row
        ),
      }));
      if (errors.length) {
        setBanner({
          tone: 'error',
          text: 'The listing was saved, but some sizes were not:',
          items: errors,
        });
        return;
      }

      // 3. Go live, which is where the server checks the listing is complete.
      if (intent === 'publish') {
        const live = await saveListingProduct(mode, id, { status: 'ACTIVE' });
        setStoredStatus(live.product.status);
        onSaved?.(live.product);
        if (/review/i.test(live.message)) reviewNote = live.message;
      }

      const finalStatus: ProductStatus = intent === 'publish' ? 'ACTIVE' : secondaryStatus;
      setDraft((d) => ({ ...d, status: finalStatus }));
      setServerMissing([]);
      setShowMissing(false);
      setDirty(false);
      // A seller's listing waits for moderation, so "live" would be untrue;
      // and a draft is not going anywhere, so it gets no review note at all.
      const inReview = mode === 'seller' && Boolean(reviewNote);
      const text =
        intent === 'publish'
          ? inReview
            ? 'Submitted for review — it goes on sale once our team has checked it.'
            : isLive
              ? 'Saved — the listing is still live.'
              : 'Published — the listing is live.'
          : `Saved as ${finalStatus.toLowerCase()}.`;
      if (created) {
        // Reopen as the edit page so its extra editors load; the notice
        // survives the navigation through session storage.
        try {
          sessionStorage.setItem(FLASH_KEY, text);
        } catch {
          // Without storage the notice is simply lost.
        }
        navigated = true;
        router.replace(editHref(mode, id));
        return;
      }
      setBanner({ tone: 'success', text });
    } catch (error) {
      if (error instanceof ListingSaveError && error.status === 409 && error.missing.length) {
        setServerMissing(error.missing);
        setBanner({
          tone: 'error',
          text: productSaved
            ? `Saved as a draft, but not published: ${error.missing.length} required field${error.missing.length === 1 ? ' is' : 's are'} still missing (see the checklist).`
            : error.message,
        });
      } else {
        const conflict = error instanceof ListingSaveError ? error.conflict : undefined;
        setBanner({
          tone: 'error',
          text: productSaved ? `Saved, but: ${(error as Error).message}` : (error as Error).message,
          link: conflict
            ? {
                href: editHref(mode, conflict.id),
                label: conflict.status === 'DISCONTINUED' ? `Open “${conflict.name}” to restore it` : `Open “${conflict.name}”`,
              }
            : undefined,
        });
      }
    } finally {
      setBusy(null);
      // A new listing that stays on screen (a refusal, a size that failed)
      // now has an address; point the URL at it so a reload opens it.
      if (created && !navigated && id) window.history.replaceState(null, '', editHref(mode, id));
    }
  };

  /* ── Render ──────────────────────────────────────────────────────── */

  if (loading) {
    return (
      <p className="lf-loading" role="status">
        Loading the listing form…
      </p>
    );
  }
  if (loadError) {
    return (
      <p className="alert alert-error text-sm" role="alert">
        {loadError}
      </p>
    );
  }

  const suggestion = suggestCategory(categories, draft.articleType, draft.ageGroup);
  const serverMissingTargets = serverMissing.map((m) => ({
    ...m,
    target: targetForMissing(m, spec, draft),
  }));
  const typeOptions: Option[] = types.map((t) => ({
    value: t.articleType,
    label: `${t.articleType}${t.family === 'general' ? '' : ' (clothing)'} — ${t.required} required`,
  }));
  const apparel = isApparel(spec);
  // Printing and embroidery need an actual clothing template, not just "no template yet".
  const offersPersonalisation = spec !== null && apparel;
  const selectedCategory = categories.find((c) => c.id === draft.categoryId);
  const categoryTemplate = selectedCategory?.template
    ? types.find((t) => t.slug === selectedCategory.template)
    : undefined;
  const step = (id: SectionId) => SECTIONS.findIndex((s) => s.id === id) + 1;
  const sectionStatus = (id: SectionId) => {
    const n = sectionMissing(id);
    return n > 0 ? (
      <span className="lf-badge lf-badge--todo">{n} to do</span>
    ) : spec ? (
      <span className="lf-badge lf-badge--done">Complete</span>
    ) : null;
  };
  const packagingCols = [
    'netQuantity',
    'netQuantityUnit',
    'numberOfItems',
    'multipackSet',
    'packageContains',
  ];
  const col = (field: string) => productColumn(spec, field);

  return (
    <MissingContext.Provider value={missingIds}>
      <div className="lf-root">
        <div className="lf" data-mode={mode}>
          <nav className="lf-nav" aria-label="Form sections">
            <ul>
              {SECTIONS.map((s) => {
                const n = sectionMissing(s.id);
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      className="lf-nav-item"
                      aria-current={activeSection === s.id ? 'step' : undefined}
                      onClick={() => goSection(s.id)}
                    >
                      <span>{s.label}</span>
                      {n > 0 && (
                        <span className="lf-nav-count">
                          {n}
                          <span className="sr-only"> required left</span>
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="lf-main">
            {banner && (
              <div
                className={`lf-banner lf-banner--${banner.tone}`}
                role={banner.tone === 'error' ? 'alert' : 'status'}
              >
                <p>{banner.text}</p>
                {banner.link && (
                  <p>
                    <Link href={banner.link.href} className="lf-link">
                      {banner.link.label}
                    </Link>
                  </p>
                )}
                {banner.items && (
                  <ul>
                    {banner.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {mode === 'seller' && moderation?.status && moderation.status !== 'APPROVED' && (
              <div
                className={`lf-banner lf-banner--${moderation.status === 'REJECTED' ? 'error' : 'info'}`}
                role="status"
              >
                <p>
                  {moderation.status === 'PENDING'
                    ? 'Waiting for review: this listing goes on sale once our team has checked it.'
                    : `Sent back by our team${moderation.note ? `: ${moderation.note}` : '.'} Fix it and save to resubmit.`}
                </p>
              </div>
            )}

            {!productId && <CopyFrom mode={mode} onPick={copyFrom} />}
            {productId && (
              <div className="lf-copy lf-inline lf-wrap" style={{ justifyContent: 'space-between' }}>
                <span className="lf-hint" style={{ margin: 0 }}>
                  Same design in another colour? Start it from this one — the design, sizes and
                  measurements come across, and the two are linked on the product page.
                </span>
                <Link href={`${newHref(mode)}?colourOf=${productId}`} className="btn btn-outline btn-sm">
                  Add another colour
                </Link>
              </div>
            )}

            <Section
              id="type"
              step={step('type')}
              title="Category & article type"
              status={sectionStatus('type')}
              description="Pick the category first — it chooses the article type, which decides every field below."
            >
              <div className="lf-grid">
                <div className="lf-field">
                  <SelectField
                    id={fieldId('categoryId')}
                    label="Category on our store"
                    required
                    value={draft.categoryId}
                    options={categories.map((c) => ({ value: c.id, label: categoryLabel(c) }))}
                    onChange={chooseCategory}
                  />
                  {suggestion && suggestion.id !== draft.categoryId && (
                    <p className="lf-hint">
                      Suggested: <strong>{suggestion.name}</strong>{' '}
                      <button
                        type="button"
                        className="lf-link"
                        onClick={() => update({ categoryId: suggestion.id })}
                      >
                        Use it
                      </button>
                    </p>
                  )}
                </div>
                <SelectField
                  id={fieldId('articleType')}
                  label="Article type"
                  required
                  value={draft.articleType}
                  options={typeOptions}
                  placeholder={typeBusy ? 'Loading…' : 'Choose an article type…'}
                  hint={
                    categoryTemplate && categoryTemplate.articleType !== draft.articleType
                      ? `${selectedCategory?.name} usually lists as ${categoryTemplate.articleType}.`
                      : categoryTemplate
                        ? `Set by ${selectedCategory?.name}. Change it if this product is different.`
                        : undefined
                  }
                  onChange={(value) => {
                    // Picked by hand: a later category change leaves it alone.
                    autoType.current = null;
                    chooseType(value);
                  }}
                />
                {mode === 'admin' && (
                  <SelectField
                    id={fieldId('vendorId')}
                    label="Sold by"
                    value={draft.vendorId}
                    placeholder="Us — house stock"
                    options={sellers.map((s) => ({
                      value: s.id,
                      label: `${s.shopName}${s.isVerified ? '' : ' — awaiting approval'}${s.isActive ? '' : ' — suspended'}`,
                    }))}
                    hint={
                      draft.vendorId
                        ? 'Belongs to this seller: it shows on their shop and pays out less commission.'
                        : 'House stock: our own listing, no commission.'
                    }
                    onChange={(value) => update({ vendorId: value })}
                  />
                )}
              </div>
              {pendingType && (
                <div
                  className="lf-confirm"
                  role="alertdialog"
                  aria-labelledby="lf-confirm-title"
                  aria-describedby="lf-confirm-body"
                >
                  <p id="lf-confirm-title" className="lf-confirm-title">
                    Change to {pendingType.spec.articleType}?
                  </p>
                  <p id="lf-confirm-body" className="lf-hint">
                    These {draft.articleType}-specific values will be cleared:{' '}
                    {pendingType.lost.join(', ')}.
                  </p>
                  <div className="lf-inline">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => applySpec(pendingType.spec)}
                    >
                      Change type
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => setPendingType(null)}
                    >
                      Keep {draft.articleType}
                    </button>
                  </div>
                </div>
              )}
            </Section>

            {!spec ? (
              <p className="lf-empty">
                Choose a category (or an article type) to continue. Each type has its own sizes or
                options, attributes and — for clothing — measurements.
              </p>
            ) : (
              <>
                <Section
                  id="business"
                  step={step('business')}
                  title="Business details"
                  status={sectionStatus('business')}
                  description="Identity, price, classification and the legal details printed on the label."
                >
                  <BusinessSection
                    mode={mode}
                    draft={draft}
                    spec={spec}
                    brands={brands}
                    update={update}
                    onName={onName}
                    onSku={onSku}
                    onSlug={onSlug}
                    onAddBrand={async (name) => {
                      const brand = await addBrand(name);
                      setBrands((current) =>
                        current.some((b) => b.value === brand.id)
                          ? current
                          : [...current, { value: brand.id, label: brand.name }].sort((a, b) =>
                              a.label.localeCompare(b.label)
                            )
                      );
                      update({ brandId: brand.id });
                    }}
                  />
                </Section>

                <Section
                  id="attributes"
                  step={step('attributes')}
                  title={`${spec.articleType} attributes`}
                  status={sectionStatus('attributes')}
                  description={
                    apparel
                      ? 'How shoppers filter for it. Values come from Myntra’s lists.'
                      : 'What shoppers compare and filter by. Shown as the specification table.'
                  }
                >
                  <AttributesSection
                    spec={spec}
                    attributes={draft.attributes}
                    onChange={(key, value) => {
                      setDraft((d) => ({ ...d, attributes: { ...d.attributes, [key]: value } }));
                      setDirty(true);
                    }}
                  />
                </Section>

                <Section
                  id="content"
                  step={step('content')}
                  title="Content"
                  status={sectionStatus('content')}
                  description="The words on the product page."
                >
                  <div className="lf-grid">
                    <AreaField
                      id={fieldId('description')}
                      label={col('description')?.label ?? 'Product details'}
                      required={col('description')?.required}
                      rows={5}
                      value={draft.description}
                      onChange={(value) => update({ description: value })}
                    />
                    <TextField
                      id={fieldId('shortDescription')}
                      label="Short description"
                      wide
                      value={draft.shortDescription}
                      maxLength={300}
                      onChange={(value) => update({ shortDescription: value })}
                      hint="One line under the title."
                    />
                    {apparel && (
                      <AreaField
                        id={fieldId('styleNote')}
                        label={col('styleNote')?.label ?? 'Style note'}
                        required={col('styleNote')?.required}
                        value={draft.styleNote}
                        maxLength={2000}
                        onChange={(value) => update({ styleNote: value })}
                      />
                    )}
                    <AreaField
                      id={fieldId('materialCare')}
                      label={col('materialCare')?.label ?? 'Material & care'}
                      required={col('materialCare')?.required}
                      value={draft.materialCare}
                      maxLength={1000}
                      placeholder={
                        apparel ? 'e.g. 100% cotton. Machine wash cold.' : 'e.g. Wipe clean with a dry cloth.'
                      }
                      onChange={(value) => update({ materialCare: value })}
                    />
                    {apparel && (
                      <AreaField
                        id={fieldId('sizeAndFit')}
                        label={col('sizeAndFit')?.label ?? 'Size & fit'}
                        required={col('sizeAndFit')?.required}
                        value={draft.sizeAndFit}
                        maxLength={1000}
                        placeholder="e.g. The model (height 5'8) is wearing a size S."
                        onChange={(value) => update({ sizeAndFit: value })}
                      />
                    )}
                    <ChipInput
                      id={fieldId('tags')}
                      label="Tags"
                      noun="tag"
                      values={draft.tags}
                      required={col('tags')?.required}
                      onChange={(tags) => update({ tags })}
                      placeholder="Type a tag and press Enter"
                      hint="Up to 30. Helps search."
                    />
                  </div>
                </Section>

                <Section
                  id="sizes"
                  step={step('sizes')}
                  title={apparel ? 'Sizes, stock & measurements' : `${spec.optionLabel}s, colours & stock`}
                  status={sectionStatus('sizes')}
                  description={
                    apparel
                      ? `${spec.articleType} sizes come from Myntra’s size chart for this type.`
                      : spec.freeOptions
                        ? `Each ${spec.optionLabel.toLowerCase()} gets its own SKU, stock and (optionally) price.`
                        : `${spec.articleType} ${spec.optionLabel.toLowerCase()}s, each with its own SKU, stock and (optionally) price.`
                  }
                >
                  <SizesSection
                    draft={draft}
                    spec={spec}
                    missing={missingIds}
                    onSizes={onSizes}
                    onColours={onColours}
                    onRow={onRow}
                    onRemoveRow={onRemoveRow}
                    onMeasure={onMeasure}
                    update={update}
                    onColourFamily={onColourFamily}
                  />
                </Section>

                <Section
                  id="images"
                  step={step('images')}
                  title="Images by angle"
                  status={sectionStatus('images')}
                >
                  <ImagesSection
                    mode={mode}
                    angles={draft.imageAngles}
                    withLookShot={apparel}
                    missing={missingIds}
                    onChange={(angle, url) => {
                      setDraft((d) => ({ ...d, imageAngles: { ...d.imageAngles, [angle]: url } }));
                      setDirty(true);
                    }}
                  />
                </Section>

                <Section
                  id="packaging"
                  step={step('packaging')}
                  title="Packaging & compliance"
                  status={sectionStatus('packaging')}
                >
                  <div className="lf-grid">
                    {packagingCols.map((field) => {
                      const c = col(field);
                      if (!c) return null;
                      const value = draft[field as keyof ListingDraft] as string;
                      return c.options ? (
                        <SelectField
                          key={field}
                          id={fieldId(field)}
                          label={c.label}
                          required={c.required}
                          value={value}
                          options={c.options}
                          onChange={(v) => update({ [field]: v } as Partial<ListingDraft>)}
                        />
                      ) : (
                        <TextField
                          key={field}
                          id={fieldId(field)}
                          label={c.label}
                          required={c.required}
                          value={value}
                          type={c.kind === 'number' ? 'number' : 'text'}
                          min={c.kind === 'number' ? 0 : undefined}
                          placeholder={field === 'packageContains' ? 'e.g. 1 dress' : undefined}
                          onChange={(v) => update({ [field]: v } as Partial<ListingDraft>)}
                        />
                      );
                    })}
                  </div>
                  <h3 className="lf-subhead">BIS certificate (optional)</h3>
                  <div className="lf-grid">
                    <TextField
                      id={fieldId('bisNumber')}
                      label="BIS certificate number"
                      value={draft.bisNumber}
                      onChange={(v) => update({ bisNumber: v })}
                    />
                    <TextField
                      id={fieldId('bisImageUrl')}
                      label="BIS certificate image URL"
                      value={draft.bisImageUrl}
                      onChange={(v) => update({ bisImageUrl: v })}
                    />
                    <TextField
                      id={fieldId('bisExpiryDate')}
                      label="BIS expiry date"
                      type="date"
                      value={draft.bisExpiryDate}
                      onChange={(v) => update({ bisExpiryDate: v })}
                    />
                  </div>
                </Section>

                <Section
                  id="visibility"
                  step={step('visibility')}
                  title={mode === 'admin' ? 'Visibility & SEO' : 'Visibility'}
                >
                  <div className="lf-grid">
                    <SelectField
                      id={fieldId('status')}
                      label="Status"
                      value={draft.status === 'DRAFT' ? '' : draft.status}
                      placeholder="Draft"
                      options={(mode === 'admin'
                        ? ['ACTIVE', 'INACTIVE', 'DISCONTINUED']
                        : ['ACTIVE']
                      ).map((s) => ({
                        value: s,
                        label: s.charAt(0) + s.slice(1).toLowerCase(),
                      }))}
                      hint={
                        draft.status === 'ACTIVE'
                          ? 'Use Publish to go live — it checks the listing is complete first.'
                          : `“Save” stores the listing as ${draft.status.toLowerCase()}.`
                      }
                      onChange={(value) => update({ status: (value || 'DRAFT') as ProductStatus })}
                    />
                  </div>
                  {/* Printing and embroidery are a clothing service: the
                      switch only exists for clothing templates. */}
                  {offersPersonalisation && (
                    <div className="lf-checks">
                      <CheckField
                        label="Offer printing / embroidery"
                        checked={draft.isCustomizable}
                        onChange={(v) => update({ isCustomizable: v })}
                        hint={
                          productId
                            ? 'Shoppers can add their own print or embroidery. Set the options below.'
                            : 'Shoppers can add their own print or embroidery. Options appear after the first save.'
                        }
                      />
                    </div>
                  )}
                  {offersPersonalisation && draft.isCustomizable && productId && customizations && (
                    <CustomizationEditor
                      key={customizationsKey}
                      productId={productId}
                      initial={customizations}
                      as={mode}
                    />
                  )}
                  {mode === 'admin' && (
                    <>
                      <div className="lf-checks">
                        <CheckField
                          label="Featured"
                          checked={draft.isFeatured}
                          onChange={(v) => update({ isFeatured: v })}
                          hint="Shown in featured rails on the home page."
                        />
                        <CheckField
                          label="Bulk orders"
                          checked={draft.allowBulkOrders}
                          onChange={(v) => update({ allowBulkOrders: v })}
                          hint="Allow business buyers to order in quantity."
                        />
                      </div>
                      <div className="lf-grid">
                        <TextField
                          id={fieldId('metaTitle')}
                          label="Meta title"
                          value={draft.metaTitle}
                          maxLength={70}
                          onChange={(v) => update({ metaTitle: v })}
                          placeholder={draft.displayName || draft.name}
                        />
                        <TextField
                          id={fieldId('metaKeywords')}
                          label="Meta keywords"
                          value={draft.metaKeywords}
                          onChange={(v) => update({ metaKeywords: v })}
                        />
                        <AreaField
                          id={fieldId('metaDescription')}
                          label="Meta description"
                          value={draft.metaDescription}
                          maxLength={160}
                          rows={2}
                          onChange={(v) => update({ metaDescription: v })}
                        />
                      </div>
                    </>
                  )}
                </Section>
              </>
            )}
          </div>

          <aside className="lf-aside" aria-label="Go-live checklist">
            <Checklist
              items={checklist}
              serverMissing={serverMissingTargets}
              hasType={Boolean(spec)}
              onJump={(target) => jump(target)}
            />
          </aside>

          <div className="lf-footer">
            <div className="lf-footer-inner">
              <p className="lf-footer-note" id="lf-publish-note">
                {ready
                  ? isLive
                    ? 'Live. Saving re-checks it is still complete.'
                    : 'Complete — ready to publish.'
                  : `${openItems.length} required ${openItems.length === 1 ? 'field' : 'fields'} left before publishing.`}
                {dirty && <span className="lf-muted"> · Unsaved changes</span>}
              </p>
              <div className="lf-inline">
                <Link
                  href={mode === 'admin' ? '/admin/products' : '/seller/products'}
                  className="btn btn-ghost btn-sm lf-cancel"
                >
                  Cancel
                </Link>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={busy !== null}
                  onClick={() => void save('draft')}
                >
                  {busy === 'draft'
                    ? 'Saving…'
                    : isLive && secondaryStatus === 'DRAFT'
                      ? 'Move to draft'
                      : secondaryStatus === 'DRAFT'
                        ? 'Save draft'
                        : `Save as ${secondaryStatus.toLowerCase()}`}
                </button>
                <span
                  title={
                    ready ? undefined : `Complete the checklist first (${openItems.length} left)`
                  }
                >
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={!ready || busy !== null}
                    aria-describedby="lf-publish-note"
                    onClick={() => void save('publish')}
                  >
                    {busy === 'publish' ? 'Publishing…' : isLive ? 'Save & keep live' : 'Publish'}
                  </button>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </MissingContext.Provider>
  );
};

/* ── Copy from an existing product ─────────────────────────────────── */

interface CopyFromProps {
  mode: FormMode;
  onPick: (id: string) => Promise<void>;
}

const CopyFrom: React.FC<CopyFromProps> = ({ mode, onPick }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ id: string; name: string; sku: string }> | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'admin') {
        const page = await listProducts({ search: query.trim(), limit: 8 });
        setResults(page.products.map((p) => ({ id: p.id, name: p.name, sku: p.sku })));
      } else {
        const q = query.trim().toLowerCase();
        const rows = await getSellerProducts();
        setResults(
          rows
            .filter(
              (p) => !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
            )
            .slice(0, 8)
            .map((p) => ({ id: p.id, name: p.name, sku: p.sku }))
        );
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pick = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await onPick(id);
      setResults(null);
      setQuery('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="lf-copy">
      <summary>Copy from an existing product</summary>
      <p className="lf-hint">Prefills everything except SKUs, slug and images.</p>
      <div className="lf-inline">
        <label htmlFor="lf-copy-search" className="sr-only">
          Search your products
        </label>
        <input
          id="lf-copy-search"
          type="search"
          className="lf-input"
          placeholder="Search by name or SKU"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void search();
            }
          }}
        />
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={busy}
          onClick={() => void search()}
        >
          {busy ? 'Searching…' : 'Search'}
        </button>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {results && (
        <ul className="lf-copy-results">
          {results.length === 0 && <li className="lf-hint">No products match.</li>}
          {results.map((r) => (
            <li key={r.id}>
              <span className="min-w-0">
                <span className="lf-copy-name">{r.name}</span>{' '}
                <span className="lf-mono lf-muted">{r.sku}</span>
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={() => void pick(r.id)}
              >
                Copy
              </button>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
};
