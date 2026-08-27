/** @type {import('tailwindcss').Config} */

/**
 * Global text size multiplier. 1 = the reference scale below; the site currently
 * runs deliberately small. Change this one number to resize all text.
 */
const TEXT_SCALE = 0.74;

// 10px floor so the smallest steps (badges, captions) stay legible.
const px = (n) => `${Math.max(10, Math.round(n * TEXT_SCALE))}px`;

/** [font-size, line-height] pairs, all derived from TEXT_SCALE. */
const SIZES = {
  xs: [px(14), px(19)],
  sm: [px(16), px(22)],
  base: [px(18), px(26)],
  lg: [px(21), px(29)],
  xl: [px(24), px(32)],
  '2xl': [px(28), px(36)],
  '3xl': [px(34), px(42)],
  '4xl': [px(40), px(48)],
  '5xl': [px(48), px(56)],
  '6xl': [px(58), px(66)],
  '7xl': [px(72), px(80)],
};

module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Brand theme: yellow (#FBB602)
        primary: {
          50: '#fffbeb',
          100: '#fef6d8',
          200: '#fdeaa8',
          300: '#fcdc6d',
          400: '#fcc93a',
          500: '#fbb602',
          600: '#e5a602',
          700: '#c48e03',
          800: '#9c7104',
          900: '#755505',
        },
        secondary: {
          50: '#fbf8f1',
          100: '#f5eeda',
          200: '#eadcb2',
          300: '#dfc98a',
          400: '#d9bc60',
          500: '#d4af37',
          600: '#b8962d',
          700: '#957823',
          800: '#725b1b',
          900: '#544314',
        },
        accent: {
          50: '#fef3c7',
          100: '#fde68a',
          200: '#fcd34d',
          300: '#fbbf24',
          400: '#f59e0b',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#92400e',
          900: '#78350f',
        },
        luxury: {
          gold: '#d4af37',
          silver: '#e8e8e8',
          copper: '#b87333',
        },
        neutral: {
          50: '#fafaf9',
          100: '#f5f5f4',
          200: '#e7e5e4',
          300: '#d6d3d1',
          400: '#a8a29e',
          500: '#78716c',
          600: '#57534e',
          700: '#44403c',
          800: '#292524',
          900: '#1c1917',
        },
        // Token aliases so utilities and CSS variables never drift apart.
        ink: {
          DEFAULT: 'var(--ink)',
          2: 'var(--ink-2)',
          3: 'var(--ink-3)',
        },
        surface: {
          DEFAULT: 'var(--surface)',
          2: 'var(--surface-2)',
        },
        line: {
          DEFAULT: 'var(--border)',
          strong: 'var(--border-strong)',
        },
      },
      maxWidth: {
        content: 'var(--content-max)',
      },
      fontFamily: {
        // Single site-wide font (Inter). Legacy aliases kept so existing
        // font-serif / font-playfair / font-montserrat usages resolve to it.
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        playfair: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        montserrat: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      // Compact scale. TEXT_SCALE below is the single knob for global text
      // size — lower it to shrink every font step on the site at once.
      fontSize: SIZES,
      boxShadow: {
        // Token-backed scale — use these for anything new.
        1: 'var(--shadow-1)',
        2: 'var(--shadow-2)',
        3: 'var(--shadow-3)',
        sm: 'var(--shadow-1)',
        base: 'var(--shadow-1)',
        md: 'var(--shadow-2)',
        lg: 'var(--shadow-2)',
        xl: 'var(--shadow-3)',
        luxury: 'var(--shadow-3)',
        // The yellow hover glow — pair with hover:border-primary-500.
        brand: 'var(--shadow-brand)',
        'inner-md': 'inset 0 2px 4px 0 rgba(17, 17, 17, 0.06)',
      },
      spacing: {
        '128': '32rem',
        '144': '36rem',
      },
      borderRadius: {
        none: '0',
        // Token-backed: every card lands on --r-card, every control on --r-control.
        card: 'var(--r-card)',
        control: 'var(--r-control)',
        sm: 'var(--r-sm)',
        base: 'var(--r-sm)',
        md: 'var(--r-md)',
        lg: 'var(--r-lg)',
        xl: 'var(--r-lg)',
        '2xl': '2rem',
        '3xl': '3rem',
        full: 'var(--r-pill)',
      },
      transitionTimingFunction: {
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      zIndex: {
        hide: '-1',
        auto: 'auto',
        base: '0',
        docked: '10',
        dropdown: '1000',
        sticky: '1020',
        fixed: '1030',
        modalBackdrop: '1040',
        offcanvas: '1050',
        modal: '1060',
        popover: '1070',
        tooltip: '1080',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
    // NOTE: @tailwindcss/aspect-ratio is deliberately NOT loaded. It is the
    // deprecated aspect-w-*/aspect-h-* plugin, and it overrides Tailwind's core
    // aspect-* utilities — with it enabled, aspect-square / aspect-video /
    // aspect-[4/5] all silently emit nothing. Nothing here uses the old API.
    require('@tailwindcss/container-queries'),
  ],
  darkMode: 'class',
};
