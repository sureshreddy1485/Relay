import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Image, StatusBar, Alert,
  ActivityIndicator, Pressable, Animated, ScrollView, Modal, LayoutAnimation, Keyboard, BackHandler,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { Audio } from 'expo-av';
import { VideoView, useVideoPlayer } from 'expo-video';
import { EmojiKeyboard } from 'rn-emoji-keyboard';

import useChatStore from '../../store/useChatStore';
import useAuthStore from '../../store/useAuthStore';
import { Colors } from '../../theme/colors';
import api, { uploadApi } from '../../services/api';
import { joinChat, leaveChat, sendTyping, stopTyping, markRead, playMessageSound } from '../../services/socketService';
import MessageBubble from '../../components/MessageBubble';
import UserInfoSheet from '../../components/UserInfoSheet';
import { CHAT_THEMES, GROUP_THEMES } from '../../components/ThemeSelectSheet';
import { getSocket } from '../../services/socketService';
import DisappearingMsgSheet from '../../components/DisappearingMsgSheet';
import CreatePollSheet from '../../components/CreatePollSheet';
import * as ScreenCapture from 'expo-screen-capture';
import { useAlert } from '../../components/CustomAlert';

const FullScreenVideo = ({ url }) => {
  const player = useVideoPlayer(url, p => {
    p.loop = true;
    p.play();
  });
  return <VideoView style={styles.fullScreenVideo} player={player} contentFit="contain" nativeControls allowsFullscreen />;
};

// Pulsing camera dot component
function CamDot() {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.4, duration: 600, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 1,   duration: 600, useNativeDriver: false }),
      ])
    ).start();
    return () => pulse.stopAnimation();
  }, []);
  return (
    <Animated.View style={[styles.camDot, { transform: [{ scale: pulse }] }]}>
      <Ionicons name="videocam" size={8} color="#FFF" />
    </Animated.View>
  );
}

// Bouncing dots typing indicator bubble
function TypingBubble({ username }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(anim, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      })
    ).start();
  }, [anim]);

  const dot1 = anim.interpolate({ inputRange: [0, 0.2, 0.4, 1], outputRange: [0, -5, 0, 0] });
  const dot2 = anim.interpolate({ inputRange: [0.2, 0.4, 0.6, 1], outputRange: [0, -5, 0, 0] });
  const dot3 = anim.interpolate({ inputRange: [0.4, 0.6, 0.8, 1], outputRange: [0, -5, 0, 0] });

  return (
    <View style={styles.typingContainer}>
      {username && <Text style={styles.typingName}>{username} is typing...</Text>}
      <View style={styles.typingBubble}>
        <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot1 }] }]} />
        <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot2 }] }]} />
        <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot3 }] }]} />
      </View>
    </View>
  );
}

