import { create } from 'zustand';
import api from '../services/api';

const useChatStore = create((set, get) => ({
  chats: [],
  selectedChat: null,
  messages: {},       // { chatId: [messages] }
  typingUsers: {},    // { chatId: [userIds] }
  unreadCounts: {},   // { chatId: count }
  drafts: {},         // { chatId: string }
  isLoadingChats: false,
  isLoadingMessages: false,
  inAppNotification: null,

  showNotification: (payload) => {
    set({ inAppNotification: payload });
    // auto hide after 4s
    setTimeout(() => {
      if (get().inAppNotification?.messageId === payload.messageId) {
        set({ inAppNotification: null });
      }
    }, 4000);
  },
  hideNotification: () => set({ inAppNotification: null }),

  reset: () => set({
    chats: [],
    selectedChat: null,
    messages: {},
    typingUsers: {},
    unreadCounts: {},
    drafts: {},
    isLoadingChats: false,
    isLoadingMessages: false,
    inAppNotification: null,
  }),

  fetchChats: async (silent = false) => {
    // Only show the loading spinner on the very first load (no chats yet)
    if (!silent && get().chats.length === 0) {
      set({ isLoadingChats: true });
    }
    try {
      const { data } = await api.get('/chats');
      const unreadCounts = {};
      (data.chats || []).forEach(chat => {
        if (chat._id) {
          unreadCounts[chat._id.toString()] = chat.unreadCount || 0;
        }
      });
      set({ chats: data.chats, unreadCounts, isLoadingChats: false });
    } catch (e) {
      set({ isLoadingChats: false });
    }
  },

  selectChat: (chat) => set({ selectedChat: chat }),

  fetchMessages: async (chatId, page = 1) => {
    set({ isLoadingMessages: true });
    try {
      const { data } = await api.get(`/messages/${chatId}?page=${page}&limit=50`);
      const existing = get().messages[chatId] || [];
      const all = page === 1 
        ? data.messages 
        : [...existing, ...data.messages.filter(m => !existing.some(e => e._id === m._id))];
      set({
        messages: { ...get().messages, [chatId]: all },
        isLoadingMessages: false,
      });
    } catch (e) {
      set({ isLoadingMessages: false });
    }
  },

  addMessage: (chatId, message) => {
    const current = get().messages[chatId] || [];
    if (current.some(m => m._id === message._id)) return; // Prevent duplicates
    // Update latest message in chat list
    const chats = get().chats.map(c =>
      c._id === chatId ? { ...c, latestMessage: message, updatedAt: message.createdAt } : c
    );
    // Sort by latest
    chats.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    
    set({ 
      messages: { ...get().messages, [chatId]: [message, ...current] },
      chats
    });
  },

  replaceMessage: (chatId, tempId, realMessage) => {
    const current = get().messages[chatId] || [];
    let updated;
    
    // Preserve readBy and deliveredTo from optimistic message (fixes race condition)
    const existingTemp = current.find(m => m._id === tempId);
    if (existingTemp) {
      if (existingTemp.readBy && existingTemp.readBy.length > 0) {
        realMessage.readBy = [...new Set([...(realMessage.readBy || []), ...existingTemp.readBy])];
      }
      if (existingTemp.deliveredTo && existingTemp.deliveredTo.length > 0) {
        realMessage.deliveredTo = [...new Set([...(realMessage.deliveredTo || []), ...existingTemp.deliveredTo])];
      }
    }

    if (current.some(m => m._id === realMessage._id)) {
      updated = current.filter(m => m._id !== tempId).map(m => m._id === realMessage._id ? { ...m, readBy: realMessage.readBy, deliveredTo: realMessage.deliveredTo } : m);
    } else {
      updated = current.map(m => m._id === tempId ? realMessage : m);
    }
    const chats = get().chats.map(c =>
      c._id === chatId ? { ...c, latestMessage: realMessage, updatedAt: realMessage.createdAt } : c
    );
    chats.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    
    set({ 
      messages: { ...get().messages, [chatId]: updated },
      chats 
    });
  },

  removeOptimisticMessage: (chatId, tempId) => {
    const current = get().messages[chatId] || [];
    const updated = current.filter(m => m._id !== tempId);
    set({ messages: { ...get().messages, [chatId]: updated } });
  },

  updateMessage: (chatId, messageId, updates) => {
    const cId = chatId?.toString();
    const mId = messageId?.toString();
    const current = get().messages[cId] || [];
    const updated = current.map(m => m._id?.toString() === mId ? { ...m, ...updates } : m);
    set({ messages: { ...get().messages, [cId]: updated } });
  },

  // Called when a message is explicitly deleted by a user (Delete for Everyone)
  removeMessage: (chatId, messageId, newContent = 'Permanently deleted') => {
    const cId = chatId?.toString();
    const mId = messageId?.toString();
    const current = get().messages[cId] || [];
    const updated = current.map(m =>
      m._id?.toString() === mId
        ? { ...m, deletedForEveryone: true, content: newContent, mediaUrl: '', isSelfDestructing: false, destructAfterSeconds: null, expiresAt: null }
        : m
    );
    set({ messages: { ...get().messages, [cId]: updated } });
  },

  // Called when disappearing media self-destructs after viewing
  disappearMessage: (chatId, messageId) => {
    const cId = chatId?.toString();
    const mId = messageId?.toString();
    const current = get().messages[cId] || [];
    const updated = current.map(m =>
      m._id?.toString() === mId
        ? { ...m, deletedForEveryone: true, content: 'Message disappeared', mediaUrl: null, isSelfDestructing: false, destructAfterSeconds: null, expiresAt: null }
        : m
    );
    set({ messages: { ...get().messages, [cId]: updated } });
  },

  purgeMessage: (chatId, messageId) => {
    const cId = chatId?.toString();
    const mId = messageId?.toString();
    const current = get().messages[cId] || [];
    const updated = current.filter(m => m._id?.toString() !== mId);
    set({ messages: { ...get().messages, [cId]: updated } });
  },

  setTyping: (chatId, userId, isTyping) => {
    const current = get().typingUsers[chatId] || [];
    const updated = isTyping
      ? [...new Set([...current, userId])]
      : current.filter(id => id !== userId);
    set({ typingUsers: { ...get().typingUsers, [chatId]: updated } });
  },

  incrementUnread: (chatId) => {
    if (!chatId) return;
    const idStr = chatId.toString();
    const count = (get().unreadCounts[idStr] || 0) + 1;
    set({ unreadCounts: { ...get().unreadCounts, [idStr]: count } });
  },

  clearUnread: (chatId) => {
    if (!chatId) return;
    const idStr = chatId.toString();
    set({ unreadCounts: { ...get().unreadCounts, [idStr]: 0 } });
  },

  setDraft: (chatId, text) => {
    if (!chatId) return;
    const idStr = chatId.toString();
    const newDrafts = { ...get().drafts };
    if (!text || text.trim() === '') {
      delete newDrafts[idStr];
    } else {
      newDrafts[idStr] = text;
    }
    set({ drafts: newDrafts });
  },

  addChat: (chat) => {
    const exists = get().chats.find(c => c._id === chat._id);
    if (!exists) set({ chats: [chat, ...get().chats] });
  },

  removeChat: (chatId) => {
    set({
      chats: get().chats.filter(c => c._id !== chatId),
      selectedChat: get().selectedChat?._id === chatId ? null : get().selectedChat,
    });
  },

  updateChatLatestMessage: (chatId, message) => {
    const chats = get().chats.map(c =>
      c._id === chatId ? { ...c, latestMessage: message, updatedAt: new Date().toISOString() } : c
    );
    chats.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    set({ chats });
  },

  updateChat: (chatId, updates) => {
    const chats = get().chats.map(c => 
      c._id === chatId ? { ...c, ...updates } : c
    );
    set({ chats });
    
    // Also update selectedChat if it's the currently active one
    const selected = get().selectedChat;
    if (selected && selected._id === chatId) {
      set({ selectedChat: { ...selected, ...updates } });
    }
  },
}));

export default useChatStore;
