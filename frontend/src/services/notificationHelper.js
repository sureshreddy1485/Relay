import notifee, { AndroidStyle, AndroidImportance } from '@notifee/react-native';

// Ensure the Notifee channel exists
async function ensureChannel() {
  try {
    await notifee.createChannel({
      id: 'relay-messages-v4',
      name: 'Relay Messages',
      importance: AndroidImportance.HIGH,
      sound: 'relay_notification_sound',
      vibration: true,
    });
  } catch (e) {
    console.log('Channel creation error:', e);
  }
}

export const displayMessagingNotification = async ({ chatId, sender, chat, title, body: rawBody, imageUrl }) => {
  if (!chatId || !sender) return;
  const body = rawBody ? rawBody.replace(/[*_~`]/g, '') : '';

  try {
    await ensureChannel();

    const senderName = sender.displayName || sender.username || 'Unknown';
    const senderId = sender._id ? sender._id.toString() : 'user';

    // Build message for MessagingStyle
    const message = {
      text: body,
      timestamp: Date.now(),
      person: {
        id: senderId,
        name: senderName,
        ...(sender?.profilePicture ? { icon: sender.profilePicture } : {})
      },
    };

    // Try to stack with existing notification (pure Notifee native call, no Expo modules)
    let messages = [message];
    try {
      const displayed = await notifee.getDisplayedNotifications();
      const existing = displayed.find(n => n.id === chatId);
      if (existing && existing.notification && existing.notification.android &&
          existing.notification.android.style && existing.notification.android.style.messages) {
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
        messages = [...existingMessages, message];
      }
    } catch (e) {
      // Stacking failed, just show single message — that's fine
    }

    const notificationConfig = {
      id: chatId,
      title: title,
      body: body,
      android: {
        channelId: 'relay-messages-v4',
        pressAction: { id: 'default' },
        importance: AndroidImportance.HIGH,
        style: {
          type: AndroidStyle.MESSAGING,
          person: { name: 'Me', id: 'me' },
          messages: messages,
          ...(chat?.isGroupChat ? { title: String(chat?.chatName || chat?.groupName || title || 'Group'), group: true } : {})
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
    console.error('Notifee display failed:', e);
  }
};

export async function clearStoredMessages(chatId) {
  try {
    await notifee.cancelNotification(chatId);
  } catch (e) {}
}
