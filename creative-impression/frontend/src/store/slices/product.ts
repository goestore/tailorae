import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Product, ProductFilters } from '@/types';

interface ProductState {
  products: Product[];
  filteredProducts: Product[];
  selectedProduct: Product | null;
  filters: ProductFilters;
  isLoading: boolean;
  totalProducts: number;
  currentPage: number;
}

const initialState: ProductState = {
  products: [],
  filteredProducts: [],
  selectedProduct: null,
  filters: { page: 1, limit: 20 },
  isLoading: false,
  totalProducts: 0,
  currentPage: 1,
};

const productSlice = createSlice({
  name: 'product',
  initialState,
  reducers: {
    // Load products
    loadProductsStart: (state) => {
      state.isLoading = true;
    },
    loadProductsSuccess: (state, action: PayloadAction<{ products: Product[]; total: number }>) => {
      state.products = action.payload.products;
      state.filteredProducts = action.payload.products;
      state.totalProducts = action.payload.total;
      state.isLoading = false;
    },
    loadProductsFailure: (state) => {
      state.isLoading = false;
    },

    // Set filters
    setFilters: (state, action: PayloadAction<ProductFilters>) => {
      state.filters = { ...state.filters, ...action.payload };
    },

    // Filter products
    filterProducts: (state) => {
      let filtered = [...state.products];

      if (state.filters.search) {
        const search = state.filters.search.toLowerCase();
        filtered = filtered.filter(
          (p) =>
            p.name.toLowerCase().includes(search) ||
            p.description?.toLowerCase().includes(search)
        );
      }

      if (state.filters.minPrice !== undefined) {
        filtered = filtered.filter((p) => p.price >= state.filters.minPrice!);
      }

      if (state.filters.maxPrice !== undefined) {
        filtered = filtered.filter((p) => p.price <= state.filters.maxPrice!);
      }

      if (state.filters.rating !== undefined) {
        filtered = filtered.filter((p) => p.rating >= state.filters.rating!);
      }

      if (state.filters.inStock) {
        filtered = filtered.filter((p) => p.quantity > 0);
      }

      if (state.filters.isCustomizable) {
        filtered = filtered.filter((p) => p.isCustomizable);
      }

      // Sort
      if (state.filters.sortBy) {
        switch (state.filters.sortBy) {
          case 'price-asc':
            filtered.sort((a, b) => a.price - b.price);
            break;
          case 'price-desc':
            filtered.sort((a, b) => b.price - a.price);
            break;
          case 'rating':
            filtered.sort((a, b) => b.rating - a.rating);
            break;
          case 'newest':
            filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            break;
        }
      }

      state.filteredProducts = filtered;
    },

    // Set selected product
    setSelectedProduct: (state, action: PayloadAction<Product | null>) => {
      state.selectedProduct = action.payload;
    },

    // Clear filters
    clearFilters: (state) => {
      state.filters = { page: 1, limit: 20 };
      state.filteredProducts = state.products;
    },

    // Set page
    setPage: (state, action: PayloadAction<number>) => {
      state.currentPage = action.payload;
      state.filters.page = action.payload;
    },
  },
});

export const {
  loadProductsStart,
  loadProductsSuccess,
  loadProductsFailure,
  setFilters,
  filterProducts,
  setSelectedProduct,
  clearFilters,
  setPage,
} = productSlice.actions;

export default productSlice.reducer;
