import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api, { uploadApi, setAuthHeader } from '../services/api';

const useAuthStore = create((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  // Hydrate from storage on app start
  hydrate: async () => {
    try {
      let token = await AsyncStorage.getItem('nexo_token');
      let userStr = await AsyncStorage.getItem('nexo_user');
      
      // Backward compatibility for app rename
      if (!token || !userStr) {
        token = await AsyncStorage.getItem('nexchat_token');
        userStr = await AsyncStorage.getItem('nexchat_user');
        if (token && userStr) {
          await AsyncStorage.setItem('nexo_token', token);
          await AsyncStorage.setItem('nexo_user', userStr);
        }
      }

      if (token && userStr) {
        const user = JSON.parse(userStr);
        set({ token, user, isAuthenticated: true });
        setAuthHeader(token);

        // Fetch fresh user data from server in the background
        try {
          const { data } = await api.get('/auth/me');
          if (data.user) {
            set({ user: data.user });
            await AsyncStorage.setItem('nexo_user', JSON.stringify(data.user));
          }
        } catch (serverErr) {
          console.log('Failed to refresh user profile from server:', serverErr.message);
          // If token is explicitly rejected (e.g., changed secrets, expired), clear session
          if (serverErr.response?.status === 401 || serverErr.message.includes('401')) {
            console.log('Token rejected by server. Clearing local session.');
            await AsyncStorage.removeItem('nexo_token');
            await AsyncStorage.removeItem('nexo_user');
            setAuthHeader(null);
            set({ user: null, token: null, isAuthenticated: false });
          }
        }
      }
    } catch (e) {
      console.log('Hydrate error:', e);
    }
  },

  signup: async (formData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await uploadApi.post('/auth/signup', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await AsyncStorage.setItem('nexo_token', data.token);
      await AsyncStorage.setItem('nexo_user', JSON.stringify(data.user));
      setAuthHeader(data.token);
      set({ user: data.user, token: data.token, isAuthenticated: true, isLoading: false });
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.message || 'Signup failed';
      set({ error: message, isLoading: false });
      return { success: false, message };
    }
  },

  login: async (identifier, password) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post('/auth/login', { identifier, password });
      await AsyncStorage.setItem('nexo_token', data.token);
      await AsyncStorage.setItem('nexo_user', JSON.stringify(data.user));
      setAuthHeader(data.token);
      set({ user: data.user, token: data.token, isAuthenticated: true, isLoading: false });
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.message || 'Login failed';
      set({ error: message, isLoading: false });
      return { success: false, message };
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch (_) {}
    await AsyncStorage.removeItem('nexo_token');
    await AsyncStorage.removeItem('nexo_user');
    setAuthHeader(null);
    set({ user: null, token: null, isAuthenticated: false });
  },

  updateUser: (updates) => {
    const updated = { ...get().user, ...updates };
    set({ user: updated });
    AsyncStorage.setItem('nexo_user', JSON.stringify(updated));
  },

  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),
}));

export default useAuthStore;
