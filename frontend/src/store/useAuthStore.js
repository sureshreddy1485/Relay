import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import api, { uploadApi, setAuthHeader, markAuthCooldown } from '../services/api';

const useAuthStore = create((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  savedAccounts: [],
  pendingRecoveryKey: null,
  migrationPassword: null,
  clearPendingRecovery: () => set({ pendingRecoveryKey: null, migrationPassword: null }),

  // Hydrate from storage on app start
  hydrate: async () => {
    try {
      let token = await AsyncStorage.getItem('relay_token');
      let userStr = await AsyncStorage.getItem('relay_user');

      let savedStr = await AsyncStorage.getItem('relay_saved_accounts');
      if (savedStr) {
        try {
          const parsed = JSON.parse(savedStr);
          if (Array.isArray(parsed)) {
            set({ savedAccounts: parsed });
          }
        } catch (e) {}
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

  _saveAccountToStore: async (user, token) => {
    if (!user || !user._id) return;
    let currentSaved = get().savedAccounts;
    let saved = Array.isArray(currentSaved) ? [...currentSaved] : [];
    const exists = saved.findIndex(a => String(a?.user?._id) === String(user._id));
    if (exists > -1) {
      saved[exists] = { user, token };
    } else {
      saved.push({ user, token });
    }
    set({ savedAccounts: saved });
    await AsyncStorage.setItem('relay_saved_accounts', JSON.stringify(saved));
  },

  removeSavedAccount: async (userId) => {
    let currentSaved = get().savedAccounts;
    if (!Array.isArray(currentSaved)) return;
    let saved = currentSaved.filter(a => String(a?.user?._id) !== String(userId));
    set({ savedAccounts: saved });
    await AsyncStorage.setItem('relay_saved_accounts', JSON.stringify(saved));
    
    // Also remove from relay_saved_logins which is used by LoginScreen specifically
    try {
      let savedLoginsStr = await AsyncStorage.getItem('relay_saved_logins');
      if (savedLoginsStr) {
        let savedLogins = JSON.parse(savedLoginsStr);
        savedLogins = savedLogins.filter(a => String(a?.userId) !== String(userId));
        await AsyncStorage.setItem('relay_saved_logins', JSON.stringify(savedLogins));
      }
    } catch(e) {}
  },

  switchAccount: async (targetUserId) => {
    const saved = get().savedAccounts;
    const target = saved.find(a => String(a?.user?._id) === String(targetUserId));
    if (!target) return false;

    // Save current session state before switching
    const currentToken = get().token;
    const currentUser = get().user;
    if (currentToken && currentUser) {
      await get()._saveAccountToStore(currentUser, currentToken);
    }

    setAuthHeader(target.token);
    await AsyncStorage.setItem('relay_token', target.token);
    await AsyncStorage.setItem('relay_user', JSON.stringify(target.user));
    set({ user: target.user, token: target.token, isAuthenticated: true });

    try {
      // Reset and fetch new chats immediately so the UI updates
      const useChatStore = require('./useChatStore').default;
      if (useChatStore && useChatStore.getState) {
        useChatStore.getState().reset();
        useChatStore.getState().fetchChats();
      }
    } catch (e) {
      console.log('Failed to reset chat store on switch:', e);
    }
    
    return true;
  },

  completeAuth: async (user, token) => {
    // 1. Set auth header immediately so concurrent API calls have it.
    setAuthHeader(token);

    // 2. Persist to AsyncStorage FIRST to guarantee hydrate() works.
    await AsyncStorage.setItem('relay_token', token);
    await AsyncStorage.setItem('relay_user', JSON.stringify(user));

    // 3. Activate cooldown so the 401 interceptor doesn't auto-logout
    //    when screens mount after the navigator swap and fire API calls
    //    before the server fully registers the new session.
    markAuthCooldown();

    // 4. Now set in-memory state. RootNavigator subscribes to this.
    set({ user, token, isAuthenticated: true, pendingRecoveryKey: null, migrationPassword: null });

    // 5. Save to multi-account store (non-critical, fire-and-forget).
    try {
      await get()._saveAccountToStore(user, token);
    } catch (e) {
      console.log('Non-critical: failed to save account to multi-account store:', e);
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
      set({ isLoading: false });
      return { success: true, user: data.user, token: data.token, recoveryKey: data.recoveryKey, recoveryKeys: data.recoveryKeys };
    } catch (err) {
      const message = err.response?.data?.message || 'Signup failed';
      set({ error: message, isLoading: false });
      return { success: false, message };
    }
  },

  login: async (identifier, password) => {
    set({ isLoading: true, error: null });
    try {
      const deviceName = Device.isDevice ? `${Device.osName} ${Device.modelName}` : `${Platform.OS} Simulator`;
      let deviceId = await AsyncStorage.getItem('relay_device_id');
      if (!deviceId) {
        deviceId = 'dev_' + Date.now() + '_' + Math.random().toString(36).substring(2);
        await AsyncStorage.setItem('relay_device_id', deviceId);
      }
      const { data } = await api.post('/auth/login', { identifier, password, deviceName, deviceId });
      
      await get().completeAuth(data.user, data.token);
      set({ isLoading: false });
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.message || 'Login failed';
      set({ error: message, isLoading: false });
      
      // If user was deleted or not found, remove from saved accounts automatically
      if (err.response?.status === 404) {
         try {
           const savedLoginsStr = await AsyncStorage.getItem('relay_saved_logins');
           if (savedLoginsStr) {
             let savedLogins = JSON.parse(savedLoginsStr);
             const matched = savedLogins.find(l => l.identifier === identifier);
             if (matched) {
               await get().removeSavedAccount(matched.userId);
             }
           }
         } catch(e) {}
      }

      return { success: false, message };
    }
  },



  logout: async () => {
    try {
      await api.post('/auth/logout', {}, { ignore401: true });
    } catch (_) {}
    await AsyncStorage.removeItem('relay_token');
    await AsyncStorage.removeItem('relay_user');
    setAuthHeader(null);
    set({ user: null, token: null, isAuthenticated: false });
    try {
      const useChatStore = require('./useChatStore').default;
      useChatStore.getState().reset();
    } catch (e) {}
  },

  prepareAddAccount: async () => {
    // Save current session before dropping out locally
    const currentToken = get().token;
    const currentUser = get().user;
    if (currentToken && currentUser) {
      await get()._saveAccountToStore(currentUser, currentToken);
    }
    
    // Clear local state ONLY - do NOT call /auth/logout
    await AsyncStorage.removeItem('relay_token');
    await AsyncStorage.removeItem('relay_user');
    setAuthHeader(null);
    set({ user: null, token: null, isAuthenticated: false });
    try {
      const useChatStore = require('./useChatStore').default;
      useChatStore.getState().reset();
    } catch (e) {}
  },

  updateUser: (updates) => {
    const updated = { ...get().user, ...updates };
    set({ user: updated });
    AsyncStorage.setItem('relay_user', JSON.stringify(updated));
    get()._saveAccountToStore(updated, get().token);
  },

  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),
}));

export default useAuthStore;
