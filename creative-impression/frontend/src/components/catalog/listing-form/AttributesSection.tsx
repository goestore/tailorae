'use client';

import React from 'react';
import type { ArticleSpec, SpecColumn } from '@/lib/catalogue-api';
import { FieldShell, SelectField, TextField } from './controls';
import { attrId, joinMulti, splitMulti, type ListingDraft } from './model';

interface AttributesSectionProps {
  spec: ArticleSpec;
  attributes: ListingDraft['attributes'];
  onChange: (key: string, value: string) => void;
}

/**
 * The article type's own attributes (fabric, neck, sleeve …), plus the fields
 * the admin added to the chosen category (screen size, smart TV). Required
 * ones are always on show; the optional ones wait under "More attributes".
 */
export const AttributesSection: React.FC<AttributesSectionProps> = ({
  spec,
  attributes,
  onChange,
}) => {
  const columns = spec.columns.filter((c) => c.scope === 'attribute');
  const required = columns.filter((c) => c.required);
  const optional = columns.filter((c) => !c.required);
  const filledOptional = optional.filter((c) => (attributes[c.key] ?? '').trim() !== '').length;

  const render = (column: SpecColumn) => {
    const id = attrId(column.key);
    const value = attributes[column.key] ?? '';
    const hint = column.helpText || undefined;

    // Several of a list: "Ports: HDMI, USB".
    if (column.kind === 'multiselect' && column.options) {
      const picked = splitMulti(value);
      return (
        <FieldShell key={column.key} id={id} label={column.label} required={column.required} hint={hint} wide>
          {(aria) => (
            <div id={id} className="lf-inline lf-wrap" role="group" aria-label={column.label} {...aria}>
              {column.options!.map((option) => {
                const on = picked.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    className="lf-pill"
                    aria-pressed={on}
                    onClick={() =>
                      onChange(
                        column.key,
                        joinMulti(on ? picked.filter((p) => p !== option) : [...picked, option])
                      )
                    }
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          )}
        </FieldShell>
      );
    }

    if ((column.kind === 'select' || column.kind === 'boolean') && column.options) {
      return (
        <SelectField
          key={column.key}
          id={id}
          label={column.label}
          required={column.required}
          hint={hint}
          value={value}
          options={column.options}
          onChange={(next) => onChange(column.key, next)}
        />
      );
    }

    // A number with its unit after the box: "55 | inch".
    if (column.kind === 'number' && column.unit) {
      return (
        <FieldShell key={column.key} id={id} label={column.label} required={column.required} hint={hint}>
          {(aria) => (
            <div className="lf-affix">
              <input
                id={id}
                type="text"
                inputMode="decimal"
                className="lf-input"
                value={value}
                maxLength={20}
                onChange={(event) => onChange(column.key, event.target.value)}
                {...aria}
              />
              <span className="lf-affix-unit">{column.unit}</span>
            </div>
          )}
        </FieldShell>
      );
    }

    return (
      <TextField
        key={column.key}
        id={id}
        label={column.label}
        required={column.required}
        hint={hint}
        value={value}
        inputMode={column.kind === 'number' ? 'decimal' : undefined}
        maxLength={column.kind === 'number' ? 20 : 500}
        onChange={(next) => onChange(column.key, next)}
      />
    );
  };

  return (
    <>
      {required.length > 0 ? (
        <div className="lf-grid">{required.map(render)}</div>
      ) : (
        <p className="lf-hint">{spec.articleType} has no required attributes.</p>
      )}
      {optional.length > 0 && (
        <details className="lf-more">
          <summary>
            More attributes ({optional.length}
            {filledOptional ? `, ${filledOptional} filled` : ''})
          </summary>
          <div className="lf-grid">{optional.map(render)}</div>
        </details>
      )}
    </>
  );
};
