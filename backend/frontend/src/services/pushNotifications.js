import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import api from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#06B6D4',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return;
    }
    
    // In Expo Go, projectId is not strictly required. But if using EAS, it falls back to the app.json value
    const projectId = Constants.expoConfig?.extra?.eas?.projectId || 'your-eas-project-id';
        
    try {
      token = await Notifications.getExpoPushTokenAsync({
        projectId,
      });
      
      if (token && token.data) {
        // Send token to backend
        await api.put('/users/push-token', { pushToken: token.data });
      }
    } catch (e) {
      console.log('Error getting push token', e);
    }
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  return token;
}
