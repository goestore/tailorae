'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { GarmentMark } from '../GarmentMark';
import { ViewTransition } from '@/components/common/ViewTransition';
import type { CustomWearProduct, ProductColor, ProductImage } from '@/types/custom-wear';

export interface ProductPhotosProps {
  product: CustomWearProduct;
  color?: ProductColor;
  /** Only fall back to the drawn view once a colour was actually picked. */
  colorTouched?: boolean;
}

/** Id of the generated colour view, which is a tile without being a photograph. */
const DRAWN = '__drawn';

/**
 * Product gallery: one large portrait image with a thumbnail grid beneath.
 *
 * The 2:3 frame is the point. Garment photography is shot portrait, so the
 * wider frames tried here before — a full-width hero, then a 4:5 two-up tiling —
 * both cropped the model down to a band across the chest. A tall frame shows
 * the whole garment, which is what the page is selling. Matches the convention
 * used on the 9 Impression storefront.
 *
 * Custom Wear adds one thing that shop has no need for: a colour with no
 * photograph of its own gets an accurate drawing rather than the previous
 * colour's photo left standing.
 */
export const ProductPhotos: React.FC<ProductPhotosProps> = ({
  product,
  color,
  colorTouched = false,
}) => {
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<string | null>(null);

  const photos: ProductImage[] = product.images
    .filter((image) => !failed.has(image.id))
    .filter((image, index, all) => all.findIndex((entry) => entry.url === image.url) === index)
    .slice(0, 7);

  const colorShot = color ? photos.find((image) => image.colorId === color.id) : undefined;

  /*
   * On arrival the first colour is selected for us, not by the shopper, so the
   * drawing would otherwise open the page on a wireframe — exactly what leading
   * with photography is meant to avoid. It also stands in when a product has no
   * photography at all.
   */
  const needsDrawn = (colorTouched && Boolean(color) && !colorShot) || photos.length === 0;

  const tiles: Array<{ id: string; image?: ProductImage }> = [
    ...(needsDrawn ? [{ id: DRAWN }] : []),
    ...(colorShot ? [{ id: colorShot.id, image: colorShot }] : []),
    ...photos.filter((image) => image.id !== colorShot?.id).map((image) => ({ id: image.id, image })),
  ];

  // A colour change overrides a stale manual pick.
  const [syncedColor, setSyncedColor] = useState(color?.id ?? null);
  if (syncedColor !== (color?.id ?? null)) {
    setSyncedColor(color?.id ?? null);
    setPicked(null);
  }

  if (tiles.length === 0) return null;

  const activeId = picked && tiles.some((tile) => tile.id === picked) ? picked : tiles[0].id;
  const active = tiles.find((tile) => tile.id === activeId) ?? tiles[0];

  const drawnGarment = (
    <GarmentMark
      hex={color?.hex}
      label={`${product.name} in ${color?.name ?? 'the selected colour'}`}
    />
  );

  return (
    <div className="cw-gal">
      {/* Same name as the card this product was opened from, so the thumbnail
          morphs into this frame instead of the page swapping under the cursor. */}
      <ViewTransition name={`cw-hero-${product.id}`} share="morph" default="none">
        <div className="cw-gal-main">
          {active.image ? (
            <Image
              src={active.image.url}
              alt={active.image.alt}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 48vw"
              className="object-cover"
              onError={() => setFailed((current) => new Set(current).add(active.image!.id))}
            />
          ) : (
            <div className="cw-gal-drawn">{drawnGarment}</div>
          )}

          {color && (
            <span className="cw-gal-tag">
              <span aria-hidden="true" style={{ background: color.hex }} />
              {color.name}
              {!active.image && <em>colour preview</em>}
            </span>
          )}
        </div>
      </ViewTransition>

      {tiles.length > 1 && (
        <div className="cw-gal-thumbs">
          {tiles.map((tile, index) => (
            <button
              suppressHydrationWarning
              key={tile.id}
              type="button"
              onClick={() => setPicked(tile.id)}
              aria-pressed={tile.id === activeId}
              aria-label={
                tile.image
                  ? `View image ${index + 1} of ${tiles.length}`
                  : `View ${color?.name ?? 'colour'} preview`
              }
              className="cw-gal-thumb"
              data-active={tile.id === activeId ? 'true' : undefined}
            >
              {tile.image ? (
                <Image
                  src={tile.image.url}
                  alt=""
                  fill
                  sizes="(max-width: 768px) 25vw, 10vw"
                  loading="lazy"
                  className="object-cover"
                  onError={() => setFailed((current) => new Set(current).add(tile.image!.id))}
                />
              ) : (
                <span className="cw-gal-drawn">{drawnGarment}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
