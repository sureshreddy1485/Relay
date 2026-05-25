import 'react-native-gesture-handler';
import React, { useEffect, useState, useRef } from 'react';
import { StatusBar, LogBox, View, Animated, StyleSheet, Image, Text, Alert, AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Notifications from 'expo-notifications';
import * as Updates from 'expo-updates';
// RootNavigator dynamically imported later to allow Colors override
// import RootNavigator from './src/navigation/RootNavigator';
import useAuthStore from './src/store/useAuthStore';
import { connectSocket } from './src/services/socketService';

LogBox.ignoreLogs(['Warning: ...', 'Animated: `useNativeDriver`']);

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

import { AlertProvider } from './src/components/CustomAlert';

import { Colors, AppThemes } from './src/theme/colors';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function App() {
  const { hydrate, user, isAuthenticated } = useAuthStore();
  const [themeLoaded, setThemeLoaded] = useState(false);
  const [splashVisible, setSplashVisible] = useState(true);
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
      import('./src/services/pushNotifications').then(({ registerForPushNotificationsAsync }) => {
        registerForPushNotificationsAsync();
      });
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
          Alert.alert(
            '🚀 Update Available!',
            'A new version of Relay is ready. Restart now to apply the latest improvements!',
            [
              { text: 'Later', style: 'cancel' },
              { text: 'Restart Now', onPress: () => Updates.reloadAsync() }
            ]
          );
        }
      } catch (e) {
        // Silently fail on boot if native fetch is currently running
      }
    };

    // Delay the manual check slightly to allow native boot checks to finish
    const timer = setTimeout(() => {
      checkUpdates();
    }, 5000);
    
    // Also check for updates when app comes to foreground
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active' && isMounted) {
        checkUpdates();
      }
    });

    return () => {
      isMounted = false;
      clearTimeout(timer);
      subscription.remove();
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
    </GestureHandlerRootView>
  );
}
