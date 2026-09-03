import React from 'react';
import {
  customWearCssVariables,
  customWearTheme,
  type CustomWearTheme,
} from '@/config/custom-wear/theme';

export interface CustomWearThemeProviderProps {
  theme?: CustomWearTheme;
  children: React.ReactNode;
  className?: string;
}

/**
 * Wraps every Custom Wear page. Publishes the theme as CSS custom properties
 * and emits the responsive button sizing that inline styles cannot express.
 *
 * This is the only place theme values become CSS — components read
 * `var(--cw-*)` and never hardcode a brand colour.
 */
export const CustomWearThemeProvider: React.FC<CustomWearThemeProviderProps> = ({
  theme = customWearTheme,
  children,
  className = '',
}) => {
  const { modeButton, ctaButton } = theme;

  const responsiveCss = `
.cw-scope {
  --cw-mode-fs: ${modeButton.fontSizeMobile};
  --cw-mode-px: calc(${modeButton.paddingX} * 0.7);
  --cw-mode-py: calc(${modeButton.paddingY} * 0.82);
  --cw-mode-minw: 140px;
  --cw-mode-fw: ${modeButton.fontWeight};
  --cw-mode-ls: ${modeButton.letterSpacing};
  --cw-mode-radius: ${modeButton.borderRadius};
  --cw-mode-border: ${modeButton.borderWidth};
  --cw-mode-transition: ${modeButton.transitionMs}ms;
  --cw-mode-font: ${modeButton.fontFamily};
  --cw-mode-bg: ${modeButton.inactiveBackground};
  --cw-mode-color: ${modeButton.inactiveText};
  --cw-mode-bd: ${modeButton.inactiveBorder};
  --cw-mode-bg-active: ${modeButton.activeBackground};
  --cw-mode-color-active: ${modeButton.activeText};
  --cw-mode-bd-active: ${modeButton.activeBorder};
  --cw-mode-bg-hover: ${modeButton.hoverBackground};
  --cw-mode-color-hover: ${modeButton.hoverText};

  --cw-cta-fs: ${ctaButton.fontSizeMobile};
  --cw-cta-px: ${ctaButton.paddingX};
  --cw-cta-py: ${ctaButton.paddingY};
  --cw-cta-fw: ${ctaButton.fontWeight};
  --cw-cta-radius: ${ctaButton.borderRadius};
  --cw-cta-border: ${ctaButton.borderWidth};
  --cw-cta-transition: ${ctaButton.transitionMs}ms;
  --cw-cta-font: ${ctaButton.fontFamily};
  --cw-cta-bg: ${ctaButton.inactiveBackground};
  --cw-cta-color: ${ctaButton.inactiveText};
  --cw-cta-bd: ${ctaButton.inactiveBorder};
  --cw-cta-bg-hover: ${ctaButton.hoverBackground};
  --cw-cta-color-hover: ${ctaButton.hoverText};
  --cw-cta-bg-active: ${ctaButton.activeBackground};
  --cw-cta-color-active: ${ctaButton.activeText};
}
@media (min-width: 768px) {
  .cw-scope {
    --cw-mode-fs: ${modeButton.fontSizeTablet};
    --cw-mode-px: calc(${modeButton.paddingX} * 0.85);
    --cw-mode-py: ${modeButton.paddingY};
    --cw-mode-minw: ${modeButton.minWidth};
    --cw-cta-fs: ${ctaButton.fontSizeTablet};
  }
}
@media (min-width: 1024px) {
  .cw-scope {
    --cw-mode-fs: ${modeButton.fontSizeDesktop};
    --cw-mode-px: ${modeButton.paddingX};
    --cw-cta-fs: ${ctaButton.fontSizeDesktop};
  }
}

/* ---- Shared control primitives ---- */
.cw-mode-btn {
  font-family: var(--cw-mode-font);
  font-size: var(--cw-mode-fs);
  font-weight: var(--cw-mode-fw);
  letter-spacing: var(--cw-mode-ls);
  border-radius: var(--cw-mode-radius);
  border: var(--cw-mode-border) solid var(--cw-mode-bd);
  padding: var(--cw-mode-py) var(--cw-mode-px);
  min-width: var(--cw-mode-minw);
  background: var(--cw-mode-bg);
  color: var(--cw-mode-color);
  transition: background-color var(--cw-mode-transition) ease,
    color var(--cw-mode-transition) ease, border-color var(--cw-mode-transition) ease,
    box-shadow var(--cw-mode-transition) ease;
}
.cw-mode-btn:hover:not([aria-pressed='true']) {
  background: var(--cw-mode-bg-hover);
  color: var(--cw-mode-color-hover);
}
.cw-mode-btn[aria-pressed='true'] {
  background: var(--cw-mode-bg-active);
  color: var(--cw-mode-color-active);
  border-color: var(--cw-mode-bd-active);
}
.cw-cta {
  font-family: var(--cw-cta-font);
  font-size: var(--cw-cta-fs);
  font-weight: var(--cw-cta-fw);
  border-radius: var(--cw-cta-radius);
  border: var(--cw-cta-border) solid var(--cw-cta-bd);
  padding: var(--cw-cta-py) var(--cw-cta-px);
  background: var(--cw-cta-bg);
  color: var(--cw-cta-color);
  transition: background-color var(--cw-cta-transition) ease,
    color var(--cw-cta-transition) ease, border-color var(--cw-cta-transition) ease;
}
.cw-cta:hover:not(:disabled) {
  background: var(--cw-cta-bg-hover);
  color: var(--cw-cta-color-hover);
  border-color: var(--cw-cta-bg-hover);
}
.cw-cta:disabled { opacity: 0.45; cursor: not-allowed; }
.cw-cta--accent {
  background: var(--cw-cta-bg-active);
  color: var(--cw-cta-color-active);
  border-color: var(--cw-cta-bg-active);
}
.cw-cta--accent:hover:not(:disabled) {
  background: var(--cw-primary-hover);
  border-color: var(--cw-primary-hover);
  color: var(--cw-cta-color-active);
}
.cw-cta--outline {
  background: transparent;
  color: var(--cw-ink);
  border-color: var(--cw-border-strong);
}
.cw-cta--outline:hover:not(:disabled) {
  background: var(--cw-ink);
  color: var(--cw-white);
  border-color: var(--cw-ink);
}

/* ---- Stage tabs ----
   Photography and the design tool share one frame. The active tab is marked by
   a brand underline rather than a filled pill, so the control sits quietly
   above the artwork instead of competing with it. */
.cw-stage-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--cw-border);
}
.cw-stage-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 10px 2px;
  margin-right: 20px;
  font-family: var(--cw-font-body);
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--cw-ink-subtle);
  transition: color 0.15s ease;
}
.cw-stage-tab::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: var(--cw-primary);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.2s ease;
}
.cw-stage-tab:hover {
  color: var(--cw-ink);
}
.cw-stage-tab[data-active='true'] {
  color: var(--cw-ink);
}
.cw-stage-tab[data-active='true']::after {
  transform: scaleX(1);
}
.cw-stage-tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 17px;
  height: 17px;
  padding: 0 5px;
  border-radius: var(--cw-radius-chip);
  background: var(--cw-ink);
  color: var(--cw-white);
  font-size: 9.5px;
  font-weight: 400;
  letter-spacing: 0;
}
.cw-stage-tab-dot {
  display: inline-block;
  height: 6px;
  width: 6px;
  border-radius: 999px;
  background: var(--cw-danger);
}

/* ---- Spec strip ----
   The product's facts as values, standing in for the accordion stack and the
   long-form copy that used to fill this column. */
.cw-specs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(104px, 1fr));
  list-style: none;
  margin: 0;
  padding: 0;
  background: var(--cw-white);
  border: 1px solid var(--cw-border);
}
.cw-specs li {
  padding: 14px 12px;
  box-shadow: inset -1px 0 0 var(--cw-border);
}
.cw-specs li:last-child {
  box-shadow: none;
}
.cw-specs-v {
  display: block;
  font-family: var(--cw-font-body);
  font-size: 16px;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.01em;
  color: var(--cw-ink);
}
.cw-specs-k {
  display: block;
  margin-top: 4px;
  font-family: var(--cw-font-body);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  line-height: 1.2;
  color: var(--cw-ink-subtle);
}

/* ---- Shared editorial primitives ---- */
/* Every field heading in the configurator — Colour, Size, Quantity, Volume
   Pricing — speaks in the same small-caps voice, so the panel reads as one
   form instead of six unrelated widgets. */
.cw-section-label {
  margin: 0;
  font-family: var(--cw-font-body);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--cw-ink);
}
.cw-section-label-note {
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: none;
  color: var(--cw-ink-subtle);
}

/* Uppercase micro label. Used for eyebrows, group titles and counts, so the
   module has one small-caps voice instead of five near-identical ones. */
.cw-eyebrow {
  margin: 0;
  color: var(--cw-ink-subtle);
  font-family: var(--cw-font-body);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  line-height: 1.4;
}
.cw-field-label {
  font-family: var(--cw-font-body);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--cw-ink-subtle);
}
.cw-pill {
  display: inline-flex;
  align-items: center;
  font-family: var(--cw-font-body);
  font-size: var(--cw-fs-micro);
  font-weight: 600;
  color: var(--cw-ink-muted);
  background: var(--cw-white);
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius-chip);
  padding: 7px 13px;
  text-decoration: none;
  transition: border-color 0.15s ease, color 0.15s ease;
}
.cw-pill:hover {
  border-color: var(--cw-ink);
  color: var(--cw-ink);
}

/* ---- Product grid ----
   The rail eats ~250px of the row, so this ladder reaches four columns one
   breakpoint later than the site-wide .pgrid. Gaps are the shared tokens, so
   the spacing still matches the rest of the catalog. */
.cw-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--card-row-gap) var(--card-gap);
}
@media (min-width: 1024px) {
  .cw-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (min-width: 1440px) {
  .cw-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

/* Visible, consistent focus ring for every interactive element in the module. */
.cw-scope :focus-visible {
  outline: 2px solid var(--cw-primary);
  outline-offset: 2px;
  border-radius: 4px;
}

/* Inputs: neutralise the global purple focus ring inside this module. */
.cw-scope input:focus,
.cw-scope select:focus,
.cw-scope textarea:focus {
  border-color: var(--cw-primary);
  box-shadow: none;
  --tw-ring-color: transparent;
}

.cw-scope input,
.cw-scope select,
.cw-scope textarea {
  font-family: var(--cw-font-body);
  font-size: var(--cw-fs-small);
  padding: 10px 12px;
  border-radius: var(--cw-radius-control);
  border-color: var(--cw-border);
}

@media (prefers-reduced-motion: reduce) {
  .cw-scope * { transition-duration: 0.01ms !important; }
}
`;

  return (
    <div className={`cw-scope ${className}`.trim()} style={customWearCssVariables(theme)}>
      <style dangerouslySetInnerHTML={{ __html: responsiveCss }} />
      {children}
    </div>
  );
};
