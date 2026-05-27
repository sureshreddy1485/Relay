import { registerRootComponent } from 'expo';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidStyle, AndroidImportance, EventType } from '@notifee/react-native';

import App from './App';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const getBaseUrl = () => process.env.EXPO_PUBLIC_API_URL || 'https://relay-api-jlpx.onrender.com/api';

// ═══════════════════════════════════════════════════════════════
// INLINE notification display — no external module imports
// This runs in Android headless JS mode when app is killed
// ═══════════════════════════════════════════════════════════════
async function showNotification(chatId, sender, chat, title, body) {
  try {
    // 1. Create channel
    await notifee.createChannel({
      id: 'relay-messages',
      name: 'Relay Messages',
      importance: AndroidImportance.HIGH,
      sound: 'kin_notification_sound',
      vibration: true,
      vibrationPattern: [0, 250, 250, 250],
    });

    const senderName = sender.displayName || sender.username || 'Unknown';
    const senderId = sender._id ? sender._id.toString() : 'user';

    // 2. Build new message
    const newMsg = {
      text: body,
      timestamp: Date.now(),
      person: { id: senderId, name: senderName },
    };

    // 3. Try to stack with existing notification
    let fullBody = body;
    let messageCount = 1;
    
    try {
      const displayed = await notifee.getDisplayedNotifications();
      const existing = displayed.find(n => n.id === chatId);
      
      // If there's an existing notification, grab its body and append the new one
      if (existing?.notification?.body) {
        fullBody = existing.notification.body + '\n' + body;
        
        // Try to count previous lines to update the title
        const previousLines = existing.notification.body.split('\n');
        messageCount = previousLines.length + 1;
      }
    } catch (e) {}

    const displayTitle = messageCount > 1 
      ? `${title} (${messageCount} new messages)`
      : title;

    // 4. Display notification with actions (BIGTEXT is globally supported on all Android skins)
    await notifee.displayNotification({
      id: chatId,
      title: displayTitle,
      body: fullBody,
      android: {
        channelId: 'relay-messages',
        pressAction: { id: 'default' },
        importance: AndroidImportance.HIGH,
        style: {
          type: AndroidStyle.BIGTEXT,
          text: fullBody,
        },
        actions: [
          {
            title: '↩ Reply',
            pressAction: { id: 'reply' },
            input: {
              allowFreeFormInput: true,
              placeholder: `Reply to ${senderName}...`,
            },
          },
          {
            title: '✓ Mark as Read',
            pressAction: { id: 'mark_as_read' },
          },
        ],
      },
      data: { chatId },
    });
  } catch (e) {
    // Last resort: show a basic notification without any fancy styling
    try {
      await notifee.displayNotification({
        id: chatId,
        title: title,
        body: body,
        android: {
          channelId: 'relay-messages',
          pressAction: { id: 'default' },
          importance: AndroidImportance.HIGH,
          actions: [
            {
              title: '↩ Reply',
              pressAction: { id: 'reply' },
              input: { allowFreeFormInput: true, placeholder: 'Reply...' },
            },
            {
              title: '✓ Mark as Read',
              pressAction: { id: 'mark_as_read' },
            },
          ],
        },
        data: { chatId },
      });
    } catch (e2) {}
  }
}

// ═══════════════════════════════════════════════════════════════
// Notifee Background Event Handler (Reply / Mark as Read / Dismiss)
// ═══════════════════════════════════════════════════════════════
notifee.onBackgroundEvent(async ({ type, detail }) => {
  const { notification, pressAction, input } = detail;
  const chatId = notification?.data?.chatId;

  if (type === EventType.DISMISSED && chatId) {
    try { await notifee.cancelNotification(chatId); } catch (e) {}
    return;
  }

  if (type === EventType.ACTION_PRESS && chatId) {
    try {
      const token = await AsyncStorage.getItem('relay_token');
      if (!token) return;

      if (pressAction.id === 'reply' && input) {
        // Build FormData since the backend expects multipart/form-data for messages
        const formData = new FormData();
        formData.append('chatId', chatId);
        formData.append('content', input);
        formData.append('messageType', 'text');

        const response = await fetch(`${getBaseUrl()}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          body: formData,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API Error: ${response.status} - ${errorText.substring(0, 50)}`);
        }

        // Add the reply to the stored message list and update the notification
        await showNotification(chatId,
          { _id: 'me', displayName: 'You', username: 'You' },
          null, notification.title, input);

      } else if (pressAction.id === 'mark_as_read') {
        await fetch(`${getBaseUrl()}/messages/${chatId}/read`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        await notifee.cancelNotification(notification.id || chatId);
      }
    } catch (e) {
      // Show error notification so the user can see what failed in the background
      await notifee.displayNotification({
        id: 'error_debug',
        title: 'Background Reply Failed',
        body: e.message || 'Unknown error',
        android: { channelId: 'relay-messages', pressAction: { id: 'default' } }
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
      await showNotification(chatId, sender, chat, title, body);
    }
  } catch (e) {}
});

registerRootComponent(App);
