import axios, { AxiosInstance, AxiosError } from 'axios';

export const createApiClient = (baseURL?: string): AxiosInstance => {
  const client = axios.create({
    baseURL: baseURL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api',
    timeout: 10000,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Request interceptor
  client.interceptors.request.use(
    (config) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      // A file upload must not go out as JSON. With the default JSON header,
      // axios serialises FormData to a JSON string and the file is dropped —
      // every admin image upload failed with "No file was uploaded". Removing
      // the header lets the browser write multipart/form-data with its own
      // boundary.
      if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
        config.headers.delete('Content-Type');
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  // Response interceptor
  client.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      if (error.response?.status === 401) {
        // The session is gone: drop the token and send them to sign in.
        if (typeof window !== 'undefined') {
          localStorage.removeItem('token');
          if (!window.location.pathname.startsWith('/auth/')) {
            /**
             * A full page load, not a router push, and deliberately so. This is
             * module scope — there is no router here — and an expired session
             * should discard every piece of client state that was read under
             * it: the redux store, the cart, any half-filled form. A soft
             * navigation would carry all of it into the login page.
             */
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.href = '/auth/login';
          }
        }
      }
      return Promise.reject(error);
    }
  );

  return client;
};

export const apiClient = createApiClient();
