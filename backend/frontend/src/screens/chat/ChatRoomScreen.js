import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Image, StatusBar, Alert,
  ActivityIndicator, Pressable, Animated, ScrollView, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Video, ResizeMode, Audio } from 'expo-av';
import useChatStore from '../../store/useChatStore';
import useAuthStore from '../../store/useAuthStore';
import { Colors } from '../../theme/colors';
import api, { uploadApi } from '../../services/api';
import { joinChat, leaveChat, sendTyping, stopTyping, markRead } from '../../services/socketService';
import MessageBubble from '../../components/MessageBubble';
import UserInfoSheet from '../../components/UserInfoSheet';
import DisappearingMsgSheet from '../../components/DisappearingMsgSheet';

// Pulsing camera dot component
function CamDot() {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.4, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,   duration: 600, useNativeDriver: true }),
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
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let active = true;
    const animate = () => {
      if (!active) return;
      Animated.sequence([
        Animated.parallel([
          Animated.timing(dot1, { toValue: -5, duration: 250, useNativeDriver: true }),
          Animated.sequence([
            Animated.delay(120),
            Animated.timing(dot2, { toValue: -5, duration: 250, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.delay(240),
            Animated.timing(dot3, { toValue: -5, duration: 250, useNativeDriver: true }),
          ]),
        ]),
        Animated.parallel([
          Animated.timing(dot1, { toValue: 0, duration: 250, useNativeDriver: true }),
          Animated.sequence([
            Animated.delay(120),
            Animated.timing(dot2, { toValue: 0, duration: 250, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.delay(240),
            Animated.timing(dot3, { toValue: 0, duration: 250, useNativeDriver: true }),
          ]),
        ]),
        Animated.delay(150),
      ]).start(() => {
        if (active) animate();
      });
    };
    animate();
    return () => {
      active = false;
    };
  }, []);

  return (
    <View style={styles.typingContainer}>
      <View style={styles.typingBubble}>
        <Text style={styles.typingName}>{username}</Text>
        <View style={styles.typingDotsRow}>
          {[dot1, dot2, dot3].map((dot, i) => (
            <Animated.View
              key={i}
              style={[styles.typingDot, { transform: [{ translateY: dot }] }]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

export default function ChatRoomScreen({ route, navigation }) {
  const { chat } = route.params;
  const { user } = useAuthStore();
  const { messages, fetchMessages, addMessage, typingUsers, clearUnread } = useChatStore();
  const insets = useSafeAreaInsets();

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
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
  const flatRef      = useRef(null);
  const typingTimeout = useRef(null);
  const searchRef    = useRef(null);
  const inputRef     = useRef(null);
  const [showJumpUnread, setShowJumpUnread] = useState(false);
  const unreadIndexRef = useRef(-1);
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

  useEffect(() => {
    if (fullScreenMedia && fullScreenMedia.isSelfDestructing && !fullScreenMedia.isMine) {
      setMediaCountdownSeconds(fullScreenMedia.destructAfterSeconds);
    } else {
      setMediaCountdownSeconds(null);
    }
  }, [fullScreenMedia]);

  useEffect(() => {
    if (mediaCountdownSeconds === null || !fullScreenMedia) return;

    if (mediaCountdownSeconds <= 0) {
      setFullScreenMedia(null);
      if (fullScreenMedia.messageId) {
        api.post(`/messages/${fullScreenMedia.messageId}/destruct`)
          .then(() => {
            useChatStore.getState().purgeMessage(chat._id, fullScreenMedia.messageId);
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
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      } else {
        Alert.alert('Error', 'Sharing is not available on this device');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to save media: ' + e.message);
    } finally {
      setIsSavingMedia(false);
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
  const isOnline      = !chat.isGroupChat && otherUser?.isOnline;
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
    return () => { leaveChat(chat._id); };
  }, [chat._id]);

  // On first load, find the first unread message index
  useEffect(() => {
    if (chatMessages.length > 0 && !searchQuery) {
      // Find the first message not sent by me and not read by me
      const firstUnreadIdx = chatMessages.findIndex(m => {
        const senderId = m.sender?._id || m.sender;
        return senderId !== user?._id && !m.readBy?.includes(user?._id);
      });

      if (firstUnreadIdx > 0 && firstUnreadIdx < chatMessages.length - 3) {
        unreadIndexRef.current = firstUnreadIdx;
        setShowJumpUnread(true);
        // Scroll to bottom (recent messages)
        setTimeout(() => flatRef.current?.scrollToEnd({ animated: false }), 100);
      } else {
        // Already at bottom or few unread — just scroll down
        setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
      }

      // Auto-mark as read
      const lastMsg = chatMessages[chatMessages.length - 1];
      const senderId = lastMsg?.sender?._id || lastMsg?.sender;
      if (senderId && senderId !== user?._id && !lastMsg?.readBy?.includes(user?._id)) {
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

  const handleTyping = (val) => {
    setText(val);
    sendTyping(chat._id, user?._id, user?.username);
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => stopTyping(chat._id, user?._id), 1500);
  };

  const sendMessage = async (mediaFile = null) => {
    const content = text.trim();
    if (!content && !mediaFile) return;
    setIsSending(true);
    setText('');
    stopTyping(chat._id, user?._id);

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
      mediaType: mediaFile ? (mediaFile.type.startsWith('video/') ? 'video' : 'image') : null,
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
    const savedReplyTo = replyTo;
    setReplyTo(null);

    try {
      const formData = new FormData();
      if (content) formData.append('content', content);
      formData.append('chatId', chat._id);
      if (savedReplyTo) formData.append('replyTo', savedReplyTo._id);
      if (mediaFile) {
        formData.append('media', { 
          uri: mediaFile.uri, 
          name: mediaFile.name || 'media.jpg', 
          type: mediaFile.type || 'image/jpeg' 
        });
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
      Alert.alert('Error', e.message || 'Failed to send');
    } finally {
      setIsSending(false);
    }
  };

  const pickImage = async () => {
    setShowAttach(false);
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.85 });
    if (!result.canceled) {
      const asset = result.assets[0];
      const isVideo = asset.type === 'video' || asset.uri.endsWith('.mp4') || asset.uri.endsWith('.mov') || asset.uri.endsWith('.MOV') || asset.uri.endsWith('.mkv') || asset.uri.endsWith('.3gp');
      await sendMessage({
        uri: asset.uri,
        name: isVideo ? 'video.mp4' : 'media.jpg',
        type: isVideo ? 'video/mp4' : 'image/jpeg'
      });
    }
  };

  const pickDocument = async () => {
    setShowAttach(false);
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (result.type !== 'cancel' && result.assets) {
      const file = result.assets[0];
      await sendMessage({ uri: file.uri, name: file.name, type: file.mimeType });
    }
  };

  const takePhoto = async () => {
    setShowAttach(false);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Denied', 'Camera permission is required to take photos/videos.');
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

  const pickDisappearingMedia = () => {
    setShowAttach(false);
    setShowMediaTimerModal(true);
  };

  const selectAndSendDisappearingMedia = async (seconds) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Denied', 'Media library permission is required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
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
        isSelfDestructing: true,
        destructAfterSeconds: seconds
      });
    }
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
        Alert.alert('Permission Denied', 'Microphone permission is required to record voice messages.');
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
      Alert.alert('Error', 'Could not start recording. Please try again.');
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
      Alert.alert('Error', 'Failed to send voice message.');
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
      Alert.alert('Error', 'Failed to send GIF.');
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
      Alert.alert('Older Message', 'This message is older and has not been loaded yet.');
    }
  };

  const loadMore = () => {
    if (chatMessages.length >= page * 50) {
      const next = page + 1; setPage(next);
      fetchMessages(chat._id, next);
    }
  };

  // Status string for header
  const statusText = isCameraActive
    ? '📷 Using camera'
    : isOnline
    ? 'Online'
    : otherUser?.lastSeen
    ? `Last seen ${new Date(otherUser.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : chat.isGroupChat
    ? `${chat.users?.length || 0} members`
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

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.dark.card} />

      {/* ── Header (flat, no gradient) ────────────────────────────────────── */}
      <View style={styles.header}>
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
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => {
              if (chat.isGroupChat) {
                const myId = user?._id;
                const isGroupOwner = chat.groupAdmin?._id === myId || chat.groupAdmin === myId;
                const isGroupAdmin = chat.admins?.some(a => (a._id || a) === myId) || isGroupOwner;
                if (!isGroupAdmin) {
                  Alert.alert('Permission Denied', 'Only group admins and the owner can change disappearing messages settings.');
                  return;
                }
              }
              setShowDisappear(true);
            }}
          >
            <Ionicons name="ellipsis-vertical" size={22} color={Colors.dark.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── In-chat search bar ─────────────────────────────────────────────── */}
      {showSearch && (
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
      )}

      {/* ── Messages + input ──────────────────────────────────────────────── */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatRef}
          data={displayMessages}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              currentUser={user}
              chat={chat}
              chatUsers={chat.users || []}
              isGroup={chat.isGroupChat}
              searchQuery={searchQuery}
              onSenderPress={(sender) => setSelectedUser(sender)}
              onReply={setReplyTo}
              onReplyPress={handleReplyPress}
              highlightedMessageId={highlightedMessageId}
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
                  }
                }
                catch (e) { Alert.alert('Error', e.message); }
              }}
              onReact={async (id, emoji) => {
                try { await api.post(`/messages/${id}/react`, { emoji }); } catch (_) {}
              }}
            />
          )}
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

        {/* Typing indicator above input */}
        {activeTypingUserIds.map((userId) => (
          <TypingBubble key={userId} username={resolveTypingUsername(userId)} />
        ))}

        {/* Reply preview */}
        {replyTo && (
          <View style={styles.replyPreview}>
            <View style={styles.replyBar} />
            <View style={{ flex: 1 }}>
              <Text style={styles.replyName}>{replyTo.sender?.displayName || replyTo.sender?.username}</Text>
              <Text style={styles.replyContent} numberOfLines={1}>{replyTo.content || '📎 Media'}</Text>
            </View>
            <TouchableOpacity onPress={() => setReplyTo(null)}>
              <Ionicons name="close" size={20} color={Colors.dark.muted} />
            </TouchableOpacity>
          </View>
        )}

        {/* Attachment menu */}
        {showAttach && (
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
          </View>
        )}

        {/* Emoji picker panel */}
        {showEmoji && (
          <View style={styles.emojiPanel}>
            <ScrollView contentContainerStyle={styles.emojiGrid} showsVerticalScrollIndicator={false}>
              {['😀','😂','🤣','😍','🥰','😘','😊','😎','🤩','🥳',
                '😢','😭','😤','😡','🤯','😱','🥺','😴','🤔','🙄',
                '👍','👎','👏','🙌','🤝','💪','🔥','❤️','💔','💯',
                '🎉','🎊','✨','⭐','🌟','💫','🫡','🫠','🤭','😏',
                '👀','💀','☠️','🤡','👻','😈','💩','🙈','🙉','🙊',
                '💖','💝','💕','💞','🧡','💛','💚','💙','💜','🖤',
                '✅','❌','⚡','🌈','☀️','🌙','🍕','🍔','☕','🎵'].map(emoji => (
                <TouchableOpacity
                  key={emoji}
                  style={styles.emojiItem}
                  onPress={() => {
                    setText(prev => prev + emoji);
                    inputRef.current?.focus();
                  }}
                >
                  <Text style={styles.emojiItemText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Input bar — paddingBottom includes gesture nav inset */}
        <View style={[styles.inputBar, { paddingBottom: (insets.bottom || 8) + 6 }]}>
          <TouchableOpacity onPress={() => setShowAttach(!showAttach)} style={styles.inputIconBtn}>
            <Ionicons name={showAttach ? 'close' : 'add-circle-outline'} size={26} color={Colors.primary} />
          </TouchableOpacity>

          <View style={styles.inputWrap}>
            <TouchableOpacity onPress={() => setShowEmoji(!showEmoji)} style={styles.emojiToggle}>
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
        onSelect={async (seconds) => {
          try {
            await api.put(`/chats/${chat._id}/disappear`, { seconds });
            // Update the global chat store so list updates immediately
            useChatStore.getState().updateChat(chat._id, { disappearAfter: seconds });
          } catch (e) { Alert.alert('Error', e.message); }
        }}
      />

      {/* Full-screen Media Viewer Modal */}
      <Modal visible={!!fullScreenMedia} transparent animationType="fade" onRequestClose={() => setFullScreenMedia(null)}>
        <View style={styles.mediaViewerContainer}>
          <View style={[styles.mediaViewerHeader, { paddingTop: (insets.top || 16) + 10 }]}>
            <TouchableOpacity onPress={() => setFullScreenMedia(null)} style={styles.mediaViewerBtn}>
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
              <Video
                source={{ uri: fullScreenMedia.url }}
                style={styles.fullScreenVideo}
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay
                useNativeControls
                isLooping
              />
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
    </View>
  );
}

const HEADER_TOP = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 50;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.bg },

  // ── Header (no gradient) ──────────────────────────────────────────────────
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: HEADER_TOP + 8, paddingBottom: 10, paddingHorizontal: 10,
    gap: 8, backgroundColor: Colors.dark.card,
    borderBottomWidth: 1, borderBottomColor: Colors.dark.border,
  },
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
  inputBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingTop: 10,
    backgroundColor: Colors.dark.card,
    borderTopWidth: 1, borderTopColor: Colors.dark.border,
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
    bottom: 8,
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
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  typingName: {
    fontSize: 13,
    color: '#94A3B8',
    marginRight: 8,
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
});
