import notifee, { AndroidStyle, AndroidImportance } from '@notifee/react-native';
import * as FileSystem from 'expo-file-system';

const MAX_STORED = 10;

// Read messages directly from local disk (bulletproof in Headless JS)
async function getFileMessages(chatId) {
  try {
    const fileUri = `${FileSystem.documentDirectory}notif_chat_${chatId}.json`;
    const info = await FileSystem.getInfoAsync(fileUri);
    if (info.exists) {
      const content = await FileSystem.readAsStringAsync(fileUri);
      return JSON.parse(content);
    }
  } catch (e) {
    console.log('File read error:', e);
  }
  return [];
}

// Write messages to local disk
async function saveFileMessages(chatId, messages) {
  try {
    const fileUri = `${FileSystem.documentDirectory}notif_chat_${chatId}.json`;
    const trimmed = messages.slice(-MAX_STORED);
    await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(trimmed));
  } catch (e) {
    console.log('File write error:', e);
  }
}

export async function clearStoredMessages(chatId) {
  try {
    const fileUri = `${FileSystem.documentDirectory}notif_chat_${chatId}.json`;
    await FileSystem.deleteAsync(fileUri, { idempotent: true });
    await notifee.cancelNotification(chatId);
  } catch (e) {}
}

async function ensureChannel() {
  if (!notifee) return;
  try {
    await notifee.createChannel({
      id: 'relay-messages',
      name: 'Relay Messages',
      importance: AndroidImportance.HIGH,
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

    const newMessage = {
      text: body,
      timestamp: Date.now(),
      person: {
        id: sender._id ? sender._id.toString() : (sender.username || 'user'),
        name: sender.displayName || sender.username || 'Unknown',
      },
    };

    // 1. Fetch robustly from filesystem
    const existingMessages = await getFileMessages(chatId);
    const updatedMessages = [...existingMessages, newMessage];
    
    // 2. Save back to filesystem immediately
    await saveFileMessages(chatId, updatedMessages);

    // 3. Display rich MessagingStyle notification
    await notifee.displayNotification({
      id: chatId,
      title: title,
      body: body,
      android: {
        channelId: 'relay-messages',
        pressAction: { id: 'default' },
        importance: AndroidImportance.HIGH, 
        style: {
          type: AndroidStyle.MESSAGING,
          person: { name: 'Me', id: 'me' },
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
