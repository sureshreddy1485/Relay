import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import api from './api';
import messaging from '@react-native-firebase/messaging';
import notifee from '@notifee/react-native';
export async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === 'android') {
    // Expo fallback channel (for Expo Push Token users)
    try {
      await Notifications.setNotificationChannelAsync('relay-messages-v5', {
        name: 'Relay Messages',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#06B6D4',
        sound: 'relay_notification_sound.mp3', // Note: User will use .mp3 now
        enableVibrate: true,
      });
    } catch (e) {
      console.log('Failed to set notification channel:', e);
    }
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
    
    let expoPushToken = null;
    let fcmToken = null;

    // 1. Try to get Expo Push Token
    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      let tokenOpts = {};
      if (projectId) {
        tokenOpts.projectId = projectId;
      }
      expoPushToken = await Notifications.getExpoPushTokenAsync(tokenOpts);
    } catch (e) {
      console.log('Error getting expo push token:', e.message || e);
    }

    // 2. Try to get FCM Token
    try {
      if (messaging) {
        fcmToken = await messaging().getToken();
      }
    } catch (fcmErr) {
      console.log('Failed to get FCM token:', fcmErr.message);
    }

    // 3. Save whatever tokens we got
    try {
      if (expoPushToken?.data || fcmToken) {
        await api.put('/users/push-token', { 
          pushToken: expoPushToken?.data, 
          fcmToken: fcmToken 
        });
      }
    } catch (e) {
      console.log('Failed to save push tokens to DB:', e.message);
    }
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  return token;
}
