import 'react-native-gesture-handler';
import React, { useEffect, useState, useRef } from 'react';
import { StatusBar, LogBox, View, Animated, StyleSheet, Image, Text, Alert, AppState, Modal, TouchableOpacity } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Notifications from 'expo-notifications';
import * as Updates from 'expo-updates';
import notifee, { EventType } from '@notifee/react-native';
import messaging from '@react-native-firebase/messaging';
// RootNavigator dynamically imported later to allow Colors override
// import RootNavigator from './src/navigation/RootNavigator';
import useAuthStore from './src/store/useAuthStore';
import { connectSocket } from './src/services/socketService';

LogBox.ignoreLogs(['Warning: ...', 'Animated: `useNativeDriver`']);

Notifications.setNotificationHandler({
  handleNotification: async () => {
    const isActive = AppState.currentState === 'active';
    return {
      shouldShowAlert: true, // Always show system banner
      shouldPlaySound: true, // System sound respects silent mode
      shouldSetBadge: true,
    };
  },
});

import { AlertProvider } from './src/components/CustomAlert';

import { Colors, AppThemes } from './src/theme/colors';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function App() {
  const { hydrate, user, isAuthenticated } = useAuthStore();
  const [themeLoaded, setThemeLoaded] = useState(false);
  const [splashVisible, setSplashVisible] = useState(true);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const splashAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    const initTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem('app_theme');
        if (savedTheme === 'cyan') {
          Object.assign(Colors, AppThemes.cyan);
        } else {
          Object.assign(Colors, AppThemes.relay);
        }
      } catch (e) {}
      setThemeLoaded(true);
      hydrate();
    };
    initTheme();
  }, []);

  useEffect(() => {
    if (themeLoaded) {
      Animated.parallel([
        Animated.timing(scaleAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(splashAnim, { toValue: 0, duration: 400, delay: 1000, useNativeDriver: true })
      ]).start(() => {
        setSplashVisible(false);
      });
    }
  }, [themeLoaded]);

  useEffect(() => {
    if (isAuthenticated) {
      const { registerForPushNotificationsAsync } = require('./src/services/pushNotifications');
      registerForPushNotificationsAsync();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && user) {
      connectSocket(user._id);
    }
  }, [isAuthenticated, user?._id]);

  useEffect(() => {
    if (__DEV__) return;

    let isMounted = true;
    
    const checkUpdates = async () => {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable && isMounted) {
          await Updates.fetchUpdateAsync();
          global.isUpdateReadyToApply = true;
          setUpdateAvailable(true);
        }
      } catch (e) {
        // Silently fail on boot if native fetch is currently running
      }
    };

    // Delay the manual check slightly to allow native boot checks to finish
    const timer = setTimeout(() => {
      checkUpdates();
    }, 5000);
    
    // Also check for updates and refresh data when app comes to foreground
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active') {
        if (isMounted) checkUpdates();
        
        // Refresh chats if they were already loaded
        const useChatStore = require('./src/store/useChatStore').default;
        const state = useChatStore.getState();
        if (state.chats.length > 0) {
          state.fetchChats(true);
          if (state.selectedChat?._id) {
            state.fetchMessages(state.selectedChat._id);
          }
        }
      }
    });

    return () => {
      isMounted = false;
      clearTimeout(timer);
      subscription.remove();
    };
  }, []);

  // Handle Notifee Notification Navigation (App Background & Closed states)
  useEffect(() => {
    let unsubscribe;

    // 1. App in Background: Handle Notification Press
    if (notifee) {
      try {
        unsubscribe = notifee.onForegroundEvent(({ type, detail }) => {
          const chatId = detail.notification?.data?.chatId;
          if (type === EventType?.PRESS && chatId) {
            // Clear stored messages — user is reading the chat now
            try {
              const { clearStoredMessages } = require('./src/services/notificationHelper');
              clearStoredMessages(chatId);
              notifee.cancelNotification(chatId);
            } catch (e) {}
            let attempts = 0;
            const navigateWhenReady = setInterval(() => {
              const { navigationRef } = require('./src/navigation/RootNavigator');
              if (navigationRef && navigationRef.isReady()) {
                clearInterval(navigateWhenReady);
                navigationRef.reset({
                  index: 1,
                  routes: [
                    { name: 'Tabs' },
                    { name: 'ChatRoom', params: { chatId } },
                  ],
                });
              } else if (attempts >= 25) { // 5 seconds max wait
                clearInterval(navigateWhenReady);
              }
              attempts++;
            }, 200);
          }
        });
      } catch (e) {
        console.log('Notifee onForegroundEvent failed:', e);
      }

      // 2. App completely Closed: Handle Initial Notification Press
      async function checkInitialNotification() {
        try {
          const initialNotification = await notifee.getInitialNotification();
          const chatId = initialNotification?.notification?.data?.chatId;
          if (chatId) {
            // Clear stored messages — user tapped notification to open app
            try {
              const { clearStoredMessages } = require('./src/services/notificationHelper');
              await clearStoredMessages(chatId);
              await notifee.cancelNotification(chatId);
            } catch (e) {}
            let attempts = 0;
            const navigateWhenReady = setInterval(() => {
              const { navigationRef } = require('./src/navigation/RootNavigator');
              if (navigationRef && navigationRef.isReady()) {
                clearInterval(navigateWhenReady);
                navigationRef.reset({
                  index: 1,
                  routes: [
                    { name: 'Tabs' },
                    { name: 'ChatRoom', params: { chatId } },
                  ],
                });
              } else if (attempts >= 25) { // 5 seconds max wait
                clearInterval(navigateWhenReady);
              }
              attempts++;
            }, 200);
          }
        } catch (e) {
          console.log('Notifee getInitialNotification failed:', e);
        }
      }
      checkInitialNotification();
    }

    // 3. App in Foreground: Handle Incoming Data Messages
    let unsubscribeFCM;
    if (messaging) {
      try {
        unsubscribeFCM = messaging().onMessage(async remoteMessage => {
          const data = remoteMessage.data;
          if (!data) return;

          try {
            const sender = data.sender ? JSON.parse(data.sender) : null;
            const chat = data.chat ? JSON.parse(data.chat) : null;
            const title = data.title || 'New Message';
            const body = data.body || '';
            const chatId = data.chatId;

            // Check if user is actively viewing this chat room
            const useChatStore = require('./src/store/useChatStore').default;
            const { selectedChat } = useChatStore.getState();
            
            if (chatId && sender && selectedChat?._id?.toString() !== chatId?.toString()) {
              const { displayMessagingNotification } = require('./src/services/notificationHelper');
              await displayMessagingNotification({ chatId, sender, chat, title, body, imageUrl: data.imageUrl });
            }
          } catch (e) {
            console.error('Error handling foreground data message:', e);
          }
        });
      } catch (e) {
        console.log('Firebase messaging() failed to initialize natively:', e);
      }
    } // Close if (messaging)

    return () => {
      if (unsubscribe) unsubscribe();
      if (unsubscribeFCM) unsubscribeFCM();
    };
  }, []);

  const RootNavigator = themeLoaded ? require('./src/navigation/RootNavigator').default : null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#04070B' }}>
      <StatusBar barStyle="light-content" backgroundColor="#04070B" />
      <AlertProvider>
        {themeLoaded && RootNavigator && <RootNavigator />}
      </AlertProvider>

      {/* Splash Animation Overlay */}
      {splashVisible && (
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#04070B', alignItems: 'center', justifyContent: 'center', opacity: splashAnim, zIndex: 9999 }]}>
          <Animated.View style={{ transform: [{ scale: scaleAnim }], alignItems: 'center' }}>
            <View style={{ flexDirection: 'row' }}>
              <Text style={{ fontSize: 48, fontWeight: '900', color: Colors.primary || '#06B6D4', letterSpacing: 1 }}>Relay</Text>
            </View>
          </Animated.View>
        </Animated.View>
      )}

      {/* Custom Update Available Modal */}
      <Modal visible={updateAvailable} transparent animationType="fade" statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#111827', width: '100%', borderRadius: 24, padding: 32, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(6,182,212,0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: 'rgba(6,182,212,0.3)' }}>
              <Text style={{ fontSize: 40 }}>🚀</Text>
            </View>
            <Text style={{ color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' }}>Update Available!</Text>
            <Text style={{ color: '#9CA3AF', fontSize: 16, textAlign: 'center', marginBottom: 32, lineHeight: 24 }}>
              A new version of Relay is ready. Restart now to apply the latest improvements and bug fixes!
            </Text>
            
            <View style={{ width: '100%', gap: 12 }}>
              <TouchableOpacity 
                activeOpacity={0.8}
                onPress={() => {
                  setUpdateAvailable(false);
                  // Wait 500ms for the Modal's fade animation to finish completely
                  // before abruptly reloading the JS thread. This prevents the
                  // native view hierarchy from corrupting and causing a black screen.
                  setTimeout(async () => {
                    try {
                      await Updates.reloadAsync();
                    } catch (e) {}
                  }, 1500);
                }}
                style={{ backgroundColor: Colors.primary || '#06B6D4', paddingVertical: 16, borderRadius: 16, alignItems: 'center', shadowColor: Colors.primary || '#06B6D4', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 }}
              >
                <Text style={{ color: '#000', fontSize: 16, fontWeight: 'bold' }}>Restart Now</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                activeOpacity={0.8}
                onPress={() => setUpdateAvailable(false)}
                style={{ paddingVertical: 16, borderRadius: 16, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)' }}
              >
                <Text style={{ color: '#9CA3AF', fontSize: 16, fontWeight: '600' }}>Maybe Later</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </GestureHandlerRootView>
  );
}
