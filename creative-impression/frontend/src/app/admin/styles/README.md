# Admin design system

`../admin.css` is loaded by the admin layout only. Keep admin selectors out of
`src/styles/globals.css` so storefront pages do not carry management styles.

Load order:

1. `foundation.css`: existing content-editor, segmented-tab, and preview layouts.
2. `tokens.css`: semantic colors, surfaces, borders, radii, and section themes.
3. `shell.css`: navigation, topbar, content scrolling, and mobile breakpoints.
4. `components.css`: cards, metrics, tables, controls, status pills, and forms.

Use `--admin-text`, `--admin-text-2`, and `--admin-muted` for text; use
`--admin-panel` and `--admin-panel-2` for surfaces. Use `--admin-line` only for
boundaries. Brand colors and storefront utility tokens are mapped within
`.admin-shell`, so shared form components inherit the admin theme.

Prefer the existing `admin-card`, `admin-grid-kpi`, `admin-table-wrap`,
`admin-table`, and button classes. Inline styles should describe dynamic layout,
not literal theme colors. Status pills accept an uppercase `data-status` value;
their text must remain visible so color is never the only indicator.

Tables keep their semantic markup and scroll inside their cards on small
screens. Navigation becomes a drawer below 900px; metric cards use two columns
below 600px. All interactive controls have visible keyboard focus, and motion
is suppressed for the reduced-motion preference.
