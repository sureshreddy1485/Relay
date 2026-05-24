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

// Shared error handler
const handleError = (error) => {
  const message =
    error.response?.data?.message ||
    error.message ||
    'Network error — check your connection';
  error.message = message;
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
