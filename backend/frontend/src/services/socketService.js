import { io } from 'socket.io-client';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import useChatStore from '../store/useChatStore';
import useAuthStore from '../store/useAuthStore';
import api from './api';

const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || 'http://10.0.2.2:5000';

let socket = null;

const getSocket = () => socket;

const connectSocket = (userId) => {
  if (socket?.connected) return socket;

  socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],   // WebSocket preferred, polling fallback
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
  });

  socket.on('connect', () => {
    console.log('🔌 Socket connected:', socket.id);
    socket.emit('setup', userId);
  });

  socket.on('disconnect', () => {
    console.log('🔌 Socket disconnected');
  });

  socket.on('connect_error', (err) => {
    console.log('Socket error:', err.message);
  });

  // ── Realtime events ─────────────────────────────────────────────
  socket.on('new_message', (message) => {
    const { selectedChat, addMessage, incrementUnread } = useChatStore.getState();
    const chatId = message.chat?._id || message.chat;

    addMessage(chatId, message);

    // Increment unread and show notification if not in that chat
    if (selectedChat?._id !== chatId) {
      incrementUnread(chatId);
      
      // Show system or in-app notification
      if (!message.isSystemMessage) {
        const title = message.chat?.isGroupChat 
          ? message.chat.chatName 
          : (message.sender?.displayName || message.sender?.username || 'New Message');
        const body = message.content || (message.mediaUrl ? '📷 Media' : 'New message');
          
        if (AppState.currentState === 'active') {
          // Foreground: show custom banner
          useChatStore.getState().showNotification({
            messageId: message._id,
            chatId,
            title,
            body,
            avatar: message.chat?.isGroupChat ? message.chat?.groupPicture : message.sender?.profilePicture,
            chat: message.chat,
          });
        } else {
          // Background/Terminated/Locked: show system notification panel push notification
          Notifications.scheduleNotificationAsync({
            content: {
              title,
              body,
              data: { chatId, chat: message.chat },
              sound: true,
              priority: Notifications.AndroidNotificationPriority.HIGH,
            },
            trigger: null,
          }).catch(err => console.log('Error scheduling local notification:', err));
        }
      }
    } else {
      // If we are currently inside this chat room and the message is from someone else
      const currentUserId = useAuthStore.getState().user?._id;
      const senderId = message.sender?._id || message.sender;
      if (currentUserId && senderId !== currentUserId) {
        api.put(`/messages/${chatId}/read`).catch(() => {});
        markRead(chatId, currentUserId);
      }
    }
  });

  socket.on('typing', ({ chatId, userId }) => {
    useChatStore.getState().setTyping(chatId, userId, true);
  });

  socket.on('stop_typing', ({ chatId, userId }) => {
    useChatStore.getState().setTyping(chatId, userId, false);
  });

  socket.on('messages_read', ({ chatId, userId }) => {
    const messages = useChatStore.getState().messages[chatId] || [];
    messages.forEach(m => {
      if (!m.readBy?.includes(userId)) {
        useChatStore.getState().updateMessage(chatId, m._id, {
          readBy: [...(m.readBy || []), userId],
        });
      }
    });
  });

  socket.on('message_deleted', ({ messageId, chatId }) => {
    useChatStore.getState().removeMessage(chatId, messageId);
  });

  socket.on('reaction_updated', ({ messageId, reactions, chatId }) => {
    useChatStore.getState().updateMessage(chatId, messageId, { reactions });
  });

  socket.on('user_online', ({ userId }) => {
    const user = useAuthStore.getState().user;
    // Could update online status in a users store / per chat participant
  });

  socket.on('user_offline', ({ userId, lastSeen }) => {
    // Same as above
  });

  socket.on('camera_status_changed', ({ userId, isActive }) => {
    // Update in chat participant list if needed
  });

  // Friend Request Realtime Events
  socket.on('friend_request_received', (sender) => {
    const user = useAuthStore.getState().user;
    if (user) {
      const updatedRequests = [...(user.friendRequests || []), sender._id];
      useAuthStore.getState().updateUser({ friendRequests: updatedRequests });
    }
  });

  socket.on('friend_request_accepted', ({ acceptedBy, chat }) => {
    const user = useAuthStore.getState().user;
    if (user) {
      const updatedFriends = [...(user.friends || []), acceptedBy._id];
      const updatedSent = (user.sentRequests || []).filter(id => id.toString() !== acceptedBy._id.toString());
      useAuthStore.getState().updateUser({ friends: updatedFriends, sentRequests: updatedSent });
    }
    if (chat) {
      useChatStore.getState().addChat(chat);
    }
  });

  return socket;
};

const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

const joinChat = (chatId) => socket?.emit('join_chat', chatId);
const leaveChat = (chatId) => socket?.emit('leave_chat', chatId);
const sendTyping = (chatId, userId, username) => socket?.emit('typing', { chatId, userId, username });
const stopTyping = (chatId, userId) => socket?.emit('stop_typing', { chatId, userId });
const markRead = (chatId, userId) => socket?.emit('mark_read', { chatId, userId });
const setCameraActive = (userId, isActive) => socket?.emit('camera_active', { userId, isActive });

export {
  getSocket, connectSocket, disconnectSocket,
  joinChat, leaveChat, sendTyping, stopTyping, markRead, setCameraActive,
};
