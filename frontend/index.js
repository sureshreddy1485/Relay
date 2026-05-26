import { registerRootComponent } from 'expo';
let messaging;
try {
  messaging = require('@react-native-firebase/messaging').default;
} catch (e) {}
let notifee = null;
let AndroidStyle = null;
let EventType = null;
try {
  const notifeeModule = require('@notifee/react-native');
  notifee = notifeeModule.default;
  AndroidStyle = notifeeModule.AndroidStyle;
  EventType = notifeeModule.EventType;
} catch (e) {
  console.log('Notifee native module not found, skipping background events...');
}

import App from './App';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const getBaseUrl = () => process.env.EXPO_PUBLIC_API_URL || 'https://relay-api-jlpx.onrender.com/api';

if (notifee) {
  try {
    notifee.onBackgroundEvent(async ({ type, detail }) => {
      const { notification, pressAction, input } = detail;
      const chatId = notification?.data?.chatId;

      // DISMISSED — user swiped away the notification, clear stored messages
      if (type === EventType?.DISMISSED && chatId) {
        try {
          const { clearStoredMessages } = require('./src/services/notificationHelper');
          await clearStoredMessages(chatId);
        } catch (e) {}
        return;
      }

      if (type === EventType?.ACTION_PRESS && chatId) {
        try {
          const token = await AsyncStorage.getItem('relay_token');
          if (!token) return;

          if (pressAction.id === 'reply' && input) {
            // Send inline reply to backend
            await axios.post(`${getBaseUrl()}/messages`, {
              chatId: chatId,
              content: input,
              messageType: 'text',
            }, { headers: { Authorization: `Bearer ${token}` } });

            // Add the reply to the stored message list and update the notification
            const { displayMessagingNotification } = require('./src/services/notificationHelper');
            await displayMessagingNotification({
              chatId,
              sender: { _id: 'me', displayName: 'You', username: 'You' },
              chat: null,
              title: notification.title,
              body: input,
            });

          } else if (pressAction.id === 'mark_as_read') {
            // Mark as read on server
            await axios.put(`${getBaseUrl()}/messages/${chatId}/read`, {}, {
              headers: { Authorization: `Bearer ${token}` }
            });
            // Clear stored messages so next message starts fresh
            const { clearStoredMessages } = require('./src/services/notificationHelper');
            await clearStoredMessages(chatId);
            // Cancel the notification
            await notifee.cancelNotification(notification.id || chatId);
          }
        } catch (e) {
          console.error('Background action failed:', e);
        }
      }
    });
  } catch (e) {}
}

// Background Data Message Handler
if (messaging) {
  try {
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
  } catch (e) {
    console.log('Firebase background handler failed to initialize:', e);
  }
}

registerRootComponent(App);