const formatChatDateSeparator = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  
  const diffTime = today - targetDate;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7 && diffDays > 1) {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  }
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function ChatRoomScreen({ route, navigation }) {
  const { showAlert } = useAlert();
  const passedChatId = route.params.chatId || route.params.chat?._id;
  const storeChat = useChatStore(s => s.chats.find(c => c._id === passedChatId));
  const chat = storeChat || route.params.chat || { _id: passedChatId, users: [] };
  const { user } = useAuthStore();
  const chats = useChatStore(s => s.chats);
  const messages = useChatStore(s => s.messages);
  const typingUsers = useChatStore(s => s.typingUsers);
  const fetchMessages = useChatStore(s => s.fetchMessages);
  const addMessage = useChatStore(s => s.addMessage);
  const clearUnread = useChatStore(s => s.clearUnread);
  const insets = useSafeAreaInsets();

  const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS === 'android') {
      const showSub = Keyboard.addListener('keyboardDidShow', (e) => setKbHeight(e.endCoordinates.height));
      const hideSub = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0));
      return () => { showSub.remove(); hideSub.remove(); };
    }
  }, []);

  const [text, setText]               = useState('');
  const [replyTo, setReplyTo]         = useState(null);
  const [isSending, setIsSending]     = useState(false);
  const [showAttach, setShowAttach]   = useState(false);
  const [page, setPage]               = useState(1);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showSearch, setShowSearch]   = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDisappear, setShowDisappear] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState(new Set());
  const [forwardMessage, setForwardMessage] = useState(null);
  const [forwardSelectedChats, setForwardSelectedChats] = useState(new Set());
  const flatRef      = useRef(null);
  const typingTimeout = useRef(null);
  const lastTypingEmit = useRef(0);
  const isSendingRef = useRef(false);

  useEffect(() => {
    const backAction = () => {
      if (showEmoji) {
        setShowEmoji(false);
        setTimeout(() => inputRef.current?.focus(), 100);
        return true;
      }
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [showEmoji]);

  const toggleSelectMessage = (id) => {
    setSelectedMessages(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (next.size === 0) setSelectionMode(false);
      else setSelectionMode(true);
      return next;
    });
  };

  const deleteSelectedMessages = () => {
    showAlert('Delete Messages', `Delete ${selectedMessages.size} messages?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete for me', onPress: () => confirmDeleteSelected('me'), style: 'destructive' },
      { text: 'Delete for everyone', onPress: () => confirmDeleteSelected('everyone'), style: 'destructive' }
    ]);
  };

  const confirmDeleteSelected = async (type) => {
    try {
      const ids = Array.from(selectedMessages);
      await Promise.all(ids.map(id => api.delete(`/messages/${id}?type=${type}`)));
      ids.forEach(id => {
        if (type === 'everyone') {
          useChatStore.getState().updateMessage(chat._id, id, {
            deletedForEveryone: true,
            content: 'Message disappeared',
            mediaUrl: null,
            reactions: []
          });
        } else {
          useChatStore.getState().removeMessage(chat._id, id);
        }
      });
      setSelectionMode(false);
      setSelectedMessages(new Set());
    } catch (e) {
      showAlert('Error', e.message || 'Failed to delete');
    }
  };

  const toggleForwardChat = (chatId) => {
    setForwardSelectedChats(prev => {
      const next = new Set(prev);
      if (next.has(chatId)) next.delete(chatId);
      else {
        if (next.size >= 5) {
          showAlert('Limit Reached', 'You can only forward to up to 5 chats at once.');
          return prev;
        }
        next.add(chatId);
      }
      return next;
    });
  };

  const handleForward = async () => {
    if (forwardSelectedChats.size === 0) return;
    try {
      await api.post(`/messages/${forwardMessage._id}/forward`, { chatIds: Array.from(forwardSelectedChats) });
      setForwardMessage(null);
      setForwardSelectedChats(new Set());
      showAlert('Success', `Message forwarded to ${forwardSelectedChats.size} chat(s)!`);
    } catch (e) {
      showAlert('Error', e.message || 'Failed to forward');
    }
  };
  const searchRef    = useRef(null);
  const inputRef     = useRef(null);
  const isRelayBotChat = !chat.isGroupChat && chat.users?.some(u => u.username === 'relay_bot' || u.username === 'relay');
  const isMicaChat = !chat.isGroupChat && chat.users?.some(u => u.username === 'mica');
  const isBotChat = isRelayBotChat || isMicaChat;
  const [showJumpUnread, setShowJumpUnread] = useState(false);
  const unreadIndexRef = useRef(-1);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [fullScreenMedia, setFullScreenMedia] = useState(null);
  const [isSavingMedia, setIsSavingMedia] = useState(false);
  const [mediaCountdownSeconds, setMediaCountdownSeconds] = useState(null);
  const [showMediaTimerModal, setShowMediaTimerModal] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [showGifModal, setShowGifModal] = useState(false);
  const [gifQuery, setGifQuery] = useState('');
  const [gifResults, setGifResults] = useState([]);
  const [isFetchingGifs, setIsFetchingGifs] = useState(false);
  const [gifError, setGifError] = useState('');
  const [editingMessage, setEditingMessage] = useState(null);
  const [pendingDisappearingMedia, setPendingDisappearingMedia] = useState(null);

  useEffect(() => {
    if (fullScreenMedia && fullScreenMedia.isSelfDestructing && !fullScreenMedia.isMine) {
      if (fullScreenMedia.type === 'video') {
        setMediaCountdownSeconds(null); // No timer for view-once videos
      } else {
        setMediaCountdownSeconds(fullScreenMedia.destructAfterSeconds);
      }
    } else {
      setMediaCountdownSeconds(null);
    }
  }, [fullScreenMedia]);

  const isCapturePrevented = useRef(false);

  useEffect(() => {
    let shouldDisable = false;
    if (chat.disappearAfter > 0) shouldDisable = true;
    if (chat.allowScreenshots === false) shouldDisable = true;
    if (isBotChat) shouldDisable = true;
    
    // Block if full screen media is open and it's self-destructing
    if (fullScreenMedia?.isSelfDestructing) {
      shouldDisable = true;
    }
    
    // Only block screenshot if there are ACTIVE disappearing messages sent by OTHERS
    if (!shouldDisable && chatMessages?.some(m => {
      if (m.deletedForEveryone) return false;
      const isDisappearing = Boolean(m.isSelfDestructing);
      const senderId = (m.sender?._id || m.sender)?.toString();
      const currentUserId = user?._id?.toString();
      return isDisappearing && senderId !== currentUserId;
    })) {
      shouldDisable = true;
    }
    
    if (shouldDisable && !isCapturePrevented.current) {
      ScreenCapture.preventScreenCaptureAsync().catch(() => {});
      isCapturePrevented.current = true;
    } else if (!shouldDisable && isCapturePrevented.current) {
      ScreenCapture.allowScreenCaptureAsync().catch(() => {});
      isCapturePrevented.current = false;
    }
    
    return () => {
      if (isCapturePrevented.current) {
        ScreenCapture.allowScreenCaptureAsync().catch(() => {});
        isCapturePrevented.current = false;
      }
    };
  }, [chat.disappearAfter, chatMessages, user?._id, fullScreenMedia]);

  useEffect(() => {
    if (mediaCountdownSeconds === null || !fullScreenMedia) return;

    if (mediaCountdownSeconds <= 0) {
      setFullScreenMedia(null);
      if (fullScreenMedia.messageId) {
        api.post(`/messages/${fullScreenMedia.messageId}/destruct`)
          .then(() => {
              useChatStore.getState().disappearMessage(chat._id, fullScreenMedia.messageId);
            })
          .catch((err) => console.log('Error self-destructing media:', err));
      }
      return;
    }

    const interval = setTimeout(() => {
      setMediaCountdownSeconds(prev => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearTimeout(interval);
  }, [mediaCountdownSeconds, fullScreenMedia]);

  const handleSaveMedia = async (url) => {
    if (!url) return;
    setIsSavingMedia(true);
    try {
      const filename = url.split('/').pop() || 'download';
      const localUri = `${FileSystem.documentDirectory}${filename}`;
      const { uri } = await FileSystem.downloadAsync(url, localUri);
      
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status === 'granted') {
        await MediaLibrary.saveToLibraryAsync(uri);
        showAlert('Saved', 'Media saved to your device gallery!');
      } else {
        showAlert('Permission Denied', 'Need gallery permissions to save media.');
      }
    } catch (e) {
      showAlert('Error', 'Failed to save media: ' + e.message);
    } finally {
      setIsSavingMedia(false);
    }
  };

  const handleCloseMediaViewer = () => {
    const isDisappearing = fullScreenMedia?.isSelfDestructing && !fullScreenMedia?.isMine;
    const msgId = fullScreenMedia?.messageId;
    setFullScreenMedia(null);
    setMediaCountdownSeconds(null);
    if (isDisappearing && msgId) {
      api.post(`/messages/${msgId}/destruct`)
        .then(() => useChatStore.getState().disappearMessage(chat._id, msgId))
        .catch((err) => console.log('Error self-destructing media:', err));
    }
  };

  const chatMessages = messages[chat._id] || [];
  const activeTypingUserIds = (typingUsers[chat._id] || []).filter(id => id !== user?._id);
  const isTyping     = activeTypingUserIds.length > 0;
  const resolveTypingUsername = (userId) => {
    const foundUser = chat.users?.find(u => u._id === userId || u._id?.toString() === userId?.toString());
    return foundUser ? (foundUser.displayName || foundUser.username) : 'Someone';
  };

  const otherUser     = chat.isGroupChat ? null : chat.users?.find(u => u._id !== user?._id);
  const headerName    = chat.isGroupChat ? chat.chatName : (otherUser?.displayName || otherUser?.username);
  const headerAvatar  = chat.isGroupChat ? chat.groupPicture : otherUser?.profilePicture;
  const isOnline      = !chat.isGroupChat && (otherUser?.isOnline || otherUser?.username === 'mica_bot' || otherUser?.username === 'relay_bot');
  const isCameraActive = !chat.isGroupChat && otherUser?.isCameraActive;

  // Filtered messages for search
  const displayMessages = searchQuery.trim()
    ? chatMessages.filter(m =>
        m.content?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : chatMessages;

  useEffect(() => {
    joinChat(chat._id);
    fetchMessages(chat._id);
    clearUnread(chat._id);
    markRead(chat._id, user?._id);

    // ── Real-time group refresh: update member count & user list live ──
    const socket = getSocket();
    const handleChatUpdated = (updatedChat) => {
      if (updatedChat._id === chat._id || updatedChat._id?.toString() === chat._id?.toString()) {
        useChatStore.getState().updateChat(chat._id, updatedChat);
      }
    };
    if (socket) socket.on('chat_updated', handleChatUpdated);

    return () => {
      leaveChat(chat._id);
      useChatStore.getState().selectChat(null);
      if (socket) socket.off('chat_updated', handleChatUpdated);
    };
  }, [chat._id]);

  // On first load, find the first unread message index
  useEffect(() => {
    if (chatMessages.length > 0 && !searchQuery) {
      // Find the first message not sent by me and not read by me
      // Inverted list: index 0 is newest. Let's find the oldest unread (highest index)
      let oldestUnreadIdx = -1;
      for (let i = 0; i < chatMessages.length; i++) {
        const m = chatMessages[i];
        const senderId = m.sender?._id || m.sender;
        if (senderId !== user?._id && !m.readBy?.includes(user?._id)) {
          oldestUnreadIdx = i;
        } else if (oldestUnreadIdx !== -1) {
          // If we found unread ones, and now hit a read one, we stop
          break;
        }
      }

      if (oldestUnreadIdx > 3) {
        unreadIndexRef.current = oldestUnreadIdx;
        setShowJumpUnread(true);
      }

      // Auto-mark as read based on the newest message
      const newestMsg = chatMessages[0];
      const senderId = newestMsg?.sender?._id || newestMsg?.sender;
      if (senderId && senderId !== user?._id && !newestMsg?.readBy?.includes(user?._id)) {
        api.put(`/messages/${chat._id}/read`).catch(() => {});
        markRead(chat._id, user?._id);
        clearUnread(chat._id);
      }
    }
  }, [chatMessages.length]);

  // Auto-focus search when opened
  useEffect(() => {
    if (showSearch) setTimeout(() => searchRef.current?.focus(), 100);
    else setSearchQuery('');
  }, [showSearch]);

  // Load draft on mount
  useEffect(() => {
    const draftText = useChatStore.getState().drafts[chat._id?.toString()];
    if (draftText) {
      setText(draftText);
    }
  }, []);

  const handleTyping = (val) => {
    setText(val);
    useChatStore.getState().setDraft(chat._id, val);
    
    const now = Date.now();
    if (now - lastTypingEmit.current > 1000) {
      sendTyping(chat._id, user?._id, user?.username);
      lastTypingEmit.current = now;
    }
    
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => stopTyping(chat._id, user?._id), 1500);
  };

  const handleEdit = (msg) => {
    // Allow text messages and messages with no explicit messageType (legacy)
    if (msg.mediaUrl || msg.deletedForEveryone || (msg.messageType && msg.messageType !== 'text')) {
      showAlert('Cannot Edit', 'Only text messages can be edited.');
      return;
    }
    const diff = (Date.now() - new Date(msg.createdAt).getTime()) / 60000;
    if (diff > 15) {
      showAlert('Cannot Edit', 'Messages can only be edited within 15 minutes of sending.');
      return;
    }
    setEditingMessage(msg);
    setText(msg.content || '');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const sendMessage = async (mediaFile = null, pollData = null) => {
    if (isSendingRef.current) return;
    const content = text.trim();
    if (!content && !mediaFile && !pollData) return;
    
    isSendingRef.current = true;
    setIsSending(true);
    setText('');
    useChatStore.getState().setDraft(chat._id, '');
    stopTyping(chat._id, user?._id);

    if (editingMessage) {
      const editId = editingMessage._id;
      setEditingMessage(null);
      try {
        const { data } = await api.patch(`/messages/${editId}/edit`, { content });
        useChatStore.getState().updateMessage(chat._id, editId, { ...data.message, isEdited: true });
        setTimeout(() => inputRef.current?.focus(), 50);
        setHighlightedMessageId(editId);
        setTimeout(() => setHighlightedMessageId(null), 1500);
      } catch (e) {
        showAlert('Error', e.message || 'Failed to edit message');
      } finally {
        setIsSending(false);
      }
      return;
    }

    const tempId = `optimistic-${Date.now()}`;
    const optimisticMessage = {
      _id: tempId,
      content: content || '',
      sender: {
        _id: user._id,
        username: user.username,
        displayName: user.displayName,
        profilePicture: user.profilePicture,
      },
      chat: chat._id,
      createdAt: new Date().toISOString(),
      isOptimistic: true,
      mediaUrl: mediaFile ? mediaFile.uri : null,
      mediaType: mediaFile ? mediaFile.type : null,
      messageType: pollData ? 'poll' : (mediaFile?.messageType || (mediaFile ? (mediaFile.type.startsWith('video/') ? 'video' : mediaFile.type.startsWith('audio/') ? 'audio' : 'image') : 'text')),
      pollData: pollData || null,
      isSelfDestructing: mediaFile ? !!mediaFile.isSelfDestructing : false,
      destructAfterSeconds: mediaFile ? mediaFile.destructAfterSeconds : null,
      isLive: mediaFile ? !!mediaFile.isLive : false,
      replyTo: replyTo ? {
        _id: replyTo._id,
        content: replyTo.content,
        mediaUrl: replyTo.mediaUrl,
        mediaType: replyTo.mediaType,
        sender: replyTo.sender,
      } : null,
    };

    useChatStore.getState().addMessage(chat._id, optimisticMessage);
    playMessageSound();
    const savedReplyTo = replyTo;
    setReplyTo(null);
    // Scroll to bottom so the new message is visible
    setTimeout(() => flatRef.current?.scrollToOffset({ offset: 0, animated: true }), 50);

    try {
      const formData = new FormData();
      if (content) formData.append('content', content);
      formData.append('chatId', chat._id);
      if (pollData) {
        formData.append('messageType', 'poll');
        formData.append('pollData', JSON.stringify(pollData));
      }
      if (savedReplyTo) formData.append('replyTo', savedReplyTo._id);
      if (mediaFile) {
        formData.append('media', { 
          uri: mediaFile.uri, 
          name: mediaFile.name || 'media.jpg', 
          type: mediaFile.type || 'image/jpeg' 
        });
        if (mediaFile.messageType) formData.append('messageType', mediaFile.messageType);
        if (mediaFile.isSelfDestructing) {
          formData.append('isSelfDestructing', 'true');
          formData.append('destructAfterSeconds', String(mediaFile.destructAfterSeconds));
        }
        if (mediaFile.isLive) {
          formData.append('isLive', 'true');
        }
      }
      const { data } = await uploadApi.post('/messages', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      useChatStore.getState().replaceMessage(chat._id, tempId, data.message);
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch (e) {
      useChatStore.getState().removeOptimisticMessage(chat._id, tempId);
      showAlert('Error', e.message || 'Failed to send');
    } finally {
      isSendingRef.current = false;
      setIsSending(false);
    }
  };

  const pickImage = async () => {
    setShowAttach(false);
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.85, allowsMultipleSelection: true });
    if (!result.canceled) {
      for (const asset of result.assets) {
        const isVideo = asset.type === 'video' || asset.uri.endsWith('.mp4') || asset.uri.endsWith('.mov') || asset.uri.endsWith('.MOV') || asset.uri.endsWith('.mkv') || asset.uri.endsWith('.3gp');
        await sendMessage({
          uri: asset.uri,
          name: isVideo ? 'video.mp4' : 'media.jpg',
          type: isVideo ? 'video/mp4' : 'image/jpeg'
        });
      }
    }
  };

  const pickDocument = async () => {
    setShowAttach(false);
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: true });
    if (result.type !== 'cancel' && result.assets) {
      for (const file of result.assets) {
        await sendMessage({ uri: file.uri, name: file.name, type: file.mimeType, messageType: 'document' });
      }
    }
  };

  const takePhoto = async () => {
    setShowAttach(false);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      showAlert('Permission Denied', 'Camera permission is required to take photos/videos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.85,
    });
    if (!result.canceled) {
      const asset = result.assets[0];
      const isVideo = asset.type === 'video' || asset.uri.endsWith('.mp4') || asset.uri.endsWith('.mov') || asset.uri.endsWith('.MOV') || asset.uri.endsWith('.mkv') || asset.uri.endsWith('.3gp');
      await sendMessage({
        uri: asset.uri,
        name: isVideo ? 'video.mp4' : 'media.jpg',
        type: isVideo ? 'video/mp4' : 'image/jpeg',
        isLive: true
      });
    }
  };

  const pickDisappearingMedia = async () => {
    setShowAttach(false);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showAlert('Permission Denied', 'Media library permission is required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.85,
    });
    if (!result.canceled) {
      const asset = result.assets[0];
      const isVideo = asset.type === 'video' || asset.uri.endsWith('.mp4') || asset.uri.endsWith('.mov') || asset.uri.endsWith('.MOV') || asset.uri.endsWith('.mkv') || asset.uri.endsWith('.3gp');
      
      if (isVideo) {
        // Videos don't ask for timer, they are view once.
        await sendMessage({
          uri: asset.uri,
          name: 'video.mp4',
          type: 'video/mp4',
          isSelfDestructing: true,
          destructAfterSeconds: 0
        });
      } else {
        // Pictures ask for timer
        setPendingDisappearingMedia(asset);
        setShowMediaTimerModal(true);
      }
    }
  };

  const selectAndSendDisappearingMedia = async (seconds) => {
    if (!pendingDisappearingMedia) return;
    const asset = pendingDisappearingMedia;
    await sendMessage({
      uri: asset.uri,
      name: 'media.jpg',
      type: 'image/jpeg',
      isSelfDestructing: true,
      destructAfterSeconds: seconds
    });
    setPendingDisappearingMedia(null);
  };

  // ── Voice Messages ────────────────────────────────────────────────────────
  useEffect(() => {
    let interval;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } else {
      setRecordingDuration(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const startAudioRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        showAlert('Permission Denied', 'Microphone permission is required to record voice messages.');
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording', err);
      showAlert('Error', 'Could not start recording. Please try again.');
    }
  };

  const cancelAudioRecording = async () => {
    if (!recording) return;
    try {
      await recording.stopAndUnloadAsync();
    } catch (e) {}
    setRecording(null);
    setIsRecording(false);
  };

  const sendAudioRecording = async () => {
    if (!recording) return;
    try {
      setIsRecording(false);
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      if (uri) {
        await sendMessage({
          uri,
          name: 'voice.m4a',
          type: 'audio/m4a',
          messageType: 'voice',
        });
        setShowVoiceModal(false);
      }
    } catch (err) {
      console.error('Failed to send recording', err);
      showAlert('Error', 'Failed to send voice message.');
    }
  };

  // ── Giphy GIFs ─────────────────────────────────────────────────────────────
  const fetchTrendingGifs = async () => {
    setIsFetchingGifs(true);
    setGifError('');
    const apiKey = process.env.EXPO_PUBLIC_GIPHY_API_KEY;
    if (!apiKey) {
      setGifResults([]);
      setGifError('GIPHY API Key is missing.\nPlease add EXPO_PUBLIC_GIPHY_API_KEY in frontend/.env');
      setIsFetchingGifs(false);
      return;
    }
    try {
      const res = await fetch(`https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=25`);
      const data = await res.json();
      if (res.status === 403 || data?.meta?.status === 403) {
        setGifResults([]);
        setGifError('GIPHY API Key is banned or invalid.\nPlease check EXPO_PUBLIC_GIPHY_API_KEY in frontend/.env');
      } else if (data.data) {
        setGifResults(data.data);
      }
    } catch (e) {
      console.log('Error fetching GIFs:', e);
      setGifError('Failed to fetch GIFs from Giphy.');
    } finally {
      setIsFetchingGifs(false);
    }
  };

  const searchGifs = async (query) => {
    if (!query.trim()) {
      fetchTrendingGifs();
      return;
    }
    setIsFetchingGifs(true);
    setGifError('');
    const apiKey = process.env.EXPO_PUBLIC_GIPHY_API_KEY;
    if (!apiKey) {
      setGifResults([]);
      setGifError('GIPHY API Key is missing.\nPlease add EXPO_PUBLIC_GIPHY_API_KEY in frontend/.env');
      setIsFetchingGifs(false);
      return;
    }
    try {
      const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(query)}&limit=25`);
      const data = await res.json();
      if (res.status === 403 || data?.meta?.status === 403) {
        setGifResults([]);
        setGifError('GIPHY API Key is banned or invalid.\nPlease check EXPO_PUBLIC_GIPHY_API_KEY in frontend/.env');
      } else if (data.data) {
        setGifResults(data.data);
      }
    } catch (e) {
      console.log('Error searching GIFs:', e);
      setGifError('Failed to search GIFs from Giphy.');
    } finally {
      setIsFetchingGifs(false);
    }
  };

  useEffect(() => {
    if (showGifModal) {
      fetchTrendingGifs();
    }
  }, [showGifModal]);

  const sendGif = async (gifUrl) => {
    setShowGifModal(false);
    try {
      const tempId = `optimistic-${Date.now()}`;
      const optimisticMessage = {
        _id: tempId,
        content: '',
        sender: {
          _id: user._id,
          username: user.username,
          displayName: user.displayName,
          profilePicture: user.profilePicture,
        },
        chat: chat._id,
        createdAt: new Date().toISOString(),
        isOptimistic: true,
        mediaUrl: gifUrl,
        mediaType: 'image',
        messageType: 'image',
      };

      useChatStore.getState().addMessage(chat._id, optimisticMessage);
      
      const { data } = await api.post('/messages', {
        chatId: chat._id,
        mediaUrl: gifUrl,
        mediaType: 'image',
        messageType: 'image',
      });
      
      useChatStore.getState().replaceMessage(chat._id, tempId, data.message);
    } catch (e) {
      console.log('Error sending GIF:', e);
      showAlert('Error', 'Failed to send GIF.');
    }
  };

  const handleReplyPress = (originalMessageId) => {
    const index = displayMessages.findIndex(m => m._id === originalMessageId);
    if (index >= 0) {
      flatRef.current?.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.5,
      });
      setHighlightedMessageId(originalMessageId);
      setTimeout(() => {
        setHighlightedMessageId(null);
      }, 1500);
    } else {
      showAlert('Older Message', 'This message is older and has not been loaded yet.');
    }
  };

  const loadMore = () => {
    if (chatMessages.length >= page * 50) {
      const next = page + 1; setPage(next);
      fetchMessages(chat._id, next);
    }
  };

  // Smart last-seen relative-time formatter
  const formatLastSeen = (dateStr) => {
    if (!dateStr) return null;
    const diffMs  = Date.now() - new Date(dateStr).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr  = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);
    if (diffMin < 1)   return 'Last seen just now';
    if (diffMin < 60)  return `Last seen ${diffMin} min${diffMin === 1 ? '' : 's'} ago`;
    if (diffHr  < 24)  return `Last seen ${diffHr} hr${diffHr === 1 ? '' : 's'} ago`;
    if (diffDay < 365) return `Last seen ${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
    return `Last seen ${new Date(dateStr).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}`;
  };

  // Status string for header
  const statusText = isCameraActive
    ? '📷 Using camera'
    : isOnline
    ? 'Online'
    : otherUser?.lastSeen
    ? formatLastSeen(otherUser.lastSeen)
    : chat.isGroupChat
    ? `${chat.users?.filter(u => {
        const un = u?.username?.toLowerCase();
        return u?.role !== 'system_bot' && !['mica_bot', 'mars_bot', 'mars', 'mica', 'relay_bot', 'relay'].includes(un);
      }).length || 0} members`
    : null;

  const statusColor = isCameraActive
    ? Colors.camera
    : isOnline
    ? Colors.accentGreen
    : Colors.dark.muted;

  const disappearSeconds = chat.disappearAfter || 0;
  const disappearIcon = disappearSeconds === -1 ? 'eye-outline' :
                        disappearSeconds === 86400 ? 'time-outline' :
                        disappearSeconds === 604800 ? 'calendar-outline' : null;

  // Group chats use GROUP_THEMES; personal chats use CHAT_THEMES
  const allThemes = chat.isGroupChat ? [...GROUP_THEMES, ...CHAT_THEMES] : CHAT_THEMES;
  const themeObj = allThemes.find(t => t.id === chat.theme) || allThemes[0];

  return (
    <View style={[styles.container, { backgroundColor: themeObj.bg || Colors.dark.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.dark.card} />

      {/* ── Header (flat, no gradient) ────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: (insets.top || StatusBar.currentHeight || 0) + 8 }]}>

        {selectionMode ? (
          <View style={styles.selectionHeader}>
            <TouchableOpacity onPress={() => { setSelectionMode(false); setSelectedMessages(new Set()); }} style={styles.headerBtn}>
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </TouchableOpacity>
            <Text style={styles.selectionCount}>{selectedMessages.size} selected</Text>
            {selectedMessages.size > 0 && (
              <TouchableOpacity onPress={deleteSelectedMessages} style={styles.headerBtn}>
                <Ionicons name="trash-outline" size={24} color="#EF4444" />
              </TouchableOpacity>
            )}
          </View>
        ) : showSearch ? (
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={17} color={Colors.dark.muted} />
          <TextInput
            ref={searchRef}
            style={styles.searchInput}
            placeholder={`Search in ${headerName}...`}
            placeholderTextColor={Colors.dark.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={17} color={Colors.dark.muted} />
            </TouchableOpacity>
          )}
          {searchQuery && (
            <Text style={styles.searchCount}>
              {displayMessages.length} result{displayMessages.length !== 1 ? 's' : ''}
            </Text>
          )}
        </View>
        ) : (
          <>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.headerInfo}
              onPress={() => {
                if (chat.isGroupChat) navigation.navigate('GroupInfo', { chat });
                else setSelectedUser(otherUser);
              }}
              activeOpacity={0.8}
            >
              {/* Avatar + cam indicator */}
              <View style={styles.avatarWrap}>
                {headerAvatar ? (
                  <Image
                    source={{ uri: headerAvatar }}
                    style={[styles.headerAvatar, isCameraActive && styles.avatarCamBorder]}
                  />
                ) : (
                  <View style={[styles.headerAvatar, styles.avatarFallback, isCameraActive && styles.avatarCamBorder]}>
                    <Text style={styles.avatarText}>{headerName?.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                {isCameraActive && <CamDot />}
                {!isCameraActive && isOnline && <View style={styles.onlineDot} />}
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.headerName} numberOfLines={1}>{headerName}</Text>
                {statusText && (
                  <View style={styles.headerStatusRow}>
                    {disappearIcon && (
                      <Ionicons name={disappearIcon} size={12} color={Colors.primary} style={styles.headerDisappearIcon} />
                    )}
                    <Text style={[styles.headerStatus, { color: statusColor }]} numberOfLines={1}>
                      {statusText}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>

            {/* Right icons */}
            <View style={styles.headerRight}>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => setShowSearch(v => !v)}
              >
                <Ionicons
                  name={showSearch ? 'close-outline' : 'search-outline'}
                  size={22}
                  color={showSearch ? Colors.primary : Colors.dark.text}
                />
              </TouchableOpacity>
              
              {(!chat.isGroupChat && otherUser && otherUser.username !== 'mica_bot' && otherUser.username !== 'relay_bot' && otherUser.username !== 'relay') && (
                (() => {
                  const isAlreadyFriend = otherUser?.isFriend ?? user?.friends?.some(f => (f._id || f).toString() === otherUser._id.toString());
                  return (
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={async () => {
                        if (isAlreadyFriend) return; // no-op, icon is just a tick
                        try {
                          await api.post(`/users/${otherUser._id}/friend-request`);
                          showAlert('✅', 'Friend request sent!');
                        } catch (e) {
                          showAlert('Info', e.response?.data?.message || e.message);
                        }
                      }}
                    >
                      <Ionicons 
                        name={isAlreadyFriend ? "checkmark-circle" : "person-add-outline"} 
                        size={22} 
                        color={Colors.primary} 
                      />
                    </TouchableOpacity>
                  );
                })()
              )}

              {(() => {
                const isBotChat = !chat.isGroupChat && (
                  otherUser?.username === 'mica_bot' ||
                  otherUser?.username === 'relay_bot' ||
                  otherUser?.username === 'relay'
                );
                if (isBotChat) return null;
                return (
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => {
                      if (chat.isGroupChat) {
                        const myId = user?._id;
                        const isGroupOwner = chat.groupAdmin?._id === myId || chat.groupAdmin === myId;
                        const isGroupAdmin = chat.admins?.some(a => (a._id || a) === myId) || isGroupOwner;
                        if (!isGroupAdmin) {
                          showAlert('Permission Denied', 'Only group admins and the owner can change disappearing messages settings.');
                          return;
                        }
                      }
                      setShowDisappear(true);
                    }}
                  >
                    <Ionicons name="ellipsis-vertical" size={22} color={Colors.dark.text} />
                  </TouchableOpacity>
                );
              })()}
            </View>
          </>
        )}
      </View>

      {/* ── Messages + input ──────────────────────────────────────────────── */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={{ flex: 1, paddingBottom: Platform.OS === 'android' ? kbHeight : 0 }}>
        <FlatList
          ref={flatRef}
          data={displayMessages}
          inverted
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          keyExtractor={(item) => item._id}
          renderItem={({ item, index }) => {
            const nextItem = displayMessages[index + 1];
            const showDate = !nextItem || new Date(item.createdAt).toDateString() !== new Date(nextItem.createdAt).toDateString();
            return (
              <View>
                {showDate && (
                  <View style={styles.dateSeparatorContainer}>
                    <View style={styles.dateSeparatorBadge}>
                      <Text style={styles.dateSeparatorText}>{formatChatDateSeparator(item.createdAt)}</Text>
                    </View>
                  </View>
                )}
                <MessageBubble
                  message={item}
                  currentUser={user}
              chat={chat}
              chatUsers={chat.users || []}
              isGroup={chat.isGroupChat}
              chatTheme={chat.theme}
              searchQuery={searchQuery}
              onSenderPress={(sender) => {
                if (sender?.username) {
                  navigation.navigate('UserProfile', { username: sender.username });
                }
              }}
              onReply={(msg) => {
                setReplyTo(msg);
                setTimeout(() => flatRef.current?.scrollToOffset({ offset: 0, animated: true }), 80);
              }}
              onForward={(msg) => setForwardMessage(msg)}
              onEdit={handleEdit}
              onReplyPress={handleReplyPress}
              highlightedMessageId={highlightedMessageId}
              onReact={async (msgId, emoji) => {
                try {
                  await api.post(`/messages/${msgId}/react`, { emoji });
                } catch (e) {
                  console.error('Failed to react:', e);
                }
              }}
              onMediaPress={(url, type) => setFullScreenMedia({ 
                url, 
                type, 
                messageId: item._id, 
                isSelfDestructing: item.isSelfDestructing, 
                destructAfterSeconds: item.destructAfterSeconds || 5, 
                isMine: (item.sender?._id || item.sender) === user?._id 
              })}
              onDelete={async (id, type) => {
                try { 
                  await api.delete(`/messages/${id}?type=${type}`); 
                  if (type === 'me') {
                    useChatStore.getState().purgeMessage(chat._id, id);
                  } else if (type === 'everyone') {
                    useChatStore.getState().removeMessage(chat._id, id);
                  }
                } catch(e) { showAlert('Error', e.message); }
              }}
              selectionMode={selectionMode}
              isSelected={selectedMessages.has(item._id)}
              onSelectToggle={() => toggleSelectMessage(item._id)}
              onLongPress={() => setSelectionMode(true)}
            />
              </View>
            );
          }}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          onScrollToIndexFailed={(info) => {
            flatRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
            setTimeout(() => {
              if (flatRef.current) {
                flatRef.current.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 });
              }
            }, 100);
          }}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingVertical: 12 }}
          onScroll={(e) => {
            const offsetY = e.nativeEvent.contentOffset.y;
            setShowScrollToBottom(offsetY > 400);
          }}
          scrollEventThrottle={100}
          ListEmptyComponent={
            searchQuery ? (
              <View style={styles.searchEmpty}>
                <Ionicons name="search-outline" size={40} color={Colors.dark.muted} />
                <Text style={styles.searchEmptyText}>No messages found for "{searchQuery}"</Text>
              </View>
            ) : null
          }
        />

        {/* Jump to unread floating button */}
        {showJumpUnread && unreadIndexRef.current >= 0 && (
          <TouchableOpacity
            style={styles.jumpUnreadBtn}
            activeOpacity={0.85}
            onPress={() => {
              flatRef.current?.scrollToIndex({
                index: unreadIndexRef.current,
                animated: true,
                viewPosition: 0.3,
              });
              setShowJumpUnread(false);
            }}
          >
            <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.jumpUnreadGrad}>
              <Ionicons name="arrow-up" size={16} color="#FFF" />
              <Text style={styles.jumpUnreadText}>Jump to unread</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* Scroll to bottom floating button */}
        {showScrollToBottom && !showJumpUnread && (
          <TouchableOpacity
            style={styles.scrollToBottomBtn}
            activeOpacity={0.85}
            onPress={() => {
              flatRef.current?.scrollToOffset({ offset: 0, animated: true });
              setShowScrollToBottom(false);
            }}
          >
            <View style={styles.scrollToBottomCircle}>
              <Ionicons name="arrow-down" size={20} color="#FFF" />
            </View>
          </TouchableOpacity>
        )}

        {/* Typing indicator above input */}
        {activeTypingUserIds.map((userId) => (
          <TypingBubble key={userId} username={resolveTypingUsername(userId)} />
        ))}

        {/* Reply preview */}
        {replyTo && !isRelayBotChat && (
          <View style={styles.replyPreview}>
            <View style={styles.replyBar} />
            <View style={{ flex: 1 }}>
              <Text style={styles.replyName}>{replyTo.sender?.displayName || replyTo.sender?.username}</Text>
              <Text style={styles.replyContent} numberOfLines={1}>{replyTo.content || '📎 Media'}</Text>
            </View>
            <TouchableOpacity onPress={() => {
              setReplyTo(null);
            }}>
              <Ionicons name="close" size={20} color={Colors.dark.muted} />
            </TouchableOpacity>
          </View>
        )}

        {/* Edit preview */}
        {editingMessage && !isRelayBotChat && (
          <View style={styles.replyPreview}>
            <View style={[styles.replyBar, { backgroundColor: Colors.accent }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.replyName, { color: Colors.accent }]}>Editing Message</Text>
              <Text style={styles.replyContent} numberOfLines={1}>{editingMessage.content}</Text>
            </View>
            <TouchableOpacity onPress={() => { 
              setEditingMessage(null); 
              setText(''); 
            }}>
              <Ionicons name="close" size={20} color={Colors.dark.muted} />
            </TouchableOpacity>
          </View>
        )}

        {/* Attachment menu */}
        {showAttach && !isRelayBotChat && (
          <View style={styles.attachMenu}>
            <TouchableOpacity style={styles.attachOption} onPress={pickImage}>
              <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.attachIcon}>
                <Ionicons name="image" size={22} color="#FFF" />
              </LinearGradient>
              <Text style={styles.attachLabel}>Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachOption} onPress={takePhoto}>
              <LinearGradient colors={['#EF4444', '#DC2626']} style={styles.attachIcon}>
                <Ionicons name="camera" size={22} color="#FFF" />
              </LinearGradient>
              <Text style={styles.attachLabel}>Live Cam</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.attachOption} 
              onPress={() => { setShowAttach(false); setShowVoiceModal(true); startAudioRecording(); }}
            >
              <LinearGradient colors={['#9333EA', '#7E22CE']} style={styles.attachIcon}>
                <Ionicons name="mic" size={22} color="#FFF" />
              </LinearGradient>
              <Text style={styles.attachLabel}>Voice</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.attachOption} 
              onPress={() => { setShowAttach(false); setShowGifModal(true); }}
            >
              <LinearGradient colors={['#06B6D4', '#0891B2']} style={styles.attachIcon}>
                <Ionicons name="film" size={22} color="#FFF" />
              </LinearGradient>
              <Text style={styles.attachLabel}>GIFs</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachOption} onPress={pickDocument}>
              <LinearGradient colors={['#22C55E', '#16A34A']} style={styles.attachIcon}>
                <Ionicons name="document" size={22} color="#FFF" />
              </LinearGradient>
              <Text style={styles.attachLabel}>Document</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachOption} onPress={pickDisappearingMedia}>
              <LinearGradient colors={['#EAB308', '#CA8A04']} style={styles.attachIcon}>
                <Ionicons name="time" size={22} color="#FFF" />
              </LinearGradient>
              <Text style={styles.attachLabel}>Disappearing</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachOption} onPress={() => { setShowAttach(false); setShowPollModal(true); }}>
              <LinearGradient colors={['#F97316', '#EA580C']} style={styles.attachIcon}>
                <Ionicons name="bar-chart" size={22} color="#FFF" />
              </LinearGradient>
              <Text style={styles.attachLabel}>Poll</Text>
            </TouchableOpacity>
          </View>
        )}



        {/* Input bar — paddingBottom includes gesture nav inset */}
        {isRelayBotChat ? (
          <View style={[styles.restrictedBar, { paddingBottom: (insets.bottom || 8) + 12 }]}>
            <Ionicons name="lock-closed" size={16} color={Colors.dark.muted} style={{ marginRight: 6 }} />
            <Text style={styles.restrictedText}>Messages are restricted for this chat.</Text>
          </View>
        ) : (
          <View style={[styles.inputBar, { paddingBottom: (insets.bottom || 8) + 6 }]}>
          <TouchableOpacity onPress={() => setShowAttach(!showAttach)} style={styles.inputIconBtn}>
            <Ionicons name={showAttach ? 'close' : 'add-circle-outline'} size={26} color={Colors.primary} />
          </TouchableOpacity>

          <View style={styles.inputWrap}>
            <TouchableOpacity 
              onPress={() => {
                if (showEmoji) {
                  setShowEmoji(false);
                  setTimeout(() => inputRef.current?.focus(), 100);
                } else {
                  Keyboard.dismiss();
                  setShowEmoji(true);
                }
              }} 
              style={styles.emojiToggle}
            >
              <Ionicons name={showEmoji ? 'keypad-outline' : 'happy-outline'} size={22} color={showEmoji ? Colors.primary : Colors.dark.muted} />
            </TouchableOpacity>
             <TextInput
              ref={inputRef}
              style={styles.textInput}
              placeholder="Message..."
              placeholderTextColor={Colors.dark.muted}
              value={text}
              onChangeText={handleTyping}
              onFocus={() => setShowEmoji(false)}
              multiline
              maxLength={4096}
            />
          </View>

          {text.trim() ? (
            <TouchableOpacity onPress={() => sendMessage()} disabled={isSending}>
              <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.sendBtn}>
                {isSending
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <Ionicons name="send" size={20} color="#FFF" />}
              </LinearGradient>
            </TouchableOpacity>
          ) : null}
        </View>
        )}

        {/* Inline Emoji Keyboard (replaces system keyboard without covering input) */}
        {!isRelayBotChat && showEmoji && (
          <View style={{ height: 320, backgroundColor: '#1A1A24' }}>
            <View style={styles.emojiHeader}>
              <TouchableOpacity onPress={() => { setShowEmoji(false); setTimeout(() => inputRef.current?.focus(), 100); }} style={{ padding: 5 }}>
                <Ionicons name="arrow-back" size={24} color={Colors.primary} />
              </TouchableOpacity>
              <Text style={{ color: '#FFF', fontSize: 16, fontWeight: 'bold', marginLeft: 15 }}>Emojis</Text>
            </View>
            <EmojiKeyboard 
              onEmojiSelected={(emoji) => {
                setText(prev => prev + emoji.emoji);
              }}
              allowMultipleSelections={true}
              theme={{
                container: '#1A1A24',
                header: '#FFFFFF',
                skinTonesContainer: '#2A2A35',
                category: {
                  icon: '#666666',
                  iconActive: '#2DD4BF',
                  container: '#2A2A35',
                  containerActive: '#2A2A35',
                },
                search: {
                  background: '#2A2A35',
                  text: '#FFFFFF',
                  placeholder: '#666666',
                  icon: '#666666',
                }
              }}
            />
          </View>
        )}
        </View>
      </KeyboardAvoidingView>

      {/* User info bottom sheet */}
      <UserInfoSheet
        visible={!!selectedUser}
        user={selectedUser}
        chat={chat}
        currentUserId={user?._id}
        navigation={navigation}
        onClose={() => setSelectedUser(null)}
      />

      {/* Disappearing messages sheet */}
      <DisappearingMsgSheet
        visible={showDisappear}
        currentSeconds={chat.disappearAfter || 0}
        onClose={() => setShowDisappear(false)}
        onSelect={async (seconds) => {
          try {
            const res = await api.put(`/chats/${chat._id}/disappear`, { seconds });
            if (res.data && res.data.message) {
              addMessage(chat._id, res.data.message);
            }
            useChatStore.getState().updateChat(chat._id, { disappearAfter: seconds });
          } catch (e) {
            const errorMsg = e.response?.data?.message || e.message || 'Failed to update timer';
            showAlert('Error', errorMsg);
          }
        }}
      />

      <CreatePollSheet
        visible={showPollModal}
        onClose={() => setShowPollModal(false)}
        onCreate={(pollData) => {
          sendMessage(null, pollData);
        }}
      />

      {/* Full-screen Media Viewer Modal */}
      <Modal visible={!!fullScreenMedia} transparent animationType="fade" onRequestClose={handleCloseMediaViewer}>
        <View style={styles.mediaViewerContainer}>
          <View style={[styles.mediaViewerHeader, { paddingTop: (insets.top || 16) + 10 }]}>
            <TouchableOpacity onPress={handleCloseMediaViewer} style={styles.mediaViewerBtn}>
              <Ionicons name="close" size={26} color="#FFF" />
            </TouchableOpacity>

            {mediaCountdownSeconds !== null ? (
              <View style={styles.mediaTimerBadge}>
                <Ionicons name="flame" size={16} color="#EF4444" style={{ marginRight: 4 }} />
                <Text style={styles.mediaTimerText}>{mediaCountdownSeconds}s</Text>
              </View>
            ) : null}

            {!(fullScreenMedia?.isSelfDestructing && !fullScreenMedia?.isMine) ? (
              <TouchableOpacity onPress={() => handleSaveMedia(fullScreenMedia?.url)} style={styles.mediaViewerBtn} disabled={isSavingMedia}>
                {isSavingMedia ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Ionicons name="download-outline" size={24} color="#FFF" />
                )}
              </TouchableOpacity>
            ) : (
              <View style={styles.mediaViewerBtnDisabled}>
                <Ionicons name="eye-off-outline" size={20} color="rgba(255,255,255,0.4)" />
              </View>
            )}
          </View>

          <View style={styles.mediaViewerContent}>
            {fullScreenMedia?.type === 'image' && (
              <Image source={{ uri: fullScreenMedia.url }} style={styles.fullScreenImage} resizeMode="contain" />
            )}
            {fullScreenMedia?.type === 'video' && (
              <FullScreenVideo url={fullScreenMedia.url} />
            )}
          </View>
        </View>
      </Modal>

      {/* Disappearing Media Timer Modal */}
      <Modal
        visible={showMediaTimerModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMediaTimerModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowMediaTimerModal(false)}>
          <Pressable style={styles.mediaTimerModalContent}>
            {/* Header with title and X close button */}
            <View style={styles.mediaTimerModalHeader}>
              <Text style={styles.mediaTimerModalTitle}>Disappearing Media</Text>
              <TouchableOpacity onPress={() => setShowMediaTimerModal(false)} style={styles.mediaTimerCloseBtn}>
                <Ionicons name="close" size={20} color={Colors.dark.text} />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.mediaTimerModalDesc}>
              Select a self-destruct timer. The recipient can only view this media once for the selected duration.
            </Text>

            <TouchableOpacity 
              style={styles.mediaTimerOption} 
              onPress={() => { setShowMediaTimerModal(false); selectAndSendDisappearingMedia(5); }}
            >
              <Ionicons name="time-outline" size={20} color={Colors.primary} style={{ marginRight: 10 }} />
              <Text style={styles.mediaTimerOptionText}>5 seconds</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.mediaTimerOption} 
              onPress={() => { setShowMediaTimerModal(false); selectAndSendDisappearingMedia(10); }}
            >
              <Ionicons name="time-outline" size={20} color={Colors.primary} style={{ marginRight: 10 }} />
              <Text style={styles.mediaTimerOptionText}>10 seconds</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.mediaTimerOption} 
              onPress={() => { setShowMediaTimerModal(false); selectAndSendDisappearingMedia(30); }}
            >
              <Ionicons name="time-outline" size={20} color={Colors.primary} style={{ marginRight: 10 }} />
              <Text style={styles.mediaTimerOptionText}>30 seconds</Text>
            </TouchableOpacity>

            {/* Cancel Button */}
            <TouchableOpacity 
              style={styles.mediaTimerCancelBtn} 
              onPress={() => setShowMediaTimerModal(false)}
            >
              <Text style={styles.mediaTimerCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Voice Recorder Modal */}
      <Modal
        visible={showVoiceModal}
        transparent
        animationType="slide"
        onRequestClose={cancelAudioRecording}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.voiceModalContent}>
            <Text style={styles.voiceModalTitle}>Voice Message</Text>
            
            {/* Visualizer and Timer */}
            <View style={styles.recorderContainer}>
              {isRecording ? (
                <View style={styles.recordingState}>
                  <View style={styles.recordingPulseDot} />
                  <Text style={styles.recordingTimer}>
                    {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
                  </Text>
                </View>
              ) : (
                <Text style={styles.recordInstruction}>Tap record to start speaking</Text>
              )}
            </View>

            <View style={styles.recorderActionsRow}>
              {isRecording ? (
                <>
                  <TouchableOpacity style={styles.recorderActionBtnDiscard} onPress={cancelAudioRecording}>
                    <Ionicons name="trash-outline" size={24} color="#EF4444" />
                    <Text style={styles.recorderActionBtnText}>Discard</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.recorderActionBtnSend} onPress={sendAudioRecording}>
                    <Ionicons name="send" size={24} color="#FFF" />
                    <Text style={[styles.recorderActionBtnText, { color: '#FFF' }]}>Send</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity style={styles.recorderActionBtnClose} onPress={() => setShowVoiceModal(false)}>
                    <Text style={styles.recorderActionBtnCloseText}>Close</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.recorderActionBtnRecord} onPress={startAudioRecording}>
                    <Ionicons name="mic" size={28} color="#FFF" />
                    <Text style={[styles.recorderActionBtnText, { color: '#FFF', marginTop: 4 }]}>Record</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* GIF Search Modal */}
      <Modal
        visible={showGifModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGifModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowGifModal(false)}>
          <Pressable style={styles.gifModalContent}>
            <View style={styles.gifModalHeader}>
              <Text style={styles.gifModalTitle}>GIPHY Search</Text>
              <TouchableOpacity onPress={() => setShowGifModal(false)} style={styles.gifCloseBtn}>
                <Ionicons name="close" size={20} color={Colors.dark.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.gifSearchBox}>
              <Ionicons name="search" size={18} color={Colors.dark.muted} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.gifSearchInput}
                placeholder="Search GIFs..."
                placeholderTextColor={Colors.dark.muted}
                value={gifQuery}
                onChangeText={(val) => {
                  setGifQuery(val);
                  searchGifs(val);
                }}
                autoFocus
              />
            </View>

            {isFetchingGifs ? (
              <ActivityIndicator color={Colors.primary} size="large" style={{ marginVertical: 40 }} />
            ) : (
              <FlatList
                data={gifResults}
                keyExtractor={(item) => item.id}
                numColumns={2}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.gifGridItem}
                    onPress={() => sendGif(item.images.fixed_height.url)}
                  >
                    <Image
                      source={{ uri: item.images.preview_gif.url }}
                      style={styles.gifImage}
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={styles.gifEmptyText}>{gifError || 'No GIFs found'}</Text>
                }
                style={{ maxHeight: 320 }}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Forward Modal */}
      <Modal visible={!!forwardMessage} transparent animationType="slide" onRequestClose={() => { setForwardMessage(null); setForwardSelectedChats(new Set()); }}>
        <Pressable style={styles.modalOverlay} onPress={() => { setForwardMessage(null); setForwardSelectedChats(new Set()); }}>
          <Pressable style={styles.forwardModalContent}>
            <View style={styles.mediaTimerModalHeader}>
              <Text style={styles.mediaTimerModalTitle}>Forward to (Max 5)</Text>
              <TouchableOpacity onPress={() => { setForwardMessage(null); setForwardSelectedChats(new Set()); }} style={styles.mediaTimerCloseBtn}>
                <Ionicons name="close" size={20} color={Colors.dark.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 400 }}>
              {chats.map(c => {
                const isMe = !c.isGroupChat && c.users?.every(u => (u._id||u) === user._id);
                const other = !c.isGroupChat && c.users?.find(u => (u._id||u) !== user._id);
                const name = c.isGroupChat ? c.chatName : (other?.displayName || other?.username || (isMe ? 'Saved Messages' : 'Unknown'));
                const isSelected = forwardSelectedChats.has(c._id);
                return (
                  <TouchableOpacity key={c._id} style={styles.forwardChatOption} onPress={() => toggleForwardChat(c._id)}>
                    <Text style={styles.forwardChatText} numberOfLines={1}>{name}</Text>
                    <Ionicons name={isSelected ? "checkmark-circle" : "ellipse-outline"} size={24} color={isSelected ? Colors.primary : Colors.dark.muted} />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {forwardSelectedChats.size > 0 && (
              <TouchableOpacity style={styles.forwardSendBtn} onPress={handleForward}>
                <Text style={styles.forwardSendBtnText}>Forward ({forwardSelectedChats.size})</Text>
              </TouchableOpacity>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const HEADER_TOP = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 50;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.bg },

  // ── Header (no gradient) ──────────────────────────────────────────────────
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingBottom: 10, paddingHorizontal: 10,
    gap: 8, backgroundColor: Colors.dark.card,
    borderBottomWidth: 1, borderBottomColor: Colors.dark.border,
  },
  headerBtn: { padding: 4 },
  selectionHeader: {
    flexDirection: 'row', alignItems: 'center', flex: 1, paddingHorizontal: 4, gap: 16
  },
  selectionCount: {
    fontSize: 18, fontWeight: '700', color: Colors.dark.text, flex: 1
  },
  searchWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: { padding: 4 },
  headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarWrap: { position: 'relative' },
  headerAvatar: { width: 40, height: 40, borderRadius: 20 },
  avatarCamBorder: { borderWidth: 2, borderColor: Colors.camera },
  avatarFallback: { backgroundColor: Colors.primary + '40', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '700', color: Colors.primary },
  onlineDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 11, height: 11, borderRadius: 6,
    backgroundColor: Colors.accentGreen,
    borderWidth: 1.5, borderColor: Colors.dark.card,
  },
  camDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: Colors.camera,
    borderWidth: 1.5, borderColor: Colors.dark.card,
    alignItems: 'center', justifyContent: 'center',
  },
  headerName: { fontSize: 16, fontWeight: '700', color: '#FFF', flex: 1 },
  headerStatusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 1 },
  headerDisappearIcon: { marginRight: 4 },
  headerStatus: { fontSize: 12 },
  headerRight: { flexDirection: 'row', gap: 2 },
  iconBtn: { padding: 6 },

  dateSeparatorContainer: {
    alignItems: 'center',
    marginVertical: 12,
  },
  dateSeparatorBadge: {
    backgroundColor: Colors.dark.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  dateSeparatorText: {
    color: Colors.dark.muted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize'
  },

  // ── Search bar ────────────────────────────────────────────────────────────
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.dark.input, borderRadius: 0,
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.dark.border,
  },
  searchInput: { flex: 1, color: Colors.dark.text, fontSize: 14 },
  searchCount: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  searchEmpty: { alignItems: 'center', marginTop: 60, gap: 10 },
  searchEmptyText: { color: Colors.dark.muted, fontSize: 14 },

  // ── Reply ─────────────────────────────────────────────────────────────────
  replyPreview: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.dark.surface, paddingHorizontal: 16, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: Colors.dark.border,
  },
  replyBar: { width: 3, height: '100%', backgroundColor: Colors.primary, borderRadius: 2, minHeight: 30 },
  replyName: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  replyContent: { fontSize: 13, color: Colors.dark.muted },

  // ── Attachments ───────────────────────────────────────────────────────────
  attachMenu: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingVertical: 18,
    justifyContent: 'space-between',
    backgroundColor: Colors.dark.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    rowGap: 16,
  },
  attachOption: {
    width: '30%',
    alignItems: 'center',
    gap: 8,
  },
  attachIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  attachLabel: { fontSize: 12, color: Colors.dark.textSecondary, fontWeight: '600' },

  // ── Input bar ─────────────────────────────────────────────────────────────
  emojiHeader: {
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 16, 
    paddingTop: 10, 
    paddingBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  inputBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingTop: 10,
    backgroundColor: 'transparent',
  },
  inputIconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  inputWrap: {
    flex: 1, backgroundColor: Colors.dark.input, borderRadius: 22,
    paddingHorizontal: 10, minHeight: 44, flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  emojiToggle: { padding: 4, marginRight: 4 },
  textInput: { flex: 1, color: Colors.dark.text, fontSize: 15, paddingVertical: 8, textAlignVertical: 'center' },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  micBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.dark.input, borderWidth: 1, borderColor: Colors.dark.border },

  // ── Jump to unread ────────────────────────────────────────────────────────
  jumpUnreadBtn: {
    position: 'absolute',
    bottom: 90,
    alignSelf: 'center',
    zIndex: 10,
  },
  jumpUnreadGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    elevation: 4,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  jumpUnreadText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },

  // ── Scroll to bottom ──────────────────────────────────────────────────────
  scrollToBottomBtn: {
    position: 'absolute',
    bottom: 80,
    right: 16,
    zIndex: 10,
  },
  scrollToBottomCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.card,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },

  // ── Typing indicator ──────────────────────────────────────────────────────
  typingContainer: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 4,
  },
  typingName: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 4,
    fontWeight: '500',
  },
  typingDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00D2FF',
    marginHorizontal: 2,
  },

  // ── Voice Message Modal ───────────────────────────────────────────────────
  voiceModalContent: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: Colors.dark.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: 24,
    alignItems: 'center',
  },
  voiceModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.dark.text,
    marginBottom: 20,
  },
  recorderContainer: {
    width: '100%',
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    backgroundColor: Colors.dark.bg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  recordingState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  recordingPulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
  },
  recordingTimer: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.dark.text,
    fontVariant: ['tabular-nums'],
  },
  recordInstruction: {
    fontSize: 14,
    color: Colors.dark.muted,
  },
  recorderActionsRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  recorderActionBtnDiscard: {
    alignItems: 'center',
    gap: 6,
  },
  recorderActionBtnSend: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recorderActionBtnClose: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  recorderActionBtnCloseText: {
    fontSize: 15,
    color: Colors.dark.muted,
    fontWeight: '600',
  },
  recorderActionBtnRecord: {
    backgroundColor: Colors.primary,
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  recorderActionBtnText: {
    fontSize: 13,
    color: Colors.dark.muted,
    fontWeight: '600',
  },

  // ── GIPHY Search Modal ────────────────────────────────────────────────────
  gifModalContent: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: Colors.dark.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: 20,
    alignItems: 'stretch',
  },
  gifModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  gifModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.dark.text,
  },
  gifCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.bg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: Colors.dark.border,
  },
  gifSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.bg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
    borderWidth: 0.5,
    borderColor: Colors.dark.border,
  },
  gifSearchInput: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: 14,
    padding: 0,
  },
  gifGridItem: {
    flex: 1,
    margin: 4,
    aspectRatio: 1.3,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: Colors.dark.bg,
    borderWidth: 0.5,
    borderColor: Colors.dark.border,
  },
  gifImage: {
    width: '100%',
    height: '100%',
  },
  gifEmptyText: {
    textAlign: 'center',
    color: Colors.dark.muted,
    fontSize: 14,
    marginVertical: 40,
  },

  // ── Emoji picker ──────────────────────────────────────────────────────────
  emojiPanel: {
    height: 220,
    backgroundColor: Colors.dark.card,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  emojiItem: {
    width: '10%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiItemText: { fontSize: 24 },

  // ── Full Screen Media Viewer ──────────────────────────────────────────────
  mediaViewerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  mediaViewerHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  mediaViewerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaViewerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenImage: {
    width: '100%',
    height: '100%',
  },
  fullScreenVideo: {
    width: '100%',
    height: '100%',
  },
  mediaTimerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  mediaTimerText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  mediaViewerBtnDisabled: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  mediaTimerModalContent: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: Colors.dark.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: 20,
    alignItems: 'stretch',
  },
  mediaTimerModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  mediaTimerModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.dark.text,
  },
  mediaTimerCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.bg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: Colors.dark.border,
  },
  mediaTimerModalDesc: {
    fontSize: 13,
    color: Colors.dark.muted,
    lineHeight: 18,
    marginBottom: 20,
  },
  mediaTimerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.bg,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 0.5,
    borderColor: Colors.dark.border,
  },
  mediaTimerOptionText: {
    fontSize: 15,
    color: Colors.dark.text,
    fontWeight: '600',
  },
  mediaTimerCancelBtn: {
    marginTop: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaTimerCancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.dark.muted,
  },
  forwardModalContent: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: Colors.dark.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: 20,
    alignItems: 'stretch',
  },
  forwardChatOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.dark.bg,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 0.5,
    borderColor: Colors.dark.border,
  },
  forwardChatText: {
    fontSize: 15,
    color: Colors.dark.text,
    fontWeight: '600',
    flex: 1,
    marginRight: 10,
  },
  forwardSendBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  forwardSendBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  restrictedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.dark.surface,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  restrictedText: {
    color: Colors.dark.muted,
    fontSize: 14,
    fontWeight: '500',
  }
});
