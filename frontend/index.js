import { registerRootComponent } from 'expo';
import messaging from '@react-native-firebase/messaging';
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
messaging().setBackgroundMessageHandler(async remoteMessage => {
  // Extract data payload sent from backend
  const data = remoteMessage.data;
  if (!data) return;

  try {
    const sender = data.sender ? JSON.parse(data.sender) : null;
    const chat = data.chat ? JSON.parse(data.chat) : null;
    const title = data.title || 'New Message';
    const body = data.body || '';
    const chatId = data.chatId;

    if (chatId && sender) {
      // Guarantee channel exists
      await notifee.createChannel({
        id: 'messages-v6',
        name: 'Relay Messages',
        importance: 4, // AndroidImportance.HIGH
        sound: 'kin_notification_sound',
        vibration: true,
      });

      // Fetch existing notifications to see if we already have one for this chat
      const displayed = await notifee.getDisplayedNotifications();
      const existingNotification = displayed.find(n => n.id === chatId);
      
      let existingMessages = [];
      if (existingNotification?.notification?.android?.style?.messages) {
        existingMessages = existingNotification.notification.android.style.messages;
      }

      // Build the new message object
      const newMessage = {
        text: body,
        timestamp: Date.now(),
        person: {
          name: sender.displayName || sender.username,
        },
      };

      // Build the Notifee notification using MessagingStyle
      await notifee.displayNotification({
        id: chatId, 
        title: title,
        body: body,
        android: {
          channelId: 'messages-v6',
          smallIcon: 'ic_launcher',
          color: '#2DD4BF',
          pressAction: {
            id: 'default',
          },
          style: {
            type: AndroidStyle.MESSAGING,
            person: {
              name: 'Me',
            },
            messages: [...existingMessages, newMessage],
            title: chat?.isGroupChat ? chat.chatName : undefined,
          },
          actions: [
            {
              title: 'Reply',
              icon: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png', // Fallback icon
              pressAction: { id: 'reply' },
              input: { allowFreeFormInput: true, placeholder: 'Reply to message...' }
            },
            {
              title: 'Mark as Read',
              pressAction: { id: 'mark_as_read' }
            }
          ]
        },
        data: { chatId }, 
      });
    }
  } catch (e) {
    console.error('Error handling background data message:', e);
    await notifee.displayNotification({
      title: 'Crash Report',
      body: String(e.message || e),
      android: { channelId: 'messages-v5' }
    });
  }
});

registerRootComponent(App);
