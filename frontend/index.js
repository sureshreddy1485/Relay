import { registerRootComponent } from 'expo';
let messaging;
try {
  messaging = require('@react-native-firebase/messaging').default;
} catch (e) {}
import notifee, { AndroidStyle } from '@notifee/react-native';

import App from './App';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const getBaseUrl = () => process.env.EXPO_PUBLIC_API_URL || 'https://relay-api-jlpx.onrender.com/api';

notifee.onBackgroundEvent(async ({ type, detail }) => {
  const { notification, pressAction, input } = detail;
  const chatId = notification?.data?.chatId;

  if (type === notifee.EventType.ACTION_PRESS && chatId) {
    try {
      const token = await AsyncStorage.getItem('relay_token');
      if (!token) return;

      if (pressAction.id === 'reply' && input) {
        // Handle inline reply
        await axios.post(`${getBaseUrl()}/messages`, {
          chatId: chatId,
          content: input,
          messageType: 'text',
        }, { headers: { Authorization: `Bearer ${token}` } });
        
        // Update notification thread immediately
        const displayed = await notifee.getDisplayedNotifications();
        const existingNotification = displayed.find(n => n.id === chatId);
        let existingMessages = [];
        if (existingNotification?.notification?.android?.style?.messages) {
          existingMessages = existingNotification.notification.android.style.messages;
        }
        
        await notifee.displayNotification({
          id: chatId,
          title: notification.title,
          android: {
            ...notification.android,
            style: {
              ...notification.android.style,
              messages: [
                ...existingMessages,
                { text: input, timestamp: Date.now(), person: { name: 'Me' } }
              ]
            }
          },
          data: notification.data
        });

      } else if (pressAction.id === 'mark_as_read') {
        // Handle Mark as Read
        await axios.put(`${getBaseUrl()}/messages/${chatId}/read`, {}, { 
          headers: { Authorization: `Bearer ${token}` } 
        });
        await notifee.cancelNotification(notification.id);
      }
    } catch (e) {
      console.error('Background action failed:', e);
    }
  }
});

// Background Data Message Handler
if (messaging) {
  messaging().setBackgroundMessageHandler(async remoteMessage => {
  const data = remoteMessage.data;
  if (!data) return;

  try {
    const sender = data.sender ? JSON.parse(data.sender) : null;
    const chat = data.chat ? JSON.parse(data.chat) : null;
    const title = data.title || 'New Message';
    const body = data.body || '';
    const chatId = data.chatId;

    if (chatId && sender) {
      const { displayMessagingNotification } = require('./src/services/notificationHelper');
      await displayMessagingNotification({ chatId, sender, chat, title, body });
    }
  } catch (e) {
    console.error('Error handling background data message:', e);
  }
  });
}

registerRootComponent(App);
