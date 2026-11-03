import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { User } from '@/types';

/**
 * Who is signed in, for the area of the site being viewed.
 *
 * There is no token here: the session is an httpOnly cookie the browser
 * attaches. `user` is what the realm's `GET …/auth/me` answered — a customer on
 * the storefront, a seller under `/seller`, staff under `/admin` — and `realm`
 * says which, so moving between areas re-checks the right one.
 */
interface AuthState {
  user: User | null;
  /** The realm the last session check asked about. */
  realm: User['realm'] | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** true once the session check for the current realm has finished. */
  isInitialized: boolean;
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  realm: null,
  isLoading: false,
  isAuthenticated: false,
  isInitialized: false,
  error: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    loginStart: (state) => {
      state.isLoading = true;
      state.error = null;
    },
    loginSuccess: (state, action: PayloadAction<User>) => {
      state.user = action.payload;
      state.realm = action.payload.realm;
      state.isAuthenticated = true;
      state.isInitialized = true;
      state.isLoading = false;
    },
    loginFailure: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
      state.isLoading = false;
    },

    logout: (state) => {
      state.user = null;
      state.isAuthenticated = false;
      state.error = null;
    },

    registerStart: (state) => {
      state.isLoading = true;
      state.error = null;
    },
    registerFailure: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
      state.isLoading = false;
    },

    updateUser: (state, action: PayloadAction<User>) => {
      state.user = action.payload;
    },

    /** A session check for `realm` started: hold pages until it answers. */
    sessionCheckStarted: (state, action: PayloadAction<User['realm']>) => {
      // Another area's account is no answer for this one.
      if (state.user && state.user.realm !== action.payload) {
        state.user = null;
        state.isAuthenticated = false;
      }
      state.realm = action.payload;
      state.isInitialized = false;
    },

    /** The session check answered — with the signed-in account, or null for a visitor. */
    sessionResolved: (state, action: PayloadAction<{ realm: User['realm']; user: User | null }>) => {
      // A slower answer for an area the reader has already left is stale.
      if (state.realm !== action.payload.realm) return;
      state.user = action.payload.user;
      state.isAuthenticated = Boolean(action.payload.user);
      state.isInitialized = true;
    },

    clearError: (state) => {
      state.error = null;
    },
  },
});

export const {
  loginStart,
  loginSuccess,
  loginFailure,
  logout,
  registerStart,
  registerFailure,
  updateUser,
  sessionCheckStarted,
  sessionResolved,
  clearError,
} = authSlice.actions;

export default authSlice.reducer;
