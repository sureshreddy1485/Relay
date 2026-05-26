let notifee = null;
let AndroidStyle = null;
try {
  const notifeeModule = require('@notifee/react-native');
  notifee = notifeeModule.default;
  AndroidStyle = notifeeModule.AndroidStyle;
} catch (e) {}

export const displayMessagingNotification = async ({ chatId, sender, chat, title, body }) => {
  if (!chatId || !sender) return;

  if (!notifee) {
    // Fallback to expo-notifications if Notifee isn't natively available (e.g. old APK build)
    try {
      const Notifications = require('expo-notifications');
      await Notifications.scheduleNotificationAsync({
        identifier: chatId, // This ensures messages from the same chat overwrite/group together!
        content: {
          title: title,
          body: body,
          sound: true,
          data: { chatId },
        },
        trigger: null,
      });
    } catch(e) {}
    return;
  }

  try {
    // Channel ID MUST match android.notification.channelId in the FCM backend payload
    await notifee.createChannel({
      id: 'relay-messages',
      name: 'Relay Messages',
      importance: 5, // IMPORTANCE_HIGH = heads-up popups + sound + vibration
      sound: 'kin_notification_sound', // Must match filename in android res/raw/ (no extension)
      vibration: true,
      vibrationPattern: [0, 250, 250, 250],
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
        id: sender._id ? sender._id.toString() : sender.username,
        name: sender.displayName || sender.username,
      },
    };

    await notifee.displayNotification({
      id: chatId, 
      title: title,
      body: body,
      android: {
        channelId: 'relay-messages', // Must match channel created above
        pressAction: { id: 'default' },
        style: {
          type: AndroidStyle.MESSAGING,
          person: { name: 'Me', id: 'me' },
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
