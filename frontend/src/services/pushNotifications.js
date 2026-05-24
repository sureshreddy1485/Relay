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
    Notifications.setNotificationChannelAsync('messages', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#06B6D4',
      sound: true,
      enableVibrate: true,
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
    
    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      
      let tokenOpts = {};
      if (projectId) {
        tokenOpts.projectId = projectId;
      }

      token = await Notifications.getExpoPushTokenAsync(tokenOpts);
      if (token?.data) {
        await api.put('/users/push-token', { pushToken: token.data });
      }
    } catch (e) {
      if (e.message && e.message.includes('EXPERIENCE_NOT_FOUND')) {
        console.log('Push Token skipped: EAS Project ID not configured or invalid.');
      } else {
        console.log('Error getting push token:', e.message || e);
      }
    }
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  return token;
}
