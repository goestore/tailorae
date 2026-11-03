import type { ContentDefinition, ContentGroup, Infer } from './define';

/** One stored override, as the admin saves them. */
export interface StoredValue {
  path: string;
  value: unknown;
}

export interface ResolveOptions {
  /** Published overrides. Anything invalid is ignored, never thrown. */
  values?: StoredValue[] | null;
  /** Draft overrides, applied on top. Preview only — never in production reads. */
  draft?: StoredValue[] | null;
  /** Called for each rejected override so bad content is visible, not silent. */
  onReject?: (path: string, reason: string) => void;
}

const clone = <T>(value: T): T =>
  typeof structuredClone === 'function' ? structuredClone(value) : (JSON.parse(JSON.stringify(value)) as T);

/** Writes `value` at a JSON pointer, creating nothing that the schema did not define. */
function setAt(target: Record<string, unknown>, path: string, value: unknown): boolean {
  const keys = path.split('/').filter(Boolean);
  if (keys.length === 0) return false;

  let node: Record<string, unknown> = target;
  for (const key of keys.slice(0, -1)) {
    const next = node[key];
    // Only descend into groups the defaults already established. A path that
    // does not exist in the compiled shape is a stale override, not new content.
    if (typeof next !== 'object' || next === null || Array.isArray(next)) return false;
    node = next as Record<string, unknown>;
  }

  const leaf = keys[keys.length - 1];
  if (!(leaf in node)) return false;
  node[leaf] = value;
  return true;
}

/**
 * Resolves a namespace: compiled defaults ← published ← draft.
 *
 * Two rules make this safe to put in front of every page.
 *
 * It never throws. An override that fails validation, points at a path the
 * schema no longer has, or is simply the wrong type is dropped and reported —
 * the field falls back to its default. A bad publish degrades one value rather
 * than blanking the storefront.
 *
 * Defaults are always the floor. The storefront renders correctly with an
 * empty database, an unreachable one, or a half-migrated one, which is what
 * lets content move out of code incrementally.
 */
export function resolveContent<S extends ContentGroup>(
  definition: ContentDefinition<S>,
  options: ResolveOptions = {}
): Infer<S> {
  const resolved = clone(definition.defaults) as Record<string, unknown>;

  const apply = (entries: StoredValue[] | null | undefined) => {
    if (!entries) return;
    for (const entry of entries) {
      const check = definition.validateWrite(entry.path, entry.value);
      if (!check.ok) {
        options.onReject?.(entry.path, check.reason);
        continue;
      }
      // A structured field may need its stored value completing before the
      // storefront reads it; a scalar passes straight through.
      const target = definition.fieldAt(entry.path);
      const value = target?.normalise ? target.normalise(entry.value) : entry.value;

      if (!setAt(resolved, entry.path, value)) {
        options.onReject?.(entry.path, 'Path is no longer part of the schema.');
      }
    }
  };

  apply(options.values);
  apply(options.draft);

  return resolved as Infer<S>;
}

/**
 * Parses overrides that arrived as JSON text.
 *
 * Stored content can be corrupt as well as absent — a truncated write, a bad
 * migration — and a parse failure here would take down every page that reads
 * it. Returning null lets the caller fall through to defaults.
 */
export function parseStoredValues(raw: string | null | undefined): StoredValue[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (entry): entry is StoredValue =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as StoredValue).path === 'string'
    );
  } catch {
    return null;
  }
}
