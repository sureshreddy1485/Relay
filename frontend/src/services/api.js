import axios from 'axios';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:5000/api';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
});

// Separate instance for file uploads — longer timeout for Cloudinary
export const uploadApi = axios.create({
  baseURL: BASE_URL,
  timeout: 120000,
  transformRequest: (data) => {
    return data; // Bypasses Axios transformation bugs for FormData on mobile
  },
});

// Brief cooldown after fresh auth to prevent 401 interceptor from racing
// against screens that mount and fire API calls before the server fully
// registers the new session.
let _authCooldownUntil = 0;
export const markAuthCooldown = () => {
  _authCooldownUntil = Date.now() + 5000; // 5-second grace window
};

// Shared error handler
let _isLoggingOut = false;
const handleError = (error) => {
  const message =
    error.response?.data?.message ||
    error.message ||
    'Network error — check your connection';
  error.message = message;

  if (error.response?.status === 401 && !error.config?.ignore401) {
    const url = error.config?.url || '';
    if (error.config && url !== '/auth/login' && url !== '/auth/signup' && url !== '/auth/logout') {
      // Skip auto-logout during the post-auth cooldown window
      if (Date.now() < _authCooldownUntil) {
        console.log('401 interceptor: skipping logout (auth cooldown active)');
      } else if (!_isLoggingOut) {
        _isLoggingOut = true;
        const useAuthStore = require('../store/useAuthStore').default;
        useAuthStore.getState().logout().finally(() => { _isLoggingOut = false; });
      }
    }
  }

  return Promise.reject(error);
};

api.interceptors.response.use((r) => r, handleError);
uploadApi.interceptors.response.use((r) => r, handleError);

// Mirror auth header across both instances
export const setAuthHeader = (token) => {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    uploadApi.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
    delete uploadApi.defaults.headers.common['Authorization'];
  }
};

export default api;

