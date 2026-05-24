import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { StatusBar, LogBox } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Notifications from 'expo-notifications';
import RootNavigator from './src/navigation/RootNavigator';
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

export default function App() {
  const { hydrate, user, isAuthenticated } = useAuthStore();

  useEffect(() => {
    hydrate();
  }, []);

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

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" />
      <RootNavigator />
    </GestureHandlerRootView>
  );
}
