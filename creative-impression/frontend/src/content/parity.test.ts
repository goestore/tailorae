import { describe, expect, it } from 'vitest';
import { customWearContent as sourceContent } from '@/config/custom-wear/content';
import { customWearTheme as sourceTheme } from '@/config/custom-wear/theme';
import { customWearContent } from './schema/customWear';
import { customWearThemeContent } from './schema/customWearTheme';
import type { ContentDefinition, ContentGroup } from './define';

/**
 * Defaults parity.
 *
 * A content namespace is only safe to put in front of the storefront if its
 * compiled defaults reproduce what the site ships with today. If a ported
 * default drifts — a transposed digit, a dropped character, a colour off by one
 * — the storefront changes silently the moment content moves out of code, and
 * nothing else in the suite would catch it.
 *
 * This walks every field in a namespace, reads the same path out of the config
 * it was ported from, and demands they match. It is deliberately mechanical:
 * the point is that no human has to remember to re-check after an edit.
 */

/** Reads a JSON pointer out of a plain object. Returns MISSING if absent. */
const MISSING = Symbol('missing');

function readPath(source: unknown, path: string): unknown | typeof MISSING {
  let node: unknown = source;
  for (const key of path.split('/').filter(Boolean)) {
    if (typeof node !== 'object' || node === null || !(key in (node as object))) return MISSING;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

interface ParityReport {
  checked: number;
  mismatches: string[];
  absent: string[];
}

function compare<S extends ContentGroup>(
  definition: ContentDefinition<S>,
  source: unknown
): ParityReport {
  const mismatches: string[] = [];
  const absent: string[] = [];

  for (const entry of definition.paths) {
    const actual = readPath(source, entry.path);

    // A field with no counterpart is not automatically wrong — the schema may
    // expose something that lives in a component rather than in this config —
    // but it must be surfaced rather than silently counted as passing.
    if (actual === MISSING) {
      absent.push(entry.path);
      continue;
    }

    const expected = entry.field.defaultValue;
    if (actual !== expected) {
      mismatches.push(`${entry.path}\n    schema: ${JSON.stringify(expected)}\n    config: ${JSON.stringify(actual)}`);
    }
  }

  return { checked: definition.paths.length, mismatches, absent };
}

describe('custom-wear defaults match config/custom-wear/content.ts', () => {
  const report = compare(customWearContent, sourceContent);

  it('has no drifted defaults', () => {
    expect(report.mismatches).toEqual([]);
  });

  it('checked a meaningful number of fields', () => {
    expect(report.checked).toBeGreaterThan(40);
  });

  it('reports fields with no counterpart in the source config', () => {
    // Not a failure by itself — recorded so an unexplained one gets noticed.
    expect(report.absent).toEqual([]);
  });
});

describe('custom-wear-theme defaults match config/custom-wear/theme.ts', () => {
  const report = compare(customWearThemeContent, sourceTheme);

  it('has no drifted defaults', () => {
    expect(report.mismatches).toEqual([]);
  });

  it('checked a meaningful number of fields', () => {
    expect(report.checked).toBeGreaterThan(30);
  });

  it('reports fields with no counterpart in the source config', () => {
    expect(report.absent).toEqual([]);
  });
});
