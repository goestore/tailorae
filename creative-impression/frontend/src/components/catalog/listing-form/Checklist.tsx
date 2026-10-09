'use client';

import React, { useState } from 'react';
import type { MissingField } from '@/lib/catalogue-api';
import { SECTIONS, type CheckItem, type SectionId } from './model';

interface ChecklistProps {
  items: CheckItem[];
  /** What the server refused on the last publish, if anything. */
  serverMissing: Array<MissingField & { target: string }>;
  hasType: boolean;
  onJump: (target: string, section: SectionId) => void;
}

/**
 * "Ready to go live": the template's required fields, ticked off as they are
 * filled. Every open item is a button that takes you to the field.
 */
export const Checklist: React.FC<ChecklistProps> = ({ items, serverMissing, hasType, onJump }) => {
  const [showDone, setShowDone] = useState(false);
  const done = items.filter((item) => item.done);
  const open = items.filter((item) => !item.done);
  const percent = items.length ? Math.round((done.length / items.length) * 100) : 0;
  const sectionLabel = (id: SectionId) => SECTIONS.find((s) => s.id === id)?.label ?? id;

  return (
    <div className="lf-checklist">
      <div className="lf-checklist-head">
        <h2 className="lf-checklist-title">Ready to go live</h2>
        <p className="lf-checklist-count" aria-live="polite">
          <strong>
            {done.length} / {items.length}
          </strong>{' '}
          <span className="lf-muted">required done</span>
        </p>
      </div>
      <div
        className="lf-progress"
        role="progressbar"
        aria-label="Required fields complete"
        aria-valuemin={0}
        aria-valuemax={items.length}
        aria-valuenow={done.length}
      >
        <span style={{ width: `${percent}%` }} data-complete={open.length === 0 || undefined} />
      </div>

      {!hasType && <p className="lf-hint">Choose a category or article type to see everything it needs.</p>}

      {serverMissing.length > 0 && (
        <div className="lf-server-missing" role="alert">
          <p className="lf-server-missing-title">
            The server refused to publish — {serverMissing.length} still missing:
          </p>
          <ul>
            {serverMissing.map((item) => (
              <li key={`${item.key}-${item.label}`}>
                <button
                  type="button"
                  className="lf-check-item"
                  onClick={() => onJump(item.target, 'business')}
                >
                  <span className="lf-dot" aria-hidden="true" />
                  <span className="lf-check-label">{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {open.length === 0 && hasType ? (
        <p className="lf-all-done">Everything this article type marks as required is filled in.</p>
      ) : (
        <ul className="lf-check-list" aria-label="Still to do">
          {open.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="lf-check-item"
                onClick={() => onJump(item.target, item.section)}
              >
                <span className="lf-dot" aria-hidden="true" />
                <span className="lf-check-label">{item.label}</span>
                <span className="lf-check-section">{sectionLabel(item.section)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <div className="lf-done-block">
          <button
            type="button"
            className="lf-link"
            aria-expanded={showDone}
            onClick={() => setShowDone((v) => !v)}
          >
            {showDone ? 'Hide' : 'Show'} completed ({done.length})
          </button>
          {showDone && (
            <ul className="lf-check-list" aria-label="Completed">
              {done.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="lf-check-item"
                    data-done
                    onClick={() => onJump(item.target, item.section)}
                  >
                    <span className="lf-tick" aria-hidden="true">
                      ✓
                    </span>
                    <span className="lf-check-label">{item.label}</span>
                    <span className="sr-only">(done)</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
