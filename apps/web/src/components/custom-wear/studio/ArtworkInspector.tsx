'use client';

import React, { useRef } from 'react';
import {
  CUSTOMIZATION_LOCATION_LABELS,
  CUSTOMIZATION_METHOD_LABELS,
} from '@/config/custom-wear/taxonomy';
import { DESIGN_TEMPLATES, getDesignTemplateById } from '@/data/custom-wear/design-library';
import { acceptAttribute, formatFileSize } from '@/lib/custom-wear/uploads';
import { customWearContent } from '@/config/custom-wear/content';
import type { CustomWearProduct, DesignTemplate } from '@/types/custom-wear';
import { DesignMark } from './DesignMark';
import type { ProductConfig } from './useProductConfig';

export interface ArtworkInspectorProps {
  product: CustomWearProduct;
  config: ProductConfig;
}

/**
 * Everything that happens to a placement after it exists: which design goes on
 * it, how it is applied, how big it is.
 *
 * Placements are created by tapping the garment, not from a dropdown here — the
 * canvas is the map, this is the inspector for whatever is selected on it. Only
 * the selected placement is expanded, so a garment with five decorated areas
 * does not become five stacked forms.
 */
export const ArtworkInspector: React.FC<ArtworkInspectorProps> = ({ product, config }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    selection,
    activePlacementId,
    setActivePlacement: onActivePlacementChange,
    patchPlacement,
    removePlacement,
    addFiles,
    removeUpload,
    setNotes,
    uploadError,
    errors,
  } = config;

  const error = errors.artwork;
  const { maxFiles, maxFileSizeMb } = customWearContent.upload;
  const methods = product.customizationMethods.filter((entry) => entry.supported);

  const applyTemplate = (template: DesignTemplate) => {
    if (!activePlacementId) return;
    patchPlacement(activePlacementId, { templateId: template.id, uploadId: null });
  };

  const active = selection.placements.find((placement) => placement.id === activePlacementId);

  return (
    <div className="cw-art">
      {error && (
        <p role="alert" className="cw-art-error">
          {error}
        </p>
      )}

      {selection.placements.length === 0 ? (
        <p className="cw-art-empty">Tap a marked area on the garment to place artwork.</p>
      ) : (
        <ul className="cw-art-list">
          {selection.placements.map((placement) => {
            const isActive = placement.id === activePlacementId;
            const template = placement.templateId
              ? getDesignTemplateById(placement.templateId)
              : undefined;
            const upload = selection.uploads.find((entry) => entry.id === placement.uploadId);

            return (
              <li key={placement.id} className="cw-art-item" data-active={isActive ? 'true' : undefined}>
                <button
                  suppressHydrationWarning
                  type="button"
                  onClick={() => onActivePlacementChange(isActive ? null : placement.id)}
                  aria-expanded={isActive}
                  className="cw-art-head"
                >
                  <span className="cw-art-thumb">
                    {template ? (
                      <DesignMark artwork={template.artwork} />
                    ) : upload?.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={upload.previewUrl} alt="" aria-hidden="true" />
                    ) : (
                      <span className="cw-art-thumb-empty">?</span>
                    )}
                  </span>

                  <span className="cw-art-head-text">
                    <span className="cw-art-where">
                      {CUSTOMIZATION_LOCATION_LABELS[placement.location]}
                    </span>
                    <span className="cw-art-what">
                      {template?.name ?? upload?.name ?? 'No artwork yet'}
                      {placement.method ? ` · ${CUSTOMIZATION_METHOD_LABELS[placement.method]}` : ''}
                    </span>
                  </span>

                </button>

                {isActive && (
                  <div className="cw-art-body">
                    <label className="cw-art-field">
                      <span>Applied with</span>
                      <select
                        suppressHydrationWarning
                        value={placement.method ?? ''}
                        onChange={(event) =>
                          patchPlacement(placement.id, {
                            method: (event.target.value || null) as never,
                          })
                        }
                      >
                        <option value="">Choose a method</option>
                        {methods.map((method) => (
                          <option key={method.id} value={method.id}>
                            {CUSTOMIZATION_METHOD_LABELS[method.id]}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="cw-art-field">
                      <span>Size · {Math.round(placement.scale * 100)}%</span>
                      <input
                        suppressHydrationWarning
                        type="range"
                        min={30}
                        max={100}
                        step={5}
                        value={Math.round(placement.scale * 100)}
                        onChange={(event) =>
                          patchPlacement(placement.id, { scale: Number(event.target.value) / 100 })
                        }
                      />
                    </label>

                    <div className="cw-art-library" role="group" aria-label="Design library">
                      {DESIGN_TEMPLATES.slice(0, 8).map((entry) => (
                        <button
                          suppressHydrationWarning
                          key={entry.id}
                          type="button"
                          onClick={() => applyTemplate(entry)}
                          aria-pressed={placement.templateId === entry.id}
                          title={entry.name}
                          className="cw-art-tpl"
                          data-active={placement.templateId === entry.id ? 'true' : undefined}
                        >
                          <DesignMark artwork={entry.artwork} />
                        </button>
                      ))}
                    </div>

                    <button
                      suppressHydrationWarning
                      type="button"
                      onClick={() => removePlacement(placement.id)}
                      className="cw-art-remove"
                    >
                      Remove this area
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Files */}
      <div className="cw-art-files">
        <input
          suppressHydrationWarning
          ref={inputRef}
          type="file"
          multiple
          accept={acceptAttribute()}
          className="sr-only"
          aria-label="Upload artwork"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = '';
          }}
        />
        <button
          suppressHydrationWarning
          type="button"
          onClick={() => inputRef.current?.click()}
          className="cw-cta cw-cta--outline w-full"
        >
          Upload artwork
        </button>
        <p className="cw-art-limit">
          {maxFileSizeMb} MB · {maxFiles} files
        </p>

        {uploadError && (
          <p role="alert" className="cw-art-error">
            {uploadError}
          </p>
        )}

        {selection.uploads.length > 0 && (
          <ul className="cw-art-files-list">
            {selection.uploads.map((upload) => (
              <li key={upload.id}>
                <span className="cw-art-file-name">{upload.name}</span>
                <span className="cw-art-file-size">
                  {upload.status === 'uploading'
                    ? 'Uploading…'
                    : upload.status === 'error'
                      ? 'Upload failed'
                      : formatFileSize(upload.size)}
                </span>
                <button
                  suppressHydrationWarning
                  type="button"
                  onClick={() => removeUpload(upload.id)}
                  aria-label={`Remove ${upload.name}`}
                  className="cw-art-file-x"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <label className="cw-art-field">
        <span>Notes for our team</span>
        <textarea
          suppressHydrationWarning
          rows={2}
          value={selection.notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Pantone references, thread colours, name lists"
        />
      </label>

      {active && !active.templateId && !active.uploadId && (
        <p className="cw-art-hint">
          Pick a design above or upload a file for the{' '}
          {CUSTOMIZATION_LOCATION_LABELS[active.location].toLowerCase()}.
        </p>
      )}
    </div>
  );
};
