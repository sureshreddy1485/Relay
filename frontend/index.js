import { registerRootComponent } from 'expo';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidStyle } from '@notifee/react-native';

import App from './App';

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
          icon: sender.profilePicture || undefined,
        },
      };

      // Build the Notifee notification using MessagingStyle
      await notifee.displayNotification({
        id: chatId, 
        title: title,
        body: body,
        android: {
          channelId: 'messages-v4',
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
        },
        data: { chatId }, 
      });
    }
  } catch (e) {
    console.error('Error handling background data message:', e);
  }
});

registerRootComponent(App);
