import { type Field, isField } from './field';

/** A schema is a tree of fields and nested groups. */
export interface ContentGroup {
  [key: string]: Field<unknown> | ContentGroup;
}

/** The value shape a schema produces, for the storefront to consume. */
export type Infer<S> = {
  [K in keyof S]: S[K] extends Field<infer T> ? T : S[K] extends ContentGroup ? Infer<S[K]> : never;
};

/** One editable value, addressed by namespace + JSON pointer. */
export interface ContentPath {
  /** e.g. `custom-wear#/hero/heading` — the address the admin edits by. */
  address: string;
  namespace: string;
  /** JSON pointer, e.g. `/hero/heading`. */
  path: string;
  field: Field<unknown>;
  /** Human trail for the admin, e.g. `Hero › Heading`. */
  trail: string[];
}

export interface ContentDefinition<S extends ContentGroup> {
  namespace: string;
  schema: S;
  /** Compiled defaults — what the storefront renders with nothing published. */
  defaults: Infer<S>;
  /** Every editable value, flattened. This is the inventory. */
  paths: ContentPath[];
  /** Look up one field by JSON pointer. */
  fieldAt(path: string): Field<unknown> | undefined;
  /**
   * Validates a single write. Unknown paths are rejected rather than stored:
   * an allowlist keyed by the schema means a typo, or a compromised endpoint,
   * cannot introduce content the storefront never asked for.
   */
  validateWrite(path: string, value: unknown): { ok: true } | { ok: false; reason: string };
}

const humanise = (key: string): string =>
  key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());

function walk(
  namespace: string,
  group: ContentGroup,
  prefix: string,
  trail: string[],
  out: ContentPath[]
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};

  for (const [key, node] of Object.entries(group)) {
    const path = `${prefix}/${key}`;
    const label = isField(node) ? (node.label ?? humanise(key)) : humanise(key);

    if (isField(node)) {
      defaults[key] = node.defaultValue;
      out.push({
        address: `${namespace}#${path}`,
        namespace,
        path,
        field: node,
        trail: [...trail, label],
      });
    } else {
      defaults[key] = walk(namespace, node, path, [...trail, label], out);
    }
  }

  return defaults;
}

/**
 * Declares one editable namespace.
 *
 * The schema is the single source of truth: the storefront's types, the
 * compiled defaults, the admin form and the write allowlist are all derived
 * from it, so they cannot drift apart. Adding a field to the schema makes it
 * editable everywhere at once; anything absent from the schema is, by
 * construction, not editable — which is auditable rather than assumed.
 */
export function defineContent<S extends ContentGroup>(
  namespace: string,
  schema: S
): ContentDefinition<S> {
  const paths: ContentPath[] = [];
  const defaults = walk(namespace, schema, '', [], paths) as Infer<S>;
  const byPath = new Map(paths.map((entry) => [entry.path, entry.field]));

  return {
    namespace,
    schema,
    defaults,
    paths,
    fieldAt: (path) => byPath.get(path),
    validateWrite(path, value) {
      const target = byPath.get(path);
      if (!target) return { ok: false, reason: `Unknown content path: ${path}` };
      const reason = target.validate(value);
      return reason ? { ok: false, reason } : { ok: true };
    },
  };
}
