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
      // Build the Notifee notification using MessagingStyle
      await notifee.displayNotification({
        id: chatId, // Using chatId as the notification ID groups them visually, but MessagingStyle handles actual grouping
        title: title,
        body: body,
        android: {
          channelId: 'messages-v3',
          pressAction: {
            id: 'default',
          },
          style: {
            type: AndroidStyle.MESSAGING,
            person: {
              name: 'Me',
            },
            messages: [
              {
                text: body,
                timestamp: Date.now(),
                person: {
                  name: sender.displayName || sender.username,
                  icon: sender.profilePicture || undefined,
                },
              },
            ],
            // For group chats, we could set title to the group name, and use conversationTitle
            title: chat?.isGroupChat ? chat.chatName : undefined,
          },
        },
        data: { chatId }, // To handle pressing it
      });
    }
  } catch (e) {
    console.error('Error handling background data message:', e);
  }
});

registerRootComponent(App);
