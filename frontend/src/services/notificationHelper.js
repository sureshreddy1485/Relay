// notificationHelper.js — WhatsApp/Telegram-style MessagingStyle notifications
// Uses AsyncStorage to persist message history per chat (so stacking works reliably)
let notifee = null;
let AndroidStyle = null;
try {
  const notifeeModule = require('@notifee/react-native');
  notifee = notifeeModule.default;
  AndroidStyle = notifeeModule.AndroidStyle;
} catch (e) {}

const STORAGE_KEY_PREFIX = 'notif_msgs_';
const MAX_STORED_MESSAGES = 10; // Keep last 10 messages per chat in notification

// Get stored messages for a chat from AsyncStorage
async function getStoredMessages(chatId) {
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const raw = await AsyncStorage.getItem(STORAGE_KEY_PREFIX + chatId);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return [];
}

// Save messages for a chat to AsyncStorage
async function saveStoredMessages(chatId, messages) {
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    // Only keep the last MAX_STORED_MESSAGES
    const trimmed = messages.slice(-MAX_STORED_MESSAGES);
    await AsyncStorage.setItem(STORAGE_KEY_PREFIX + chatId, JSON.stringify(trimmed));
  } catch (e) {}
}

// Clear stored messages for a chat (call this when user reads / dismisses)
export async function clearStoredMessages(chatId) {
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    await AsyncStorage.removeItem(STORAGE_KEY_PREFIX + chatId);
  } catch (e) {}
}

// Ensure the Notifee channel exists — must be called before displayNotification
async function ensureChannel() {
  if (!notifee) return;
  try {
    await notifee.createChannel({
      id: 'relay-messages',
      name: 'Relay Messages',
      importance: 5, // IMPORTANCE_HIGH — triggers heads-up popup + sound + vibration
      sound: 'kin_notification_sound', // filename in android/app/src/main/res/raw/ (no extension)
      vibration: true,
      vibrationPattern: [0, 250, 250, 250],
    });
  } catch (e) {}
}

export const displayMessagingNotification = async ({ chatId, sender, chat, title, body }) => {
  if (!chatId || !sender) return;

  if (!notifee) {
    // Fallback: use expo-notifications if Notifee native module not available
    try {
      const Notifications = require('expo-notifications');
      await Notifications.scheduleNotificationAsync({
        identifier: chatId,
        content: {
          title,
          body,
          sound: true,
          data: { chatId },
        },
        trigger: null,
      });
    } catch (e) {}
    return;
  }

  try {
    // 1. Ensure channel exists (safe to call multiple times — Android deduplicates)
    await ensureChannel();

    // 2. Load existing messages from AsyncStorage (reliable across background/foreground)
    const existingMessages = await getStoredMessages(chatId);

    // 3. Build the new message object
    const newMessage = {
      text: body,
      timestamp: Date.now(),
      person: {
        id: sender._id ? sender._id.toString() : (sender.username || 'user'),
        name: sender.displayName || sender.username || 'Unknown',
      },
    };

    // 4. Append and save
    const updatedMessages = [...existingMessages, newMessage];
    await saveStoredMessages(chatId, updatedMessages);

    // 5. Display MessagingStyle notification — same ID = updates the existing panel entry
    await notifee.displayNotification({
      id: chatId,          // Fixed ID per chat = WhatsApp stacking behaviour
      title: title,
      body: body,
      android: {
        channelId: 'relay-messages',
        pressAction: { id: 'default' },
        // MessagingStyle — shows all stacked messages like WhatsApp
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
        // Show heads-up popup even if another notification from same app is showing
        showChronometer: false,
        ongoing: false,
      },
      data: { chatId },
    });
  } catch (e) {
    console.error('Failed to display Notifee notification:', e);
  }
};
