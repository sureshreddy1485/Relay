import notifee, { AndroidStyle } from '@notifee/react-native';

export const displayMessagingNotification = async ({ chatId, sender, chat, title, body }) => {
  if (!chatId || !sender) return;

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
        smallIcon: 'ic_launcher',
        color: '#2DD4BF',
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
            icon: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
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
