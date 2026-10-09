import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { getStorageItem, setStorageItem } from '@/utils/helpers';
import type { CustomWearQuoteLine } from '@/types/custom-wear';

const WISHLIST_STORAGE_KEY = 'cw:wishlist';
/**
 * Configured custom garments waiting in the cart's custom-wear section.
 *
 * Kept here, not in the `cart` slice, on purpose: that slice mirrors the
 * server cart (DB products, paid at checkout) and is replaced wholesale every
 * time the server cart is loaded. Custom wear is made to order and priced by a
 * person, so these lines become a quote request instead — living apart means
 * no cart hydration can wipe them and they never reach the checkout total.
 */
const QUOTE_LINES_STORAGE_KEY = 'cw:quote-lines';
const MAX_QUOTE_LINES = 20;

interface CustomWearState {
  /** Product ids the visitor has hearted. Persisted locally for guests. */
  wishlist: string[];
  /** Set once the persisted wishlist has been read, to avoid hydration mismatch. */
  hydrated: boolean;
  /** Garments to request a quote for, from the cart's custom-wear section. */
  quoteLines: CustomWearQuoteLine[];
  quoteLinesHydrated: boolean;
}

const initialState: CustomWearState = {
  wishlist: [],
  hydrated: false,
  quoteLines: [],
  quoteLinesHydrated: false,
};

const persistQuoteLines = (lines: CustomWearQuoteLine[]): void => {
  setStorageItem(QUOTE_LINES_STORAGE_KEY, lines);
};

const isQuoteLine = (value: unknown): value is CustomWearQuoteLine =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as CustomWearQuoteLine).id === 'string' &&
  typeof (value as CustomWearQuoteLine).productId === 'string' &&
  typeof (value as CustomWearQuoteLine).quantity === 'number' &&
  Array.isArray((value as CustomWearQuoteLine).sizes);

const persist = (wishlist: string[]): void => {
  setStorageItem(WISHLIST_STORAGE_KEY, wishlist);
};

/**
 * Load the stored lines into state if that has not happened yet, so a write
 * made before the hydration effect ran can never overwrite what was stored.
 */
const ensureQuoteLines = (state: CustomWearState): void => {
  if (state.quoteLinesHydrated || typeof window === 'undefined') return;
  const stored = getStorageItem<unknown[]>(QUOTE_LINES_STORAGE_KEY, []);
  const restored = Array.isArray(stored) ? stored.filter(isQuoteLine) : [];
  const known = new Set(state.quoteLines.map((line) => line.id));
  state.quoteLines = [...restored.filter((line) => !known.has(line.id)), ...state.quoteLines];
  state.quoteLinesHydrated = true;
};

const customWearSlice = createSlice({
  name: 'customWear',
  initialState,
  reducers: {
    /** Dispatched from a client effect so the server render stays deterministic. */
    hydrateWishlist: (state) => {
      const stored = getStorageItem<string[]>(WISHLIST_STORAGE_KEY, []);
      state.wishlist = Array.isArray(stored)
        ? stored.filter((id): id is string => typeof id === 'string')
        : [];
      state.hydrated = true;
    },

    toggleWishlistItem: (state, action: PayloadAction<string>) => {
      const productId = action.payload;
      state.wishlist = state.wishlist.includes(productId)
        ? state.wishlist.filter((id) => id !== productId)
        : [...state.wishlist, productId];
      persist(state.wishlist);
    },

    clearWishlist: (state) => {
      state.wishlist = [];
      persist(state.wishlist);
    },

    /** Read the persisted quote lines once, from a client effect. */
    hydrateQuoteLines: (state) => {
      ensureQuoteLines(state);
    },

    /** Same configuration twice adds up the quantity rather than a second line. */
    addQuoteLine: (state, action: PayloadAction<CustomWearQuoteLine>) => {
      ensureQuoteLines(state);
      const line = action.payload;
      const existing = state.quoteLines.find((entry) => entry.id === line.id);
      if (existing) {
        existing.quantity += line.quantity;
        existing.estimatedTotal += line.estimatedTotal;
      } else {
        state.quoteLines = [...state.quoteLines, line].slice(-MAX_QUOTE_LINES);
      }
      persistQuoteLines(state.quoteLines);
    },

    removeQuoteLines: (state, action: PayloadAction<string[]>) => {
      ensureQuoteLines(state);
      const ids = new Set(action.payload);
      state.quoteLines = state.quoteLines.filter((line) => !ids.has(line.id));
      persistQuoteLines(state.quoteLines);
    },
  },
});

export const {
  hydrateWishlist,
  toggleWishlistItem,
  clearWishlist,
  hydrateQuoteLines,
  addQuoteLine,
  removeQuoteLines,
} = customWearSlice.actions;

export default customWearSlice.reducer;
