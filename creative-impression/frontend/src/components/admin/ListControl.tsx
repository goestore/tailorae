'use client';

import React, { useState } from 'react';
import type { ContentPath } from '@/content/define';
import { resolveList, type ListItem, type ListItemFields } from '@/content/field';
import { FieldControl, Grip, RowActions } from './ContentField';

/**
 * Edits a repeating set of items — the cards in a marketing band.
 *
 * Each item is a small form built from the same field definitions the rest of
 * the registry uses, so an item's fields get the right controls and validators
 * with nothing written per section. Around them sit the operations a repeater
 * needs and a flat field cannot express: add, remove, and move.
 *
 * The whole list is one value. Every edit rebuilds the array and hands it up,
 * which keeps the editor's change detection, draft and publish paths identical
 * to those of a single string.
 */

/** Humanises a key for an item field with no explicit label. */
const humanise = (key: string): string =>
  key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/^./, (character) => character.toUpperCase());

/**
 * A one-line name for an item, so a collapsed row is identifiable.
 *
 * The first text-ish field is almost always the title, and falling back to the
 * position keeps a brand-new item addressable before anything is typed into it.
 */
function itemLabel(item: ListItem, itemFields: ListItemFields, index: number): string {
  for (const [key, field] of Object.entries(itemFields)) {
    if (field.kind !== 'text' && field.kind !== 'textarea') continue;
    const value = item[key];
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return `Item ${index + 1}`;
}

interface ListControlProps {
  id: string;
  value: unknown;
  describedBy?: string;
  itemFields: ListItemFields;
  max?: number;
  /** Used to build a fresh item and to fall back when nothing is stored. */
  fallback: readonly ListItem[];
  onChange: (value: ListItem[]) => void;
  onBlur: () => void;
}

export const ListControl: React.FC<ListControlProps> = ({
  id,
  value,
  describedBy,
  itemFields,
  max,
  fallback,
  onChange,
  onBlur,
}) => {
  const items = resolveList(value, itemFields, fallback);
  const [open, setOpen] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const entries = Object.entries(itemFields);
  const full = max !== undefined && items.length >= max;

  const commit = (next: ListItem[], message: string) => {
    onChange(next);
    setAnnouncement(message);
    onBlur();
  };

  const setField = (index: number, key: string, fieldValue: unknown) => {
    const next = items.map((item, position) =>
      position === index ? { ...item, [key]: fieldValue } : { ...item }
    );
    // No announcement: typing already gives its own feedback, and a live region
    // that fires per keystroke is unusable with a screen reader.
    onChange(next);
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const next = items.map((item) => ({ ...item }));
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    // The open row follows the item it belongs to rather than the position.
    setOpen((current) => (current === from ? to : current));
    commit(next, `${itemLabel(moved, itemFields, to)} moved to position ${to + 1}.`);
  };

  const remove = (index: number) => {
    const removed = items[index];
    const next = items.filter((_, position) => position !== index).map((item) => ({ ...item }));
    setOpen(null);
    commit(next, `${itemLabel(removed, itemFields, index)} removed.`);
  };

  const add = () => {
    if (full) return;
    // A new item starts from its fields' defaults, so it is immediately valid
    // and shows the shape of what belongs in it.
    const blank: ListItem = {};
    for (const [key, field] of entries) blank[key] = field.defaultValue;

    const next = [...items.map((item) => ({ ...item })), blank];
    setOpen(next.length - 1);
    commit(next, `Item added at position ${next.length}.`);
  };

  return (
    <div id={id} aria-describedby={describedBy} className="flex flex-col gap-2">
      {items.length === 0 && (
        <div className="ce-well">
          <p>No items — this section will not appear on the page.</p>
          <button type="button" className="btn btn-sm" disabled={full} onClick={add}>
            Add item
          </button>
        </div>
      )}

      {items.length > 0 && (
        <ol className="ce-rows">
          {items.map((item, index) => {
            const expanded = open === index;
            const rowId = `${id}-item-${index}`;
            const name = itemLabel(item, itemFields, index);
            return (
              <li key={index} className="ce-row">
                <div className="ce-row-head">
                  <Grip />
                  <span className="ce-row-index">{index + 1}</span>

                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={`${rowId}-fields`}
                    className="ce-row-name"
                    onClick={() => setOpen(expanded ? null : index)}
                  >
                    <span
                      aria-hidden="true"
                      className="mr-1.5 inline-block w-3 text-[var(--a-text-dim)]"
                    >
                      {expanded ? '▾' : '▸'}
                    </span>
                    {name}
                  </button>

                  <RowActions
                    name={name}
                    index={index}
                    count={items.length}
                    onMove={move}
                    onRemove={() => remove(index)}
                  />
                </div>

                {expanded && (
                  <div id={`${rowId}-fields`} className="ce-row-body">
                    {entries.map(([key, field]) => {
                      const fieldId = `${rowId}-${key}`;
                      const error = field.validate(item[key]);
                      const helpId = field.help ? `${fieldId}-help` : undefined;
                      const label = field.label ?? humanise(key);

                      return (
                        <div key={key} className="ce-subfield">
                          <label htmlFor={fieldId} className="ce-label">
                            {label}
                          </label>
                          <FieldControl
                            field={field as ContentPath['field']}
                            id={fieldId}
                            value={item[key]}
                            error={error}
                            describedBy={helpId}
                            label={label}
                            onChange={(next) => setField(index, key, next)}
                            onBlur={onBlur}
                          />
                          {field.help && (
                            <p id={helpId} className="ce-help">
                              {field.help}
                            </p>
                          )}
                          {error && (
                            <p role="alert" className="ce-error">
                              {error}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {items.length > 0 && (
        <div className="ce-inline">
          <button type="button" className="btn btn-sm" disabled={full} onClick={add}>
            Add item
          </button>
          {max !== undefined && (
            <span className="ce-count">
              {items.length}/{max}
            </span>
          )}
          {full && <span className="ce-help">Remove one to add another.</span>}
        </div>
      )}

      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
};
