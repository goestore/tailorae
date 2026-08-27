'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDispatch } from 'react-redux';
import { CUSTOMIZATION_LOCATION_LABELS } from '@/config/custom-wear/taxonomy';
import { customWearContent } from '@/config/custom-wear/content';
import { buildCartItem } from '@/lib/custom-wear/cart';
import { calculatePricing } from '@/lib/custom-wear/pricing';
import { createDesignUpload, releaseDesignUpload } from '@/lib/custom-wear/uploads';
import { trackCustomWearEvent } from '@/lib/custom-wear/analytics';
import { useUrlPurchaseMode } from '@/hooks/useUrlPurchaseMode';
import { addToCart } from '@/store/slices/cart';
import type {
  CustomWearProduct,
  CustomizationLocationId,
  CustomizationPlacement,
  CustomizationSelection,
  ProductColor,
  PurchaseMode,
  QuantityPricing,
} from '@/types/custom-wear';

export interface ConfigErrors {
  color?: string;
  size?: string;
  artwork?: string;
}

export interface ProductConfig {
  mode: PurchaseMode;
  setMode: (mode: PurchaseMode) => void;

  color?: ProductColor;
  colorId: string | null;
  setColor: (id: string) => void;
  /** False until the shopper picks a colour themselves. */
  colorTouched: boolean;

  sizeIds: string[];
  toggleSize: (id: string) => void;

  quantity: number;
  minQuantity: number;
  setQuantity: (value: number) => void;

  selection: CustomizationSelection;
  activePlacementId: string | null;
  setActivePlacement: (id: string | null) => void;
  addPlacement: (location: CustomizationLocationId) => void;
  patchPlacement: (id: string, patch: Partial<CustomizationPlacement>) => void;
  removePlacement: (id: string) => void;
  addFiles: (files: FileList | null) => void;
  removeUpload: (id: string) => void;
  setNotes: (notes: string) => void;
  uploadError: string | null;

  pricing: QuantityPricing;
  errors: ConfigErrors;
  clearError: (key: keyof ConfigErrors) => void;

  /**
   * Validates and adds to the cart, returning what it found. The errors come
   * back from the call rather than only landing in state, because a caller
   * reacting to them in the same tick would otherwise read the previous
   * render's value — stale and usually empty.
   */
  commitToCart: () => { ok: boolean; errors: ConfigErrors };
  /** True once artwork exists on at least one area. */
  hasArtwork: boolean;
}

let placementSeq = 0;

const emptySelection = (): CustomizationSelection => ({
  placements: [],
  uploads: [],
  notes: '',
});

/**
 * Everything the product page and the designer both need.
 *
 * These two surfaces show the same order from different angles — the page sells
 * it, the designer decorates it — so the state lives here rather than in either
 * of them. Before this, one component owned colour, sizes, quantity, artwork,
 * uploads, pricing, validation, cart and quote together, which is why changing
 * the layout kept breaking behaviour: there was no seam between what the order
 * *is* and how it happens to be drawn.
 */
