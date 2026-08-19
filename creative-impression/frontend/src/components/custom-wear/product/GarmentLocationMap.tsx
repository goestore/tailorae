'use client';

import React from 'react';
import { CUSTOMIZATION_LOCATION_LABELS } from '@/config/custom-wear/taxonomy';
import type { CustomizationLocationId, CustomizationLocationOption } from '@/types/custom-wear';

export interface GarmentLocationMapProps {
  locations: CustomizationLocationOption[];
  selected: CustomizationLocationId[];
  onToggle: (location: CustomizationLocationId) => void;
}

interface Hotspot {
  id: CustomizationLocationId;
  view: 'front' | 'back';
  /** Percentage box within the garment outline. */
  x: number;
  y: number;
  w: number;
  h: number;
}

const HOTSPOTS: Hotspot[] = [
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
 * Simple front/back garment diagrams with selectable print areas.
 *
 * Deliberately schematic rather than a live mock-up: the hotspot geometry is
 * data, so the future canvas editor can reuse the same coordinates for real
 * artwork placement.
 */
export const GarmentLocationMap: React.FC<GarmentLocationMapProps> = ({
  locations,
  selected,
  onToggle,
}) => {
  const supported = new Set(locations.map((location) => location.id));

  const renderView = (view: 'front' | 'back') => (
    <div
      className="relative flex-1"
      style={{
        aspectRatio: '3 / 4',
        minWidth: '140px',
        backgroundColor: 'var(--cw-surface-alt)',
        border: '1px solid var(--cw-border)',
        borderRadius: 'var(--cw-radius-control)',
      }}
    >
      <svg
        viewBox="0 0 100 128"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Garment outline */}
        <path
          d="M34 12 20 20 6 32l10 12 8-6v76h52V38l8 6 10-12L80 20 66 12a16 8 0 0 1-32 0z"
          fill="var(--cw-white)"
          stroke="var(--cw-border)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {view === 'front' && (
          <path
            d="M40 12a12 7 0 0 0 20 0"
            fill="none"
            stroke="var(--cw-border)"
            strokeWidth="1.5"
          />
        )}
      </svg>

      <span
        className="absolute left-2 top-2 uppercase"
        style={{
          color: 'var(--cw-ink-subtle)',
          fontFamily: 'var(--cw-font-body)',
          fontSize: '10px',
          fontWeight: 700,
          letterSpacing: '0.1em',
        }}
      >
        {view}
      </span>

      {HOTSPOTS.filter((hotspot) => hotspot.view === view && supported.has(hotspot.id)).map(
        (hotspot) => {
          const isSelected = selected.includes(hotspot.id);
          return (
            <button
              suppressHydrationWarning
              key={hotspot.id}
              type="button"
              onClick={() => onToggle(hotspot.id)}
              aria-pressed={isSelected}
              aria-label={`${CUSTOMIZATION_LOCATION_LABELS[hotspot.id]} print area`}
              title={CUSTOMIZATION_LOCATION_LABELS[hotspot.id]}
              className="absolute transition-colors"
              style={{
                left: `${hotspot.x}%`,
                top: `${hotspot.y}%`,
                width: `${hotspot.w}%`,
                height: `${hotspot.h}%`,
                border: `1.5px dashed ${isSelected ? 'var(--cw-primary)' : 'var(--cw-ink-subtle)'}`,
                backgroundColor: isSelected ? 'var(--cw-primary-soft)' : 'transparent',
                borderRadius: '3px',
                opacity: isSelected ? 1 : 0.55,
              }}
            />
          );
        }
      )}
    </div>
  );

  return (
    <div className="flex gap-3">
      {renderView('front')}
      {renderView('back')}
    </div>
  );
};
