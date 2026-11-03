import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Cart, CartItem } from '@/types';

/**
 * The shopper's bag as the API last priced it.
 *
 * Only ever replaced wholesale with a cart the server returned (`loadCart`):
 * lines are repriced on every read, so arithmetic on a local copy would drift
 * from what checkout charges.
 */
interface CartState {
  items: CartItem[];
  subtotalPaise: number;
  count: number;
  problems: string[];
  isLoading: boolean;
}

const initialState: CartState = {
  items: [],
  subtotalPaise: 0,
  count: 0,
  problems: [],
  isLoading: false,
};

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    clearCart: (state) => {
      state.items = [];
      state.subtotalPaise = 0;
      state.count = 0;
      state.problems = [];
    },

    loadCart: (state, action: PayloadAction<Cart>) => {
      const cart = action.payload;
      state.items = cart.items ?? [];
      state.subtotalPaise = cart.subtotalPaise ?? 0;
      state.count = cart.itemCount ?? state.items.reduce((sum, item) => sum + item.quantity, 0);
      state.problems = cart.problems ?? [];
    },

    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
  },
});

export const { clearCart, loadCart, setLoading } = cartSlice.actions;

export default cartSlice.reducer;
