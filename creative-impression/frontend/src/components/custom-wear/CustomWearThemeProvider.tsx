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
