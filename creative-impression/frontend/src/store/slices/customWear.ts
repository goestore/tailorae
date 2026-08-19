import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { getStorageItem, setStorageItem } from '@/utils/helpers';

const WISHLIST_STORAGE_KEY = 'cw:wishlist';

interface CustomWearState {
  /** Product ids the visitor has hearted. Persisted locally for guests. */
  wishlist: string[];
  /** Set once the persisted wishlist has been read, to avoid hydration mismatch. */
  hydrated: boolean;
}

const initialState: CustomWearState = {
  wishlist: [],
  hydrated: false,
};

const persist = (wishlist: string[]): void => {
  setStorageItem(WISHLIST_STORAGE_KEY, wishlist);
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
  },
});

export const { hydrateWishlist, toggleWishlistItem, clearWishlist } = customWearSlice.actions;

export default customWearSlice.reducer;
