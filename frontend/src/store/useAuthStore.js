import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
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
      let token = await AsyncStorage.getItem('relay_token');
      let userStr = await AsyncStorage.getItem('relay_user');

      if (token && userStr) {
        const user = JSON.parse(userStr);
        set({ token, user, isAuthenticated: true });
        setAuthHeader(token);

        // Fetch fresh user data from server in the background
        try {
          const { data } = await api.get('/auth/me');
          if (data.user) {
            set({ user: data.user });
            await AsyncStorage.setItem('relay_user', JSON.stringify(data.user));
          }
        } catch (serverErr) {
          console.log('Failed to refresh user profile from server:', serverErr.message);
          // If token is explicitly rejected (e.g., changed secrets, expired), clear session
          if (serverErr.response?.status === 401 || serverErr.message.includes('401')) {
            console.log('Token rejected by server. Clearing local session.');
            await AsyncStorage.removeItem('relay_token');
            await AsyncStorage.removeItem('relay_user');
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
      const deviceName = Device.isDevice ? `${Device.osName} ${Device.modelName}` : `${Platform.OS} Simulator`;
      let deviceId = await AsyncStorage.getItem('relay_device_id');
      if (!deviceId) {
        deviceId = 'dev_' + Date.now() + '_' + Math.random().toString(36).substring(2);
        await AsyncStorage.setItem('relay_device_id', deviceId);
      }
      formData.append('deviceName', deviceName);
      formData.append('deviceId', deviceId);
      
      const { data } = await uploadApi.post('/auth/signup', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await AsyncStorage.setItem('relay_token', data.token);
      await AsyncStorage.setItem('relay_user', JSON.stringify(data.user));
      setAuthHeader(data.token);
      set({ user: data.user, token: data.token, isAuthenticated: true, isLoading: false });
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.message || 'Signup failed';
      set({ error: message, isLoading: false });
      return { success: false, message };
    }
  },

  login: async (identifier, password, securityKey) => {
    set({ isLoading: true, error: null });
    try {
      const deviceName = Device.isDevice ? `${Device.osName} ${Device.modelName}` : `${Platform.OS} Simulator`;
      let deviceId = await AsyncStorage.getItem('relay_device_id');
      if (!deviceId) {
        deviceId = 'dev_' + Date.now() + '_' + Math.random().toString(36).substring(2);
        await AsyncStorage.setItem('relay_device_id', deviceId);
      }
      const { data } = await api.post('/auth/login', { identifier, password, securityKey, deviceName, deviceId });
      await AsyncStorage.setItem('relay_token', data.token);
      await AsyncStorage.setItem('relay_user', JSON.stringify(data.user));
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
    await AsyncStorage.removeItem('relay_token');
    await AsyncStorage.removeItem('relay_user');
    setAuthHeader(null);
    set({ user: null, token: null, isAuthenticated: false });
  },

  updateUser: (updates) => {
    const updated = { ...get().user, ...updates };
    set({ user: updated });
    AsyncStorage.setItem('relay_user', JSON.stringify(updated));
  },

  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),
}));

export default useAuthStore;
