import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface UIState {
  isDarkMode: boolean;
  sidebarOpen: boolean;
  searchOpen: boolean;
  filterOpen: boolean;
  compareOpen: boolean;
  wishlistOpen: boolean;
  notificationCount: number;
  cartOpen: boolean;
}

const initialState: UIState = {
  isDarkMode: false,
  sidebarOpen: false,
  searchOpen: false,
  filterOpen: false,
  compareOpen: false,
  wishlistOpen: false,
  notificationCount: 0,
  cartOpen: false,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleDarkMode: (state) => {
      state.isDarkMode = !state.isDarkMode;
    },
    setDarkMode: (state, action: PayloadAction<boolean>) => {
      state.isDarkMode = action.payload;
    },

    toggleSidebar: (state) => {
      state.sidebarOpen = !state.sidebarOpen;
    },
    setSidebarOpen: (state, action: PayloadAction<boolean>) => {
      state.sidebarOpen = action.payload;
    },

    toggleSearch: (state) => {
      state.searchOpen = !state.searchOpen;
    },
    setSearchOpen: (state, action: PayloadAction<boolean>) => {
      state.searchOpen = action.payload;
    },

    toggleFilter: (state) => {
      state.filterOpen = !state.filterOpen;
    },
    setFilterOpen: (state, action: PayloadAction<boolean>) => {
      state.filterOpen = action.payload;
    },

    toggleCompare: (state) => {
      state.compareOpen = !state.compareOpen;
    },
    setCompareOpen: (state, action: PayloadAction<boolean>) => {
      state.compareOpen = action.payload;
    },

    toggleWishlist: (state) => {
      state.wishlistOpen = !state.wishlistOpen;
    },
    setWishlistOpen: (state, action: PayloadAction<boolean>) => {
      state.wishlistOpen = action.payload;
    },

    toggleCart: (state) => {
      state.cartOpen = !state.cartOpen;
    },
    setCartOpen: (state, action: PayloadAction<boolean>) => {
      state.cartOpen = action.payload;
    },

    setNotificationCount: (state, action: PayloadAction<number>) => {
      state.notificationCount = action.payload;
    },

    closeAllModals: (state) => {
      state.sidebarOpen = false;
      state.searchOpen = false;
      state.filterOpen = false;
      state.compareOpen = false;
      state.wishlistOpen = false;
      state.cartOpen = false;
    },
  },
});

export const {
  toggleDarkMode,
  setDarkMode,
  toggleSidebar,
  setSidebarOpen,
  toggleSearch,
  setSearchOpen,
  toggleFilter,
  setFilterOpen,
  toggleCompare,
  setCompareOpen,
  toggleWishlist,
  setWishlistOpen,
  toggleCart,
  setCartOpen,
  setNotificationCount,
  closeAllModals,
} = uiSlice.actions;

export default uiSlice.reducer;
