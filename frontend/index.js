import { registerRootComponent } from 'expo';
import React from 'react';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidStyle, AndroidImportance, EventType } from '@notifee/react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const getBaseUrl = () => process.env.EXPO_PUBLIC_API_URL || 'https://relay-api-jlpx.onrender.com/api';

// ═══════════════════════════════════════════════════════════════
// INLINE notification display — no external module imports
// This runs in Android headless JS mode when app is killed
// ═══════════════════════════════════════════════════════════════
async function showNotification(chatId, sender, chat, title, rawBody, imageUrl) {
  try {
    const body = rawBody ? rawBody.replace(/[*_~`]/g, '') : '';
    // 1. Create channel (Use new ID to force Android to apply new sound settings)
    await notifee.createChannel({
      id: 'relay-messages-v5',
      name: 'Relay Messages',
      importance: AndroidImportance.HIGH,
      sound: 'relay_notification_sound', // Android looks up relay_notification_sound.mp3 or .wav
      vibration: true,
    });

    const senderName = sender?.displayName || sender?.username || 'Unknown';
    const senderId = sender?._id ? sender._id.toString() : 'user';

    // 2. Manage message stacking natively via Notifee
    const message = {
      text: body || '',
      timestamp: Date.now(),
      person: {
        id: senderId,
        name: senderName,
        ...(sender?.profilePicture ? { icon: sender.profilePicture } : {})
      },
    };

    let styleMessages = [message];

    try {
      // Fetch currently displayed notifications to see if this chat already has one active
      const displayed = await notifee.getDisplayedNotifications();
      const existing = displayed.find(n => n.id === chatId || n.notification?.id === chatId);
      
      if (existing && existing.notification?.android?.style?.messages) {
        // Sanitize existing messages in case previous bugs corrupted the stored array
        const existingMessages = existing.notification.android.style.messages
          .filter(m => m && m.text !== undefined && m.timestamp)
          .map(m => ({
            text: String(m.text || ''),
            timestamp: Number(m.timestamp) || Date.now(),
            person: {
              name: String(m.person?.name || 'Unknown'),
              id: String(m.person?.id || 'user'),
              ...(m.person?.icon ? { icon: m.person.icon } : {})
            }
          }));
        styleMessages = [...existingMessages, message];
      }
    } catch (e) {
      console.log("Failed to fetch displayed notifications for stacking", e);
    }

    // Keep only the last 15 messages so it doesn't crash the system bundle size
    if (styleMessages.length > 15) {
      styleMessages = styleMessages.slice(styleMessages.length - 15);
    }

    const isGroup = chat?.isGroupChat || false;

    // 3. Display notification with actions using MESSAGING style (like WhatsApp)
    const notificationConfig = {
      id: chatId,
      title: title,
      body: body,
      android: {
        channelId: 'relay-messages-v5',
        pressAction: { id: 'default' },
        importance: AndroidImportance.HIGH,
        style: {
          type: AndroidStyle.MESSAGING,
          person: { name: 'Me', id: 'me' },
          messages: styleMessages,
          ...(isGroup ? { title: String(chat?.chatName || chat?.groupName || title || 'Group'), group: true } : {})
        },
        actions: [
          {
            title: '✓ Mark as Read',
            pressAction: { id: 'mark_as_read' },
          },
        ],
      },
      data: { chatId },
    };

    if (imageUrl) {
      notificationConfig.android.largeIcon = imageUrl;
    }

    await notifee.displayNotification(notificationConfig);
  } catch (e) {
    console.log("Failed to display notification", e);
    try {
      await notifee.displayNotification({
        id: chatId + '_error',
        title: 'Notification Error',
        body: e.message || 'Unknown error occurred',
        android: {
          channelId: 'relay-messages-v5',
          importance: AndroidImportance.HIGH,
        },
      });
    } catch (fallbackErr) {
      console.log("Fallback failed", fallbackErr);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Notifee Background Event Handler (Reply / Mark as Read / Dismiss)
// ═══════════════════════════════════════════════════════════════
notifee.onBackgroundEvent(async ({ type, detail }) => {
  const { notification, pressAction, input } = detail;
  const chatId = notification?.data?.chatId;

  if (type === EventType.DISMISSED && chatId) {
    try { 
      await notifee.cancelNotification(chatId); 
    } catch (e) {}
    return;
  }

  if (type === EventType.ACTION_PRESS && chatId) {
    try {
      const token = await AsyncStorage.getItem('relay_token');
      if (!token) return;

      if (pressAction.id === 'reply' && input) {
        const textContent = typeof input === 'string' ? input : (input.text || input.input || JSON.stringify(input));
        // Use axios instead of fetch for bulletproof headless requests
        await axios.post(`${getBaseUrl()}/messages`, {
          chatId: chatId,
          content: textContent,
          messageType: 'text'
        }, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        // Add the reply to the stored message list and update the notification
        await showNotification(chatId,
          { displayName: 'You' }, // dummy sender
          null, notification.title || 'Chat', textContent, null);

      } else if (pressAction.id === 'mark_as_read') {
        await axios.put(`${getBaseUrl()}/messages/${chatId}/read`, {}, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        await notifee.cancelNotification(notification.id || chatId);
      }
    } catch (e) {
      const errorMsg = e.response?.data?.message || e.message || 'Unknown network error';
      // Clear the spinner immediately by updating the notification with an error message
      await notifee.displayNotification({
        id: chatId,
        title: '⚠️ Reply Failed',
        body: errorMsg,
        android: { channelId: 'relay-messages-v5', pressAction: { id: 'default' } },
        data: { chatId }
      });
    }
  }
});

// ═══════════════════════════════════════════════════════════════
// Firebase Background Data Message Handler
// This is what runs when a message arrives and app is CLOSED
// ═══════════════════════════════════════════════════════════════
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
      await showNotification(chatId, sender, chat, title, body, data.imageUrl);
    }
  } catch (e) {}
});

function Main() {
  const App = require('./App').default;
  return <App />;
}

registerRootComponent(Main);