export function useProductConfig(product: CustomWearProduct): ProductConfig {
  const router = useRouter();
  const dispatch = useDispatch();

  const urlMode = useUrlPurchaseMode();
  const [mode, setModeState] = useState<PurchaseMode>('shop');
  const [syncedMode, setSyncedMode] = useState<PurchaseMode>('shop');
  if (syncedMode !== urlMode) {
    setSyncedMode(urlMode);
    setModeState(urlMode);
  }

  const [colorId, setColorId] = useState<string | null>(product.colors[0]?.id ?? null);
  const [colorTouched, setColorTouched] = useState(false);
  const [sizeIds, setSizeIds] = useState<string[]>([]);
  const minQuantity = Math.max(1, product.minOrderQuantity ?? 1);
  const [quantity, setQuantityState] = useState(
    Math.max(product.defaultQuantity ?? 1, minQuantity)
  );
  const [selection, setSelection] = useState<CustomizationSelection>(emptySelection);
  const [activePlacementId, setActivePlacement] = useState<string | null>(null);
  const [errors, setErrors] = useState<ConfigErrors>({});
  const [uploadError, setUploadError] = useState<string | null>(null);

  const color = product.colors.find((entry) => entry.id === colorId);

  const pricing = useMemo(
    () => calculatePricing({ product, quantity, placements: selection.placements }),
    [product, quantity, selection.placements]
  );

  const clearError = useCallback(
    (key: keyof ConfigErrors) => setErrors((current) => ({ ...current, [key]: undefined })),
    []
  );

  const setMode = useCallback(
    (next: PurchaseMode) => {
      setModeState(next);
      setErrors({});
      trackCustomWearEvent('custom_wear_mode_changed', { mode: next, productId: product.id });

      const params = new URLSearchParams(window.location.search);
      if (next === 'quote') params.set('mode', 'quote');
      else params.delete('mode');
      const query = params.toString();
      router.replace(query ? `?${query}` : window.location.pathname, { scroll: false });
    },
    [product.id, router]
  );

  const setColor = useCallback(
    (id: string) => {
      setColorId(id);
      setColorTouched(true);
      clearError('color');
      trackCustomWearEvent('custom_wear_color_selected', {
        productId: product.id,
        color: id,
        surface: 'detail',
      });
    },
    [product.id, clearError]
  );

  const toggleSize = useCallback(
    (id: string) => {
      // A quote can cover a size run; a cart line is one size.
      setSizeIds((current) =>
        mode === 'quote'
          ? current.includes(id)
            ? current.filter((entry) => entry !== id)
            : [...current, id]
          : current[0] === id
            ? []
            : [id]
      );
      clearError('size');
    },
    [mode, clearError]
  );

  const setQuantity = useCallback(
    (value: number) => setQuantityState(Math.max(minQuantity, value)),
    [minQuantity]
  );

  const addPlacement = useCallback(
    (location: CustomizationLocationId) => {
      placementSeq += 1;
      const id = `pl-${placementSeq}`;
      setSelection((current) => ({
        ...current,
        placements: [
          ...current.placements,
          { id, location, method: null, templateId: null, uploadId: null, scale: 0.7 },
        ],
      }));
      setActivePlacement(id);
      clearError('artwork');
      trackCustomWearEvent('custom_wear_placement_added', { productId: product.id, location });
    },
    [product.id, clearError]
  );

  const patchPlacement = useCallback(
    (id: string, patch: Partial<CustomizationPlacement>) => {
      setSelection((current) => ({
        ...current,
        placements: current.placements.map((placement) =>
          placement.id === id ? { ...placement, ...patch } : placement
        ),
      }));
      clearError('artwork');
    },
    [clearError]
  );

  const removePlacement = useCallback(
    (id: string) => {
      setSelection((current) => ({
        ...current,
        placements: current.placements.filter((placement) => placement.id !== id),
      }));
      setActivePlacement((current) => (current === id ? null : current));
    },
    []
  );

  const addFiles = useCallback(
    (files: FileList | null) => {
      if (!files?.length) return;

      const { maxFiles } = customWearContent.upload;
      const room = maxFiles - selection.uploads.length;
      if (room <= 0) {
        setUploadError(`You can attach ${maxFiles} files.`);
        return;
      }

      const created = Array.from(files).slice(0, room).map((file) => createDesignUpload(file));
      const rejected = created.find((upload) => upload.status === 'error');
      setUploadError(rejected?.error ?? null);

      // A rejected file may still hold an object URL; release it now.
      created.filter((upload) => upload.status === 'error').forEach(releaseDesignUpload);
      const accepted = created.filter((upload) => upload.status !== 'error');
      if (accepted.length === 0) return;

      setSelection((current) => ({
        ...current,
        uploads: [...current.uploads, ...accepted],
        // Drop the first new file straight onto the selected area, so choosing
        // an area then a file is one continuous action.
        placements: activePlacementId
          ? current.placements.map((placement) =>
              placement.id === activePlacementId
                ? { ...placement, uploadId: accepted[0].id, templateId: null }
                : placement
            )
          : current.placements,
      }));
      clearError('artwork');
      trackCustomWearEvent('custom_wear_design_uploaded', {
        productId: product.id,
        files: accepted.length,
      });
    },
    [selection.uploads.length, activePlacementId, product.id, clearError]
  );

  const removeUpload = useCallback((id: string) => {
    setSelection((current) => {
      const upload = current.uploads.find((entry) => entry.id === id);
      if (upload) releaseDesignUpload(upload);
      return {
        ...current,
        uploads: current.uploads.filter((entry) => entry.id !== id),
        placements: current.placements.map((placement) =>
          placement.uploadId === id ? { ...placement, uploadId: null } : placement
        ),
      };
    });
  }, []);

  const setNotes = useCallback(
    (notes: string) => setSelection((current) => ({ ...current, notes })),
    []
  );

  const validate = useCallback((): ConfigErrors => {
    const next: ConfigErrors = {};
    if (!colorId) next.color = 'Pick a colour.';
    if (sizeIds.length === 0) next.size = 'Pick a size.';

    if (selection.placements.length === 0) {
      next.artwork = 'Add artwork before ordering.';
    } else {
      const bare = selection.placements.find(
        (placement) => !placement.templateId && !placement.uploadId
      );
      const methodless = selection.placements.find((placement) => !placement.method);
      if (bare) {
        next.artwork = `Add artwork to the ${CUSTOMIZATION_LOCATION_LABELS[
          bare.location
        ].toLowerCase()}.`;
        setActivePlacement(bare.id);
      } else if (methodless) {
        next.artwork = `Choose how the ${CUSTOMIZATION_LOCATION_LABELS[
          methodless.location
        ].toLowerCase()} is applied.`;
        setActivePlacement(methodless.id);
      }
    }

    setErrors(next);
    return next;
  }, [colorId, sizeIds, selection.placements]);

  const commitToCart = useCallback((): { ok: boolean; errors: ConfigErrors } => {
    const found = validate();
    if (Object.keys(found).length > 0 || !colorId) return { ok: false, errors: found };

    dispatch(
      addToCart(
        buildCartItem({
          product,
          colorId,
          sizeId: sizeIds[0],
          pricing,
          customization: selection,
          deliverySpeed: 'standard',
        })
      )
    );
    trackCustomWearEvent('custom_wear_add_to_cart', {
      productId: product.id,
      quantity: pricing.quantity,
      total: pricing.total,
    });
    return { ok: true, errors: {} };
  }, [validate, colorId, dispatch, product, sizeIds, pricing, selection]);

  const hasArtwork = selection.placements.some(
    (placement) => placement.templateId || placement.uploadId
  );

  return {
    mode,
    setMode,
    color,
    colorId,
    setColor,
    colorTouched,
    sizeIds,
    toggleSize,
    quantity,
    minQuantity,
    setQuantity,
    selection,
    activePlacementId,
    setActivePlacement,
    addPlacement,
    patchPlacement,
    removePlacement,
    addFiles,
    removeUpload,
    setNotes,
    uploadError,
    pricing,
    errors,
    clearError,
    commitToCart,
    hasArtwork,
  };
}
