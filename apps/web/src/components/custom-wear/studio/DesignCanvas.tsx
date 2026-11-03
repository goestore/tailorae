'use client';

import React, { useState } from 'react';
import { CUSTOMIZATION_LOCATION_LABELS } from '@/config/custom-wear/taxonomy';
import { getDesignTemplateById } from '@/data/custom-wear/design-library';
import { contrastLine } from '@/lib/custom-wear/color';
import { GarmentMark } from '../GarmentMark';
import { DesignMark } from './DesignMark';
import type {
  CustomWearProduct,
  CustomizationLocationId,
  CustomizationPlacement,
  DesignUpload,
  ProductColor,
} from '@/types/custom-wear';

export type CanvasView = 'front' | 'back';

export interface DesignCanvasProps {
  product: CustomWearProduct;
  color?: ProductColor;
  placements: CustomizationPlacement[];
  uploads: DesignUpload[];
  activePlacementId: string | null;
  onAddPlacement: (location: CustomizationLocationId) => void;
  onSelectPlacement: (placementId: string) => void;
}

interface Zone {
  id: CustomizationLocationId;
  view: CanvasView;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Print zones as percentages of the garment box. */
const ZONES: Zone[] = [
  { id: 'left-chest', view: 'front', x: 56, y: 26, w: 18, h: 13 },
  { id: 'right-chest', view: 'front', x: 26, y: 26, w: 18, h: 13 },
  { id: 'centre-front', view: 'front', x: 38, y: 40, w: 24, h: 18 },
  { id: 'full-front', view: 'front', x: 27, y: 25, w: 46, h: 48 },
  { id: 'left-sleeve', view: 'front', x: 4, y: 28, w: 15, h: 20 },
  { id: 'right-sleeve', view: 'front', x: 81, y: 28, w: 15, h: 20 },
  { id: 'upper-back', view: 'back', x: 30, y: 22, w: 40, h: 14 },
  { id: 'full-back', view: 'back', x: 27, y: 25, w: 46, h: 48 },
];

/**
 * The studio's centrepiece: one large garment, in the colour that was picked,
 * with its print zones laid over it.
 *
 * The page is built around this rather than around a photo grid — on a
 * custom-apparel product the thing being sold is the garment plus your artwork
 * on it, so that composite is what gets the space. Front and back swap in
 * place instead of sitting side by side, which is what let the garment grow
 * large enough to aim at a zone accurately.
 */
export const DesignCanvas: React.FC<DesignCanvasProps> = ({
  product,
  color,
  placements,
  uploads,
  activePlacementId,
  onAddPlacement,
  onSelectPlacement,
}) => {
  const [view, setView] = useState<CanvasView>('front');

  const supported = new Set(
    product.customizationLocations.filter((entry) => entry.supported).map((entry) => entry.id)
  );
  const zones = ZONES.filter((zone) => zone.view === view && supported.has(zone.id));

  const fill = color?.hex ?? '#FFFFFF';
  const idleZone = contrastLine(fill, 0.5);

  const backCount = placements.filter((placement) =>
    ZONES.some((zone) => zone.id === placement.location && zone.view === 'back')
  ).length;
  const frontCount = placements.length - backCount;

  const artworkFor = (placement: CustomizationPlacement) => {
    if (placement.templateId) {
      const template = getDesignTemplateById(placement.templateId);
      if (template) return <DesignMark artwork={template.artwork} className="cw-mark" />;
    }

    const upload = uploads.find((entry) => entry.id === placement.uploadId);
    if (upload?.previewUrl) {
      // An object URL from the file just picked — next/image cannot optimise it.
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={upload.previewUrl} alt="" aria-hidden="true" className="h-full w-full object-contain" />;
    }

    return (
      <span className="cw-zone-tag">{upload ? upload.extension.toUpperCase() : 'ART'}</span>
    );
  };

  return (
    <div className="cw-canvas">
      <div className="cw-canvas-bar">
        <div className="cw-canvas-views" role="group" aria-label="Garment side">
          {(['front', 'back'] as const).map((side) => {
            const count = side === 'front' ? frontCount : backCount;
            return (
              <button
                suppressHydrationWarning
                key={side}
                type="button"
                onClick={() => setView(side)}
                aria-pressed={view === side}
                className="cw-canvas-view"
                data-active={view === side ? 'true' : undefined}
              >
                {side}
                {count > 0 && <span className="cw-canvas-view-count">{count}</span>}
              </button>
            );
          })}
        </div>

        {color && (
          <span className="cw-canvas-colour">
            <span
              aria-hidden="true"
              className="cw-canvas-dot"
              style={{ background: color.hex }}
            />
            {color.name}
          </span>
        )}
      </div>

      <div className="cw-canvas-stage">
        <div className="cw-canvas-figure">
          <GarmentMark hex={fill} view={view} className="cw-canvas-svg" />

        {zones.map((zone) => {
          const placement = placements.find((entry) => entry.location === zone.id);
          const isActive = placement != null && placement.id === activePlacementId;

          return (
            <button
              suppressHydrationWarning
              key={zone.id}
              type="button"
              onClick={() => (placement ? onSelectPlacement(placement.id) : onAddPlacement(zone.id))}
              aria-pressed={isActive}
              aria-label={
                placement
                  ? `Edit artwork on ${CUSTOMIZATION_LOCATION_LABELS[zone.id]}`
                  : `Add artwork to ${CUSTOMIZATION_LOCATION_LABELS[zone.id]}`
              }
              className="cw-zone"
              data-active={isActive ? 'true' : undefined}
              data-filled={placement ? 'true' : undefined}
              style={{
                left: `${zone.x}%`,
                top: `${zone.y}%`,
                width: `${zone.w}%`,
                height: `${zone.h}%`,
                borderColor: placement ? 'var(--cw-primary)' : idleZone,
              }}
            >
              {placement ? (
                <span
                  className="pointer-events-none block"
                  style={{
                    width: `${Math.round(placement.scale * 100)}%`,
                    height: `${Math.round(placement.scale * 100)}%`,
                  }}
                >
                  {artworkFor(placement)}
                </span>
              ) : (
                <span className="cw-zone-plus" aria-hidden="true">
                  +
                </span>
              )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
