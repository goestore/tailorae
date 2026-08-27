'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ContentDefinition, ContentGroup, ContentPath } from '@/content/define';
import {
  discardDraft as discardDraftRequest,
  fetchStages,
  publishDraft,
  saveDraft as saveDraftRequest,
  type DraftEntry,
} from '@/content/admin-api';
import type { StoredValue } from '@/content/resolve';
import { sameFieldValue } from '@/content/field';
import { brandContent } from '@/content/schema/brand';
import { homeContent } from '@/content/schema/home';
import { customWearContent } from '@/content/schema/customWear';
import { customWearThemeContent } from '@/content/schema/customWearTheme';
import { layoutContent } from '@/content/schema/layout';
import { cn } from '@/utils/helpers';
import { ContentField, LABEL_VOICE, formatContentValue } from './ContentField';

/**
 * The part of a `ContentDefinition` the editor needs.
 *
 * `ContentDefinition<S>` is generic in its schema, so namespaces with different
 * schemas cannot share a list under that type. Everything the form renders comes
 * from `paths` and every write is checked by `validateWrite`; neither member
 * depends on S.
 */
type EditableNamespace = Pick<
  ContentDefinition<ContentGroup>,
  'namespace' | 'paths' | 'validateWrite'
>;

/**
 * Every editable namespace.
 *
 * Keyed off each definition's own `namespace`, so the URL segment and the
 * definition cannot disagree and adding a schema file costs one line. The
 * registry lives in this client module rather than in the route because a
 * definition carries `validate()` functions, and functions do not survive the
 * server/client boundary.
 */
const NAMESPACES: readonly EditableNamespace[] = [
  brandContent,
  homeContent,
  layoutContent,
  customWearContent,
  customWearThemeContent,
];

const byNamespace = new Map(NAMESPACES.map((entry) => [entry.namespace, entry]));

const namespaceLabel = (namespace: string): string =>
  namespace
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

/** Path -> value: `StoredValue[]` flattened for lookup. */
type Overrides = Record<string, unknown>;

interface Notice {
  tone: 'ok' | 'error';
  text: string;
}

/**
 * Applies the admission rule `resolveContent` uses, so the form shows what the
 * storefront would actually render. A stored value that fails its field's
 * validator, or names a path the schema has since dropped, is not editable
 * content — it is content the storefront is already ignoring.
 */
function accept(
  definition: EditableNamespace,
  entries: StoredValue[] | null
): { values: Overrides; rejected: number } {
  const values: Overrides = {};
  let rejected = 0;
  for (const entry of entries ?? []) {
    if (definition.validateWrite(entry.path, entry.value).ok) values[entry.path] = entry.value;
    else rejected += 1;
  }
  return { values, rejected };
}

/** Compiled defaults <- published <- draft, flattened by path. */
function formFrom(
  definition: EditableNamespace,
  published: Overrides,
  draft: Overrides | null
): Overrides {
  const form: Overrides = {};
  for (const entry of definition.paths) {
    // `in` rather than `??`: an override is allowed to be falsy, and 0 or an
    // empty string is a real edit rather than a missing one.
    form[entry.path] =
      draft && entry.path in draft
        ? draft[entry.path]
        : entry.path in published
          ? published[entry.path]
          : entry.field.defaultValue;
  }
  return form;
}

interface Section {
  title: string;
  entries: ContentPath[];
}

/** Groups the flat path list by the trail of groups that leads to each field. */
function buildSections(paths: readonly ContentPath[]): Section[] {
  const sections = new Map<string, Section>();
  for (const entry of paths) {
    // The trail is [...group labels, field label]; the groups are the section.
    const title = entry.trail.slice(0, -1).join(' › ') || 'General';
    const section = sections.get(title) ?? { title, entries: [] };
    section.entries.push(entry);
    sections.set(title, section);
  }
  return [...sections.values()];
}

const plural = (count: number) => (count === 1 ? '' : 's');

