import { io } from 'socket.io-client';
import { AppState, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';

import useChatStore from '../store/useChatStore';
import useAuthStore from '../store/useAuthStore';
import api from './api';

const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || 'http://10.0.2.2:5000';

let socket = null;

const getSocket = () => socket;

export const playMessageSound = async () => {
  try {
    const { Audio } = require('expo-av');
    const { sound } = await Audio.Sound.createAsync(
      require('../../assets/sent-recieve-notification.wav')
    );
    await sound.playAsync();
  } catch (error) {
    console.log('Error playing sound', error);
  }
};

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
    
    // Automatically fetch latest data in case internet was dropped and reconnected
    const state = useChatStore.getState();
    if (state.chats.length > 0) {
      state.fetchChats(true);
      if (state.selectedChat?._id) {
        state.fetchMessages(state.selectedChat._id);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('🔌 Socket disconnected');
  });

  socket.on('connect_error', (err) => {
    console.log('Socket error:', err.message);
  });

  // ── Realtime events ─────────────────────────────────────────────
  socket.on('new_message', async (message) => {
    const storeState = useChatStore.getState();
    const { selectedChat, addMessage, incrementUnread, messages } = storeState;
    const chatId = message.chat?._id || message.chat;

    // Prevent duplicating the user's own message while they wait for the HTTP response
    const currentUserId = useAuthStore.getState().user?._id;
    const senderId = message.sender?._id || message.sender;
    
    if (senderId === currentUserId) {
      const chatMsgs = messages[chatId] || [];
      const hasOptimisticMatch = chatMsgs.some(m => 
        m.isOptimistic && 
        m.content === message.content && 
        !m.mediaUrl === !message.mediaUrl
      );
      if (hasOptimisticMatch) {
        return; // Skip socket message; wait for HTTP replaceMessage
      }
    }

    addMessage(chatId, message);

    // Increment unread and show notification if not in that chat, OR if app is in background
    if (selectedChat?._id !== chatId || AppState.currentState !== 'active') {
      incrementUnread(chatId);
      
      if (AppState.currentState === 'active' && senderId !== currentUserId) {
        // FCM via Notifee handles the actual local notification.
        // But we still want to play the in-app sound!
        playMessageSound();
      }

      // Emit delivered status if app is active but not in chat
      if (AppState.currentState === 'active') {
        const currentUserId = useAuthStore.getState().user?._id;
        const senderId = message.sender?._id || message.sender;
        if (currentUserId && senderId !== currentUserId) {
          api.put(`/messages/${chatId}/deliver`).catch(() => {});
          markDelivered(chatId, currentUserId);
        }
      }
    } else {
      // If we are currently inside this chat room (active) and the message is from someone else
      const currentUserId = useAuthStore.getState().user?._id;
      const senderId = message.sender?._id || message.sender;
      if (currentUserId && senderId !== currentUserId) {
        api.put(`/messages/${chatId}/read`).catch(() => {});
        markRead(chatId, currentUserId);
        playMessageSound();
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

  socket.on('messages_delivered', ({ chatId, userId }) => {
    const messages = useChatStore.getState().messages[chatId] || [];
    messages.forEach(m => {
      if (!m.deliveredTo?.includes(userId)) {
        useChatStore.getState().updateMessage(chatId, m._id, {
          deliveredTo: [...(m.deliveredTo || []), userId],
        });
      }
    });
  });

  socket.on('message_deleted', ({ messageId, chatId, forEveryone, newContent }) => {
    if (forEveryone) {
      useChatStore.getState().removeMessage(chatId, messageId, newContent || 'Permanently deleted'); 
    } else {
      useChatStore.getState().purgeMessage(chatId, messageId);  // "Delete for me" — just remove
    }
  });

  // Self-destructed disappearing media — shows "Message disappeared"
  socket.on('message_disappeared', ({ messageId, chatId }) => {
    useChatStore.getState().disappearMessage(chatId, messageId);
  });

  // Real-time message edit sync
  socket.on('message_edited', ({ messageId, chatId, content }) => {
    useChatStore.getState().updateMessage(chatId, messageId, { content, isEdited: true });
  });

  socket.on('reaction_updated', ({ messageId, reactions, chatId }) => {
    useChatStore.getState().updateMessage(chatId, messageId, { reactions });
  });

  socket.on('poll_voted', ({ messageId, pollData, chatId }) => {
    useChatStore.getState().updateMessage(chatId, messageId, { pollData });
  });

  socket.on('user_online', ({ userId }) => {
    const user = useAuthStore.getState().user;
    // Could update online status in a users store / per chat participant
  });

  socket.on('chat_updated', (updatedChat) => {
    useChatStore.getState().updateChat(updatedChat._id, updatedChat);
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

  // Story expired — emitted by server cleanup job; individual screens handle UI update
  socket.on('story_expired', ({ storyId }) => {
    console.log('[Socket] story_expired:', storyId);
  });

  // Group invite accepted — mark that invite message as used so UI shows "Link Expired"
  socket.on('invite_accepted', ({ messageId, chatId }) => {
    useChatStore.getState().updateMessage(chatId?.toString(), messageId, { inviteAccepted: true });
  });

  socket.on('security_alert', (data) => {
    Alert.alert(data.title, data.message);
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
const markDelivered = (chatId, userId) => socket?.emit('mark_delivered', { chatId, userId });
const setCameraActive = (userId, isActive) => socket?.emit('camera_active', { userId, isActive });

export {
  getSocket, connectSocket, disconnectSocket,
  joinChat, leaveChat, sendTyping, stopTyping, markRead, markDelivered, setCameraActive,
};
