import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Cart, CartItem } from '@/types';

interface CartState {
  items: CartItem[];
  total: number;
  count: number;
  isLoading: boolean;
}

const initialState: CartState = {
  items: [],
  total: 0,
  count: 0,
  isLoading: false,
};

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    // Add item
    addToCart: (state, action: PayloadAction<CartItem>) => {
      const existingItem = state.items.find(
        (item) =>
          item.productId === action.payload.productId &&
          item.variantId === action.payload.variantId
      );

      if (existingItem) {
        existingItem.quantity += action.payload.quantity;
      } else {
        state.items.push(action.payload);
      }

      state.count += action.payload.quantity;
      state.total += action.payload.price * action.payload.quantity;
    },

    // Remove item
    removeFromCart: (state, action: PayloadAction<string>) => {
      const item = state.items.find((item) => item.id === action.payload);
      if (item) {
        state.count -= item.quantity;
        state.total -= item.price * item.quantity;
        state.items = state.items.filter((item) => item.id !== action.payload);
      }
    },

    // Update quantity
    updateCartItemQuantity: (state, action: PayloadAction<{ id: string; quantity: number }>) => {
      const item = state.items.find((item) => item.id === action.payload.id);
      if (item) {
        const diff = action.payload.quantity - item.quantity;
        state.count += diff;
        state.total += item.price * diff;
        item.quantity = action.payload.quantity;
      }
    },

    // Clear cart
    clearCart: (state) => {
      state.items = [];
      state.total = 0;
      state.count = 0;
    },

    // Load cart
    loadCart: (state, action: PayloadAction<Cart>) => {
      state.items = action.payload.items;
      state.count = action.payload.items.reduce((sum, item) => sum + item.quantity, 0);
      state.total = action.payload.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    },

    // Set loading
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
  },
});

export const {
  addToCart,
  removeFromCart,
  updateCartItemQuantity,
  clearCart,
  loadCart,
  setLoading,
} = cartSlice.actions;

export default cartSlice.reducer;
