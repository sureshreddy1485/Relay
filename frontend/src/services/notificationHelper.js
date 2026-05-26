let notifee = null;
let AndroidStyle = null;
try {
  const notifeeModule = require('@notifee/react-native');
  notifee = notifeeModule.default;
  AndroidStyle = notifeeModule.AndroidStyle;
} catch (e) {}

export const displayMessagingNotification = async ({ chatId, sender, chat, title, body }) => {
  if (!chatId || !sender || !notifee) return;

  try {
    await notifee.createChannel({
      id: 'messages-v6',
      name: 'Relay Messages',
      importance: 4, // HIGH
      sound: 'kin_notification_sound',
      vibration: true,
    });

    const displayed = await notifee.getDisplayedNotifications();
    const existingNotification = displayed.find(n => n.id === chatId);
    
    let existingMessages = [];
    if (existingNotification?.notification?.android?.style?.messages) {
      existingMessages = existingNotification.notification.android.style.messages;
    }

    const newMessage = {
      text: body,
      timestamp: Date.now(),
      person: {
        name: sender.displayName || sender.username,
      },
    };

    await notifee.displayNotification({
      id: chatId, 
      title: title,
      body: body,
      android: {
        channelId: 'messages-v6',
        pressAction: { id: 'default' },
        style: {
          type: AndroidStyle.MESSAGING,
          person: { name: 'Me' },
          messages: [...existingMessages, newMessage],
          title: chat?.isGroupChat ? chat.chatName : undefined,
        },
        actions: [
          {
            title: 'Reply',
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
  } catch (e) {
    console.error('Failed to display Notifee notification:', e);
  }
};
