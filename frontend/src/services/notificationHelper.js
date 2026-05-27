import notifee, { AndroidStyle, AndroidImportance } from '@notifee/react-native';

// Ensure the Notifee channel exists
async function ensureChannel() {
  if (!notifee) return;
  try {
    await notifee.createChannel({
      id: 'relay-messages',
      name: 'Relay Messages',
      importance: AndroidImportance.HIGH, // 4 (HIGH) is required to show action buttons!
      sound: 'kin_notification_sound',
      vibration: true,
      vibrationPattern: [0, 250, 250, 250],
    });
  } catch (e) {}
}

export const displayMessagingNotification = async ({ chatId, sender, chat, title, body }) => {
  if (!chatId || !sender || !notifee) return;

  try {
    await ensureChannel();

    // 1. Build the new message
    const newMessage = {
      text: body,
      timestamp: Date.now(),
      person: {
        id: sender._id ? sender._id.toString() : (sender.username || 'user'),
        name: sender.displayName || sender.username || 'Unknown',
      },
    };

    // 2. Natively retrieve existing messages from the currently visible notification
    // This perfectly bypasses AsyncStorage background issues
    let updatedMessages = [newMessage];
    try {
      const activeNotifications = await notifee.getDisplayedNotifications();
      const existingNotif = activeNotifications.find(n => n.id === chatId);
      
      if (existingNotif && existingNotif.notification.android?.style?.messages) {
        const previousMessages = existingNotif.notification.android.style.messages;
        updatedMessages = [...previousMessages, newMessage];
      }
    } catch (e) {
      console.log('Could not fetch active notifications for stacking:', e);
    }

    // 3. Display the notification
    await notifee.displayNotification({
      id: chatId,          // Keeps everything in one WhatsApp-style slot
      title: title,
      body: body,
      android: {
        channelId: 'relay-messages',
        pressAction: { id: 'default' },
        importance: AndroidImportance.HIGH, // Force high priority to show Reply buttons natively
        style: {
          type: AndroidStyle.MESSAGING,
          person: {
            name: 'Me',
            id: 'me',
          },
          messages: updatedMessages,
          title: chat?.isGroupChat ? (chat.chatName || chat.groupName || title) : undefined,
          group: chat?.isGroupChat || false,
        },
        actions: [
          {
            title: '↩ Reply',
            pressAction: { id: 'reply' },
            input: {
              allowFreeFormInput: true,
              placeholder: `Reply to ${sender.displayName || sender.username}...`,
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
    console.error('Failed to display Notifee notification:', e);
  }
};

export async function clearStoredMessages(chatId) {
  // Not needed anymore since we don't use AsyncStorage, 
  // Notifee clears the messages when the notification is dismissed or cancelled.
  try {
    await notifee.cancelNotification(chatId);
  } catch (e) {}
}