const NamespaceEditor: React.FC<{ definition: EditableNamespace }> = ({ definition }) => {
  const [published, setPublished] = useState<Overrides>({});
  const [draft, setDraft] = useState<Overrides | null>(null);
  // Seeded from the compiled defaults so the server render and the first client
  // render agree; stored values arrive in the effect below, after hydration.
  const [form, setForm] = useState<Overrides>(() => formFrom(definition, {}, null));
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirming, setConfirming] = useState<'publish' | 'discard' | null>(null);
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [loading, setLoading] = useState(true);
  /** True while a save, publish or discard is in flight. */
  const [busy, setBusy] = useState(false);

  /**
   * Loads both stages from the content API.
   *
   * Fetching in an effect is right here: the values live behind an admin-only
   * endpoint that needs the browser's bearer token, so they cannot be read
   * during the server render, and seeding from them on the client would
   * mismatch hydration. The lint rule cannot tell this apart from a
   * cascading-render mistake.
   */
  useEffect(() => {
    // Switching namespaces mid-request must not let the slower response
    // overwrite the newer namespace's form.
    let current = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setErrors({});
    setConfirming(null);
    setOnlyChanged(false);

    fetchStages(definition.namespace)
      .then((stages) => {
        if (!current) return;
        const live = accept(definition, stages.published);
        const pending = stages.draft.length > 0 ? accept(definition, stages.draft) : null;

        setPublished(live.values);
        setDraft(pending ? pending.values : null);
        setForm(formFrom(definition, live.values, pending?.values ?? null));

        const dropped = live.rejected + (pending?.rejected ?? 0);
        setNotice(
          dropped > 0
            ? {
                tone: 'error',
                text: `${dropped} stored value${plural(dropped)} no longer fit the schema and ${dropped === 1 ? 'was' : 'were'} ignored. Those fields fall back to their default on the storefront too.`,
              }
            : null
        );
      })
      .catch((error: Error) => {
        if (!current) return;
        // The form still renders, on compiled defaults — but it must not look
        // like those are the live values, or an unwitting publish would
        // overwrite real content with defaults.
        setPublished({});
        setDraft(null);
        setForm(formFrom(definition, {}, null));
        setNotice({
          tone: 'error',
          text: `${error.message} These are the built-in defaults, not what is live — reload before editing.`,
        });
      })
      .finally(() => {
        if (current) setLoading(false);
      });

    return () => {
      current = false;
    };
  }, [definition]);

  const liveValueOf = useCallback(
    (entry: ContentPath): unknown =>
      entry.path in published ? published[entry.path] : entry.field.defaultValue,
    [published]
  );

  const draftValueOf = useCallback(
    (entry: ContentPath): unknown =>
      draft && entry.path in draft ? draft[entry.path] : liveValueOf(entry),
    [draft, liveValueOf]
  );

  /** What publishing would change — and exactly what a saved draft holds. */
  const unpublished = useMemo(
    () => definition.paths.filter((entry) => !sameFieldValue(form[entry.path], liveValueOf(entry))),
    [definition, form, liveValueOf]
  );

  /** Edits made since the draft was last saved. */
  const unsaved = useMemo(
    () => definition.paths.filter((entry) => !sameFieldValue(form[entry.path], draftValueOf(entry))),
    [definition, form, draftValueOf]
  );

  const invalid = useMemo(
    () => definition.paths.filter((entry) => entry.field.validate(form[entry.path]) !== null),
    [definition, form]
  );

  const changedPaths = useMemo(() => new Set(unpublished.map((entry) => entry.path)), [unpublished]);

  const sections = useMemo(() => buildSections(definition.paths), [definition]);

  const visible = useMemo(
    () =>
      onlyChanged
        ? sections
            .map((section) => ({
              ...section,
              entries: section.entries.filter((entry) => changedPaths.has(entry.path)),
            }))
            .filter((section) => section.entries.length > 0)
        : sections,
    [sections, onlyChanged, changedPaths]
  );

  const setValue = (path: string, value: unknown) => {
    setForm((current) => ({ ...current, [path]: value }));
    // Clear the error while typing; blur decides whether it comes back.
    setErrors((current) => ({ ...current, [path]: null }));
    setNotice(null);
    // A pending confirmation describes a set of changes that no longer matches.
    setConfirming(null);
  };

  /**
   * Surfaces every outstanding error and refuses the write.
   *
   * `validateWrite` is the store's allowlist, so an invalid value could not be
   * saved anyway. Refusing here means the admin sees which field is wrong
   * instead of a value that quietly never persisted.
   */
  const blocked = (): boolean => {
    if (invalid.length === 0) return false;
    const next: Record<string, string | null> = {};
    for (const entry of invalid) next[entry.path] = entry.field.validate(form[entry.path]);
    setErrors((current) => ({ ...current, ...next }));
    setConfirming(null);
    setOnlyChanged(false);
    setNotice({
      tone: 'error',
      text: `${invalid.length} field${plural(invalid.length)} still need fixing. Nothing was saved.`,
    });
    return true;
  };

  /**
   * What the draft should hold: every field the form has moved off the live
   * value.
   *
   * `isPrivate` rides along because only the frontend registry knows which
   * fields are sensitive — the server uses it to keep the value off the public
   * endpoint, and defaults to public if it never arrives.
   */
  const draftPayload = (): DraftEntry[] =>
    unpublished.map((entry) => ({
      path: entry.path,
      value: form[entry.path],
      isPrivate: entry.field.private === true,
    }));

  const saveDraft = async () => {
    if (blocked() || busy) return;
    setBusy(true);
    try {
      const values = draftPayload();
      const saved = await saveDraftRequest(definition.namespace, values);
      // The server's copy is authoritative: it has run its own validation, so
      // trusting it keeps the form honest about what would actually publish.
      const stored = accept(definition, saved);
      setDraft(saved.length > 0 ? stored.values : null);
      setNotice({
        tone: 'ok',
        text:
          saved.length > 0
            ? `Draft saved with ${saved.length} change${plural(saved.length)}. Nothing is live until you publish.`
            : 'Draft cleared — the form matches what is published.',
      });
    } catch (error) {
      setNotice({ tone: 'error', text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  /**
   * Publishing promotes the draft server-side, so the draft has to match the
   * form first. Saving as part of publishing also means an edit can never be
   * published while the server still holds an older value for it.
   */
  const publish = async () => {
    if (blocked() || busy) return;
    setBusy(true);
    const count = unpublished.length;
    try {
      await saveDraftRequest(definition.namespace, draftPayload());
      const stages = await publishDraft(definition.namespace);
      const live = accept(definition, stages.published);

      setPublished(live.values);
      setDraft(null);
      setForm(formFrom(definition, live.values, null));
      setConfirming(null);
      setOnlyChanged(false);
      setNotice(
        stages.revalidated
          ? {
              tone: 'ok',
              text: `Published ${count} change${plural(count)}. This is now live on the storefront.`,
            }
          : {
              tone: 'error',
              text: `Published ${count} change${plural(count)}, but the storefront could not be told to refresh. The values are saved — the site may show the old ones until its cache expires.`,
            }
      );
    } catch (error) {
      setConfirming(null);
      setNotice({ tone: 'error', text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const discardDraft = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await discardDraftRequest(definition.namespace);
      setDraft(null);
      setForm(formFrom(definition, published, null));
      setErrors({});
      setConfirming(null);
      setOnlyChanged(false);
      setNotice({ tone: 'ok', text: 'Draft discarded. Every field is back to what is published.' });
    } catch (error) {
      setConfirming(null);
      setNotice({ tone: 'error', text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const status = (): string => {
    if (unpublished.length === 0) return 'Everything here is published.';
    const parts = [`${unpublished.length} unpublished change${plural(unpublished.length)}`];
    if (unsaved.length > 0) parts.push(`${unsaved.length} not saved to the draft yet`);
    else if (draft) parts.push('saved as a draft');
    return parts.join(' · ');
  };

  return (
    <div className="flex flex-col gap-4">
      {loading && (
        <p role="status" className="alert alert-info text-sm">
          Loading what is currently live…
        </p>
      )}

      {notice && (
        <p
          role="status"
          className={cn(
            'alert text-sm',
            notice.tone === 'ok' ? 'alert-success' : 'alert-error'
          )}
        >
          {notice.text}
        </p>
      )}

      {unpublished.length > 0 && (
        <label className="flex items-center gap-2 text-sm font-normal text-ink-2">
          <input
            suppressHydrationWarning
            type="checkbox"
            checked={onlyChanged}
            className="h-4 w-4 accent-[var(--brand)]"
            onChange={(event) => setOnlyChanged(event.target.checked)}
          />
          Show only the {unpublished.length} unpublished change{plural(unpublished.length)}
        </label>
      )}

      {visible.map((section) => {
        const changedHere = section.entries.filter((entry) => changedPaths.has(entry.path)).length;
        return (
          <section key={section.title} className="border border-line bg-surface">
            <header className="flex items-center justify-between gap-3 border-b border-line bg-surface-2 px-4 py-2.5">
              <h2 className={cn(LABEL_VOICE, 'text-ink')}>{section.title}</h2>
              <span
                className={cn(
                  'text-[10px] font-bold uppercase tracking-[0.08em]',
                  changedHere > 0 ? 'text-ink' : 'text-ink-3'
                )}
              >
                {changedHere > 0
                  ? `${changedHere} unpublished`
                  : `${section.entries.length} field${plural(section.entries.length)}`}
              </span>
            </header>

            <div className="divide-y divide-line">
              {section.entries.map((entry) => (
                <ContentField
                  key={entry.address}
                  entry={entry}
                  value={form[entry.path]}
                  publishedValue={liveValueOf(entry)}
                  error={errors[entry.path] ?? null}
                  onChange={(value) => setValue(entry.path, value)}
                  onBlur={() =>
                    setErrors((current) => ({
                      ...current,
                      [entry.path]: entry.field.validate(form[entry.path]),
                    }))
                  }
                  onRevert={() => setValue(entry.path, liveValueOf(entry))}
                />
              ))}
            </div>
          </section>
        );
      })}

      {/* Bottom rather than top: the site header is already sticky, and the
          state of the draft has to stay readable next to the button that
          publishes it. */}
      <div className="sticky bottom-3 z-30 flex flex-col gap-3 border border-line bg-surface p-3 shadow-2">
        {confirming === 'publish' && (
          <div className="border border-line-strong bg-surface-2 p-3">
            <p className="text-sm font-semibold text-ink">
              Publish {unpublished.length} change{plural(unpublished.length)}?
            </p>
            <p className="form-help mt-0.5">
              These values replace what is live, and the draft is cleared.
            </p>
            <ul className="mt-2 max-h-52 space-y-2 overflow-y-auto pr-1">
              {unpublished.map((entry) => (
                <li key={entry.address} className="min-w-0">
                  <p className={LABEL_VOICE}>{entry.trail.join(' › ')}</p>
                  <p className="truncate text-xs text-ink-3 line-through">
                    {formatContentValue(liveValueOf(entry))}
                  </p>
                  <p className="truncate text-xs text-ink">
                    {formatContentValue(form[entry.path])}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {confirming === 'discard' && (
          <div className="border border-line-strong bg-surface-2 p-3">
            <p className="text-sm font-semibold text-ink">Discard the draft?</p>
            <p className="form-help mt-0.5">
              {unpublished.length} edit{plural(unpublished.length)} will be lost and every field
              goes back to what is published.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
            <span
              aria-hidden="true"
              className={cn(
                'h-2 w-2 shrink-0',
                unpublished.length > 0 ? 'bg-primary-500' : 'bg-line-strong'
              )}
            />
            {status()}
            {invalid.length > 0 && (
              <span className="text-red-600">
                · {invalid.length} field{plural(invalid.length)} invalid
              </span>
            )}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {confirming === null && (
              <>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  disabled={busy || loading || (draft === null && unpublished.length === 0)}
                  onClick={() => setConfirming('discard')}
                >
                  Discard draft
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  disabled={busy || loading || unsaved.length === 0}
                  onClick={saveDraft}
                >
                  {busy ? 'Working…' : 'Save draft'}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={busy || loading || unpublished.length === 0}
                  // Confirm only once the values would actually be accepted.
                  onClick={() => {
                    if (!blocked()) setConfirming('publish');
                  }}
                >
                  Publish…
                </button>
              </>
            )}

            {confirming === 'publish' && (
              <>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setConfirming(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={busy}
                  onClick={publish}
                >
                  {busy
                    ? 'Publishing…'
                    : `Publish ${unpublished.length} change${plural(unpublished.length)}`}
                </button>
              </>
            )}

            {confirming === 'discard' && (
              <>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setConfirming(null)}
                >
                  Keep draft
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  disabled={busy}
                  onClick={discardDraft}
                >
                  {busy ? 'Discarding…' : 'Discard'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export interface ContentEditorProps {
  /** URL segment. Must match a definition's own `namespace`. */
  namespace: string;
}

/**
 * The admin form for one content namespace.
 *
 * Values are read from and written to the content API, so a publish here is
 * what the storefront serves.
 *
 * Nothing here is written per namespace: the sections, the controls, the
 * validation and the published/draft diff are all derived from
 * `definition.paths`, so a field added to any schema appears in this form with
 * no edit to the admin.
 */
export const ContentEditor: React.FC<ContentEditorProps> = ({ namespace }) => {
  const definition = byNamespace.get(namespace);

  if (!definition) {
    return (
      <div className="alert alert-error">
        <p className="text-sm font-semibold">No editable content namespace called “{namespace}”.</p>
        <p className="mt-1 text-sm">
          Editable namespaces: {NAMESPACES.map((entry) => entry.namespace).join(', ')}.
        </p>
      </div>
    );
  }

  // Keyed so switching namespaces remounts rather than carrying one namespace's
  // draft state into another's fields.
  return <NamespaceEditor key={definition.namespace} definition={definition} />;
};

/** The namespace switcher. It lives here because the registry does. */
export const ContentNamespaceNav: React.FC<{ current: string }> = ({ current }) => (
  <nav aria-label="Content namespaces" className="flex flex-wrap gap-2">
    {NAMESPACES.map((entry) => {
      const active = entry.namespace === current;
      return (
        <Link
          key={entry.namespace}
          href={`/admin/content/${entry.namespace}`}
          aria-current={active ? 'page' : undefined}
          className={cn('btn btn-sm', active ? 'btn-secondary' : 'btn-outline')}
        >
          {namespaceLabel(entry.namespace)}
        </Link>
      );
    })}
  </nav>
);
