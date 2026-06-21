import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, Image, StyleSheet,
  Pressable, Modal, Alert, Clipboard, ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView, useVideoPlayer } from 'expo-video';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { Colors } from '../theme/colors';
import { CHAT_THEMES, GROUP_THEMES } from './ThemeSelectSheet';
import { useAlert } from './CustomAlert';
import EmojiPicker from 'rn-emoji-keyboard';

import { Audio } from 'expo-av';
import { useNavigation } from '@react-navigation/native';

const PreviewVideo = ({ url }) => {
  const player = useVideoPlayer(url, p => {
    p.loop = false;
    p.pause();
  });
  return <VideoView style={styles.mediaVideo} player={player} contentFit="cover" nativeControls={false} />;
};


const AudioPlayer = ({ url, isMine }) => {
  const [sound, setSound] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    return sound ? () => { sound.unloadAsync(); } : undefined;
  }, [sound]);

  const togglePlayback = async () => {
    if (loading) return;
    try {
      if (sound) {
        const status = await sound.getStatusAsync();
        if (status.isPlaying) {
          await sound.pauseAsync();
        } else {
          // If finished, replay from start. Otherwise, resume.
          if (status.positionMillis >= status.durationMillis || status.didJustFinish) {
            await sound.replayAsync();
          } else {
            await sound.playAsync();
          }
        }
      } else {
        setLoading(true);
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: url },
          { shouldPlay: true },
          (status) => {
            if (status.isLoaded) {
              setIsPlaying(status.isPlaying);
              if (status.durationMillis) {
                setProgress(status.positionMillis / status.durationMillis);
              }
            }
          }
        );
        setSound(newSound);
        setLoading(false);
      }
    } catch (e) {
      console.error('Audio playback error', e);
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity style={[styles.audioRow, { minWidth: 200 }]} onPress={togglePlayback}>
      {loading ? (
        <ActivityIndicator size="small" color={isMine ? '#FFF' : Colors.primary} style={{ marginHorizontal: 8 }} />
      ) : (
        <Ionicons name={isPlaying ? "pause-circle" : "play-circle"} size={36} color={isMine ? '#FFF' : Colors.primary} />
      )}
      <View style={styles.audioBarWrap}>
        <View style={styles.audioBar}>
          <View style={[styles.audioProgress, { width: `${progress * 100}%`, backgroundColor: isMine ? '#FFF' : Colors.primary }]} />
        </View>
      </View>
    </TouchableOpacity>
  );
};

const REACTIONS = ['❤️', '😂', '👍', '😮', '😢'];

const formatTime = (d) =>
  new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const formatDate = (d) =>
  new Date(d).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function MessageBubble({
  message, currentUser, isGroup, chatUsers, chatTheme, searchQuery, chat,
  onSenderPress, onReply, onReplyPress, highlightedMessageId,
  onMediaPress, onDelete, onReact, onEdit, onForward,
  selectionMode, isSelected, onSelectToggle
}) {
  const [showActions, setShowActions] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [tab, setTab] = useState('actions'); // 'actions' | 'readby'
  const swipeableRef = useRef(null);
  const navigation = useNavigation();
  const { showAlert } = useAlert() || {};

  // Search CHAT_THEMES first then GROUP_THEMES so both personal and group themes resolve correctly
  const themeObj = CHAT_THEMES.find(t => t.id === chatTheme)
    || GROUP_THEMES.find(t => t.id === chatTheme)
    || CHAT_THEMES[0];
  const themeColors = themeObj.colors;

  const getSecondsLeft = () => {
    if (message.deletedForEveryone || !message.isSelfDestructing || !message.expiresAt) return 0;
    const diff = Math.ceil((new Date(message.expiresAt).getTime() - Date.now()) / 1000);
    return Math.max(0, diff);
  };

  const [timeLeft, setTimeLeft] = useState(getSecondsLeft());

  useEffect(() => {
    // Don't start timer if message is already gone or is not self-destructing
    if (message.deletedForEveryone || !message.isSelfDestructing || !message.expiresAt) return;
    
    const initial = getSecondsLeft();
    if (initial <= 0) {
      // Already expired — mark as disappeared locally (don't call onDelete which purges)
      return;
    }
    
    setTimeLeft(initial);
    
    const interval = setInterval(() => {
      if (message.deletedForEveryone) {
        clearInterval(interval);
        return;
      }
      const remaining = getSecondsLeft();
      if (remaining <= 0) {
        clearInterval(interval);
        // Only call onDelete for the sender's own copy (timer-based auto-expiry)
        onDelete?.(message._id, 'me');
      } else {
        setTimeLeft(remaining);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [message.expiresAt, message.deletedForEveryone, message.isSelfDestructing]);

  const senderId = message.sender?._id?.toString() || message.sender?.toString();
  const currentUserId = currentUser?._id?.toString();
  const isMine = senderId === currentUserId;
  
  const msgAgeMins = (Date.now() - new Date(message.createdAt).getTime()) / 60000;
  
  // Logic for Admin/Owner delete for everyone
  let isReqAdminOrOwner = false;
  if (isGroup && chat) {
    const isReqOwner = chat.groupAdmin === currentUserId;
    const isReqAdmin = chat.admins?.includes(currentUserId);
    isReqAdminOrOwner = isReqOwner || isReqAdmin;
  }

  let canDeleteEveryone = false;
  if (isMine) {
    if (msgAgeMins <= 5) {
      canDeleteEveryone = true;
    } else if (isReqAdminOrOwner) {
      canDeleteEveryone = true;
    }
  } else {
    // Not mine
    if (isReqAdminOrOwner) {
      const isSenderOwner = chat.groupAdmin === senderId;
      if (chat.groupAdmin === currentUserId) canDeleteEveryone = true; // Owner can delete anyone's
      else if (!isSenderOwner) canDeleteEveryone = true; // Admin can delete anyone except owner's
    }
  }

  const readByOthers = (message.readBy || []).filter(
    id => id?.toString() !== currentUserId && id?.toString() !== senderId
  );
  const deliveredToOthers = (message.deliveredTo || []).filter(
    id => id?.toString() !== currentUserId && id?.toString() !== senderId
  );
  const isRead = readByOthers.length > 0;
  const isDelivered = deliveredToOthers.length > 0;

  const getTickColor = () => {
    if (isRead) {
      if (themeObj.id === 'forest' || themeObj.id === 'emerald' || themeObj.id === 'cyberpunk' || themeObj.id === 'solar' || themeObj.id === 'sunset' || themeObj.id === 'ocean' || themeObj.id === 'rose') return '#000000'; // Black for high visibility on bright colors
      if (themeObj.id === 'midnight' || themeObj.id === 'obsidian') return '#00FFFF'; // Bright cyan for black themes
      return '#FFD700'; // Gold for deep purple/blue themes
    }
    return 'rgba(255,255,255,0.6)'; // Grey/transparent for Delivered/Sent
  };
  
  // Resolve user IDs to display names from chatUsers
  const resolveUser = (id) => {
    const u = chatUsers.find(u => u._id === id || u._id?.toString() === id?.toString());
    return u ? (u.displayName || u.username) : 'Unknown';
  };

  if (message.deletedForEveryone) {
    // Use content marker set by the store to distinguish the two cases
    const isDisappeared = message.content === 'Message disappeared';
    const isAdminDeleted = message.content && message.content.startsWith('Message deleted by admin');
    return (
      <View style={[styles.row, isMine && styles.rowMine]}>
        <View style={styles.deletedBubble}>
          <Ionicons name={isDisappeared ? "time-outline" : isAdminDeleted ? "shield-checkmark-outline" : "ban-outline"} size={14} color={Colors.dark.muted} />
          <Text style={styles.deletedText}>
            {isDisappeared ? 'Message disappeared' : isAdminDeleted ? message.content : 'Permanently deleted'}
          </Text>
        </View>
      </View>
    );
  }

  let isJoinReq = message.messageType === 'join_request';
  let reqData = null;
  
  // Backwards compatibility for when join_request enum was missing and it saved as text
  if (!isJoinReq && message.isSystemMessage && message.content?.startsWith('{') && message.content?.includes('userId')) {
    try {
      reqData = JSON.parse(message.content);
      isJoinReq = true;
    } catch (e) {}
  } else if (isJoinReq) {
    try { reqData = JSON.parse(message.content); } catch (e) {
      reqData = { text: message.content };
    }
  }

  if (message.isSystemMessage && !isJoinReq) {
    return (
      <View style={styles.systemRow}>
        <Text style={styles.systemText}>{message.content}</Text>
      </View>
    );
  }

  if (isJoinReq && reqData) {
    const myId = currentUser?._id?.toString();
    const amIAdmin = isGroup && chat && (
      (chat.groupAdmin?._id || chat.groupAdmin)?.toString() === myId ||
      chat.admins?.some(a => (a._id || a).toString() === myId)
    );
    const isProcessed = !!message.inviteAccepted;

    return (
      <View style={[styles.systemRow, { marginVertical: 10 }]}>
        <View style={{ backgroundColor: Colors.dark.card, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.dark.border, width: '80%', alignItems: 'center' }}>
          <Text style={[styles.systemText, { marginBottom: 10, color: '#FFF' }]}>{reqData.text || 'Requested to join'}</Text>
          {amIAdmin && !isProcessed && reqData.userId && (
            <View style={{ flexDirection: 'row', gap: 20 }}>
              <TouchableOpacity 
                style={{ backgroundColor: '#EF4444', padding: 8, borderRadius: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
                onPress={async () => {
                  try {
                    const api = require('../services/api').default;
                    await api.put(`/chats/group/${chat._id}/decline-request`, { userId: reqData.userId });
                  } catch (e) {
                    if (showAlert) showAlert('Error', 'Failed to decline');
                  }
                }}
              >
                <Ionicons name="close" size={20} color="#FFF" />
              </TouchableOpacity>

              <TouchableOpacity 
                style={{ backgroundColor: '#10B981', padding: 8, borderRadius: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
                onPress={async () => {
                  try {
                    const api = require('../services/api').default;
                    await api.put(`/chats/group/${chat._id}/accept-request`, { userId: reqData.userId });
                  } catch (e) {
                    if (showAlert) showAlert('Error', 'Failed to accept');
                  }
                }}
              >
                <Ionicons name="checkmark" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>
          )}
          {isProcessed && (
             <Text style={{ fontSize: 12, color: Colors.dark.muted, fontStyle: 'italic' }}>Processed</Text>
          )}
        </View>
      </View>
    );
  }

  if (message.messageType === 'group_invite') {
    let inviteData = {};
    try {
      inviteData = JSON.parse(message.content);
    } catch (e) {}

    const isExpired = !!message.inviteAccepted;

    return (
      <View style={[styles.row, isMine ? styles.rowMine : styles.rowTheirs]}>
        <View style={[styles.bubble, styles.inviteBubble]}>
          <View style={styles.inviteHeader}>
            <Ionicons
              name={isExpired ? 'people-circle-outline' : 'people-circle'}
              size={32}
              color={isExpired ? Colors.dark.muted : Colors.primary}
            />
            <Text style={[styles.inviteTitle, isExpired && { color: Colors.dark.muted }]}>
              Group Invitation
            </Text>
          </View>
          <Text style={styles.inviteText}>
            {isMine ? 'You invited them to join ' : 'You have been invited to join '}
            <Text style={{ fontWeight: '700' }}>{inviteData.groupName}</Text>
          </Text>
          {!isMine && (
            <TouchableOpacity
              style={[styles.joinBtn, isExpired && styles.joinBtnExpired]}
              disabled={isExpired}
              onPress={async () => {
                const useChatStore = require('../store/useChatStore').default;

                const existingChat = useChatStore.getState().chats.find(c => c._id === inviteData.groupId);
                if (existingChat) {
                  if (showAlert) showAlert('Notice', 'You are already in the group!');
                  navigation.push('ChatRoom', { chat: existingChat });
                  return;
                }

                try {
                  const api = require('../services/api').default;
                  const { data } = await api.put(`/chats/group/${inviteData.groupId}/add`, { userId: undefined });
                  useChatStore.getState().addChat(data.chat);
                  navigation.push('ChatRoom', { chat: data.chat });
                } catch (e) {
                  const errorMsg = e.response?.data?.message || 'Failed to join group';
                  if (errorMsg === 'User already in group') {
                    if (showAlert) showAlert('Notice', 'You are already in the group!');
                  } else {
                    if (showAlert) showAlert('Error', errorMsg);
                  }
                }
              }}
            >
              <Ionicons
                name={isExpired ? 'ban-outline' : 'enter-outline'}
                size={15}
                color="#FFF"
                style={{ marginRight: 6 }}
              />
              <Text style={styles.joinBtnText}>
                {isExpired ? 'Link Expired' : 'Join Group'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  const renderPoll = () => {
    if (!message.pollData) return null;
    const { question, options, multipleAnswers } = message.pollData;
    const totalVotes = options.reduce((sum, opt) => sum + (opt.votes?.length || 0), 0);
    
    return (
      <View style={styles.pollContainer}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 }}>
          <Ionicons name="bar-chart" size={18} color={isMine ? '#FFF' : Colors.primary} />
          <Text style={[styles.pollQuestion, { color: isMine ? '#FFF' : Colors.dark.text }]}>
            {question}
          </Text>
        </View>
        <Text style={[styles.pollSubtitle, { color: isMine ? 'rgba(255,255,255,0.7)' : Colors.dark.muted }]}>
          {multipleAnswers ? 'Select one or more options' : 'Select one option'}
        </Text>
        
        {options.map((opt, index) => {
          const voteCount = opt.votes?.length || 0;
          const percentage = totalVotes > 0 ? (voteCount / totalVotes) * 100 : 0;
          const hasVoted = opt.votes?.some(v => v.toString() === currentUser?._id?.toString());
          const hasAlreadyVoted = options.some(o => o.votes?.some(v => v.toString() === currentUser?._id?.toString()));
          
          return (
            <TouchableOpacity 
              key={opt._id || index}
              activeOpacity={hasAlreadyVoted ? 1 : 0.8}
              disabled={hasAlreadyVoted}
              style={[
                styles.pollOption, 
                hasVoted && (isMine ? styles.pollOptionVotedMine : styles.pollOptionVotedTheirs)
              ]}
              onPress={async () => {
                try {
                  const api = require('../services/api').default;
                  await api.post(`/messages/${message._id}/vote`, { optionId: opt._id });
                } catch (e) {
                  console.log('Error voting on poll:', e);
                }
              }}
            >
              <View style={[styles.pollProgress, { width: `${percentage}%`, backgroundColor: isMine ? 'rgba(255,255,255,0.2)' : Colors.primary + '20' }]} />
              <View style={styles.pollOptionContent}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 }}>
                  <View style={[styles.pollCheckbox, hasVoted && (isMine ? { borderColor: '#FFF', backgroundColor: '#FFF' } : { borderColor: Colors.primary, backgroundColor: Colors.primary })]}>
                    {hasVoted && <Ionicons name="checkmark" size={12} color={isMine ? Colors.primary : '#FFF'} />}
                  </View>
                  <Text style={[styles.pollOptionText, { color: isMine ? '#FFF' : Colors.dark.text }]} numberOfLines={2}>
                    {opt.text}
                  </Text>
                </View>
                {voteCount > 0 && (
                  <Text style={[styles.pollVoteCount, { color: isMine ? 'rgba(255,255,255,0.8)' : Colors.dark.muted }]}>
                    {voteCount}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
        <Text style={[styles.pollTotalVotes, { color: isMine ? 'rgba(255,255,255,0.7)' : Colors.dark.muted }]}>
          {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
        </Text>
      </View>
    );
  };

  const renderStoryReply = () => {
    if (!message.storyData) return null;
    const { mediaUrl, mediaType, caption } = message.storyData;
    
    // Determine who owns the moment. If I sent the reply, the moment belongs to the other user.
    // Since message.chat is populated, we can infer the other user in a DM.
    let storyOwner = message.sender; // fallback
    if (message.chat && !message.chat.isGroupChat) {
      storyOwner = message.chat.users?.find(u => u._id !== message.sender._id) || message.sender;
    }
    
    const fakeMoment = {
      _id: message._id + '_moment',
      mediaUrl,
      mediaType,
      caption,
      createdAt: message.createdAt
    };
    
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => {
          navigation.navigate('StoryViewer', { stories: [fakeMoment], user: storyOwner });
        }}
        style={[styles.storyReplyWrap, isMine ? styles.storyReplyMine : styles.storyReplyTheirs]}
      >
        <View style={styles.storyReplyBar} />
        {mediaUrl ? (
          <Image source={{ uri: mediaUrl }} style={styles.storyReplyImage} resizeMode="cover" />
        ) : (
          <View style={[styles.storyReplyImage, { backgroundColor: Colors.dark.border, alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name="image-outline" size={16} color={Colors.dark.muted} />
          </View>
        )}
        <View style={styles.storyReplyContent}>
          <Text style={styles.storyReplyTitle}>Replied to your Moment</Text>
          {caption ? (
            <Text style={styles.storyReplyCaption} numberOfLines={2}>{caption}</Text>
          ) : (
            <Text style={[styles.storyReplyCaption, { color: Colors.dark.muted }]}>{mediaType === 'video' ? 'Video' : 'Photo'}</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderMedia = () => {
    if (!message.mediaUrl) return null;

    if (message.isSelfDestructing && !isMine) {
      const isVideo = message.mediaType === 'video';
      const label = isVideo ? 'Disappearing Video' : 'Disappearing Photo';
      const sub = isVideo ? 'View Once' : `${message.destructAfterSeconds || 5}s • Tap to view`;
      return (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => !message.isOptimistic && onMediaPress?.(message.mediaUrl, message.mediaType)}
          style={styles.disappearingMediaPlaceholder}
        >
          <View style={styles.disappearingMediaIconWrap}>
            <Ionicons name="flame" size={32} color="#EF4444" />
          </View>
          <Text style={styles.disappearingMediaTitle}>{label}</Text>
          <Text style={styles.disappearingMediaSub}>{sub}</Text>
        </TouchableOpacity>
      );
    }

    if (message.mediaType === 'image') {
      return (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => !message.isOptimistic && onMediaPress?.(message.mediaUrl, 'image')}
          style={{ position: 'relative' }}
        >
          <Image source={{ uri: message.mediaUrl }} style={[styles.mediaImage, !message.content && { marginBottom: 0 }]} resizeMode="cover" />
          {message.isSelfDestructing && (
            <View style={styles.previewTimerBadge}>
              <Ionicons name="flame" size={12} color="#FFF" style={{ marginRight: 2 }} />
              <Text style={styles.previewTimerText}>{message.destructAfterSeconds || 5}s</Text>
            </View>
          )}
          {message.isLive && (
            <View style={styles.liveBadge}>
              <Ionicons name="videocam" size={10} color="#FFF" style={{ marginRight: 3 }} />
              <Text style={styles.liveBadgeText}>LIVE</Text>
            </View>
          )}
          {message.isOptimistic && (
            <View style={styles.mediaLoaderOverlay}>
              <ActivityIndicator color="#FFF" size="small" />
            </View>
          )}
        </TouchableOpacity>
      );
    }
    if (message.mediaType === 'video') {
      return (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => !message.isOptimistic && onMediaPress?.(message.mediaUrl, 'video')}
          style={styles.videoContainer}
        >
          <PreviewVideo url={message.mediaUrl} />
          {message.isSelfDestructing && (
            <View style={styles.previewTimerBadge}>
              <Ionicons name="flame" size={12} color="#FFF" style={{ marginRight: 2 }} />
              <Text style={styles.previewTimerText}>{message.destructAfterSeconds || 5}s</Text>
            </View>
          )}
          {message.isLive && (
            <View style={styles.liveBadge}>
              <Ionicons name="videocam" size={10} color="#FFF" style={{ marginRight: 3 }} />
              <Text style={styles.liveBadgeText}>LIVE</Text>
            </View>
          )}
          {!message.isOptimistic && (
            <View style={styles.playButtonOverlay}>
              <Ionicons name="play" size={30} color="#FFF" />
            </View>
          )}
          {message.isOptimistic && (
            <View style={styles.mediaLoaderOverlay}>
              <ActivityIndicator color="#FFF" size="small" />
            </View>
          )}
        </TouchableOpacity>
      );
    }
    if (message.mediaType === 'voice' || message.mediaType === 'audio') {
      return (
        <AudioPlayer url={message.mediaUrl} isMine={isMine} />
      );
    }
    if (message.mediaType === 'document') {
      return (
        <View style={styles.docRow}>
          <Ionicons name="document" size={24} color={isMine ? '#FFF' : Colors.primary} />
          <Text style={[styles.docName, { color: isMine ? '#FFF' : Colors.dark.text }]} numberOfLines={1}>
            {message.fileName || 'Document'}
          </Text>
        </View>
      );
    }
    return null;
  };

  const openModal = () => { 
    if (message.deletedForEveryone) return;
    if (message.isOptimistic) return;
    setTab('actions'); 
    setShowActions(true); 
  };

  const isRelayBotChat = !chat?.isGroupChat && chat?.users?.some(u => u.username === 'relay_bot' || u.username === 'relay');
  const isMicaChat = !chat?.isGroupChat && chat?.users?.some(u => u.username === 'mica');
  const isBotChat = isRelayBotChat || isMicaChat;

  const actions = [
    {
      icon: 'checkmark-circle-outline', label: 'Select',
      action: () => { onSelectToggle?.(); setShowActions(false); },
    },
    {
      icon: 'arrow-undo-outline', label: 'Reply',
      action: () => { onReply?.(message); setShowActions(false); },
    },
    {
      icon: 'copy-outline', label: 'Copy',
      action: () => { 
        Clipboard.setString(message.content || ''); 
        setShowActions(false); 
        if (showAlert) showAlert('Copied!', 'Message text copied to clipboard.');
        else Alert.alert('Copied!'); 
      },
    },
    ...(chat?.allowForwarding !== false && !isBotChat ? [{
      icon: 'arrow-redo-outline', label: 'Forward',
      action: () => { setShowActions(false); onForward?.(message); },
    }] : []),
    ...(!isMine ? [{
      icon: 'trash-outline', label: 'Delete for me',
      color: Colors.camera,
      action: () => { onDelete?.(message._id, 'me'); setShowActions(false); },
    }] : []),
    ...(canDeleteEveryone ? [{
      icon: 'trash-bin-outline', label: 'Delete for everyone',
      color: Colors.camera,
      action: () => { onDelete?.(message._id, 'everyone'); setShowActions(false); },
    }] : []),
    ...(isMine ? [{
      icon: 'trash-outline', label: 'Delete for me',
      color: Colors.camera,
      action: () => { onDelete?.(message._id, 'me'); setShowActions(false); },
    }] : []),
    ...(readByOthers.length > 0 ? [{
      icon: 'checkmark-done-outline', label: `Read by ${readByOthers.length}`,
      action: () => setTab('readby'),
    }] : []),
  ];

  // Group reactions by emoji for display
  const groupedReactions = () => {
    const map = {};
    (message.reactions || []).forEach(r => {
      if (!map[r.emoji]) map[r.emoji] = { emoji: r.emoji, count: 0, hasMe: false };
      map[r.emoji].count++;
      if (r.user === currentUser?._id || r.user?.toString?.() === currentUser?._id) map[r.emoji].hasMe = true;
    });
    return Object.values(map);
  };

  // Can edit: own text-only messages within 15 minutes
  const canEdit = isMine
    && !message.mediaUrl
    && !message.deletedForEveryone
    && (!message.messageType || message.messageType === 'text')
    && (Date.now() - new Date(message.createdAt).getTime()) / 60000 <= 15;

  const renderFormattedText = (text) => {
    if (!text) return null;
    const parts = text.split(/(\*\*.*?\*\*|\[\[.*?\|.*?\]\])/g);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <Text key={index} style={{ fontWeight: 'bold' }}>{part.slice(2, -2)}</Text>;
      }
      if (part.startsWith('[[') && part.endsWith(']]')) {
        const inner = part.slice(2, -2);
        const [groupId, ...nameParts] = inner.split('|');
        const groupName = nameParts.join('|');
        return (
          <Text 
            key={index} 
            style={{ fontWeight: 'bold', color: Colors.primary, textDecorationLine: 'underline' }}
            onPress={() => {
              const useChatStore = require('../store/useChatStore').default;
              const existingChat = useChatStore.getState().chats.find(c => c._id === groupId);
              if (existingChat) {
                navigation.push('ChatRoom', { chat: existingChat });
              } else {
                navigation.push('GroupPreview', { groupId });
              }
            }}
          >
            {groupName}
          </Text>
        );
      }
      return <Text key={index}>{part}</Text>;
    });
  };

  // LEFT actions = revealed by LEFT-TO-RIGHT drag → Reply
  const renderLeftActions = () => {
    return (
      <View style={{ width: 56, justifyContent: 'center', alignItems: 'center', paddingLeft: 8 }}>
        <View style={{ backgroundColor: Colors.primary + '22', borderRadius: 12, padding: 10 }}>
          <Ionicons name="arrow-undo-outline" size={22} color={Colors.primary} />
        </View>
      </View>
    );
  };

  // RIGHT actions = revealed by RIGHT-TO-LEFT drag → Edit (own text messages only)
  const renderRightActions = () => {
    if (!canEdit) return null;
    return (
      <View style={{ width: 56, justifyContent: 'center', alignItems: 'center', paddingRight: 8 }}>
        <View style={{ backgroundColor: Colors.primary + '22', borderRadius: 12, padding: 10 }}>
          <Ionicons name="pencil-outline" size={22} color={Colors.primary} />
        </View>
      </View>
    );
  };

  return (
    <>
      <Swipeable
        ref={swipeableRef}
        friction={2}
        overshootLeft={false}
        overshootRight={false}
        renderLeftActions={renderLeftActions}
        renderRightActions={renderRightActions}
        onSwipeableWillOpen={(direction) => {
          swipeableRef.current?.close();
          if (direction === 'left') {
            // LEFT-TO-RIGHT drag → Reply
            onReply?.(message);
          } else if (direction === 'right') {
            // RIGHT-TO-LEFT drag → Edit
            if (canEdit) onEdit?.(message);
          }
        }}
        onSwipeableOpen={() => swipeableRef.current?.close()}
      >
      <Pressable
        onLongPress={openModal}
        onPress={() => {
          if (selectionMode) {
            onSelectToggle?.();
          }
        }}
        style={[
          styles.row,
          isMine ? styles.rowMine : styles.rowTheirs,
          isSelected && { backgroundColor: Colors.primary + '33' },
          message._id === highlightedMessageId && { backgroundColor: 'rgba(124, 58, 237, 0.15)' }
        ]}
      >
        {selectionMode && (
          <View style={{ justifyContent: 'center', paddingRight: 10 }}>
            {isSelected ? (
              <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
            ) : (
              <Ionicons name="ellipse-outline" size={22} color={Colors.dark.muted} />
            )}
          </View>
        )}
        {/* Sender avatar — group chats only, for other users' messages */}
        {isGroup && !isMine && message.sender && (
          <TouchableOpacity
            onPress={() => onSenderPress?.(message.sender)}
            style={styles.senderAvatarWrap}
            activeOpacity={0.7}
          >
            {message.sender.profilePicture ? (
              <Image source={{ uri: message.sender.profilePicture }} style={styles.senderAvatar} />
            ) : (
              <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.senderAvatar}>
                <Text style={styles.senderAvatarInitial}>
                  {(message.sender.displayName || message.sender.username || '?').charAt(0).toUpperCase()}
                </Text>
              </LinearGradient>
            )}
          </TouchableOpacity>
        )}

        {/* Sender name — group chats only, for other users' messages */}
        {isGroup && !isMine && message.sender && (
          <View style={styles.groupContentCol}>
            <TouchableOpacity
              onPress={() => onSenderPress?.(message.sender)}
              style={styles.senderNameWrap}
              activeOpacity={0.7}
            >
              <Text style={styles.senderName}>
                {message.sender.displayName || message.sender.username}
              </Text>
            </TouchableOpacity>


            {/* Bubble */}
            <View
              style={[
                styles.bubble,
                styles.bubbleTheirs,
                message.mediaType && styles.bubbleWithMedia,
                { maxWidth: '100%' },
                message.messageType === 'poll' && { width: 250, maxWidth: '90%' },
                message._id === highlightedMessageId && { backgroundColor: Colors.primary + '33', borderWidth: 1, borderColor: Colors.accent }
              ]}
            >
              {message.replyTo && (
                <TouchableOpacity
                  onPress={() => onReplyPress?.(message.replyTo._id || message.replyTo)}
                  activeOpacity={0.7}
                  style={[styles.replyContext, styles.replyContextTheirs]}
                >
                  <View style={styles.replyBorderBar} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.replyContextName}>
                      {message.replyTo.sender?.displayName || message.replyTo.sender?.username}
                    </Text>
                    <Text style={styles.replyContextContent} numberOfLines={1}>
                      {message.replyTo.content || '📎 Media'}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
              {renderMedia()}
              {message.messageType === 'poll' && renderPoll()}
              {message.messageType === 'story_reply' && renderStoryReply()}
              {message.content ? <Text style={[styles.textTheirs, message.mediaType && styles.textWithMedia]}>{renderFormattedText(message.content)}</Text> : null}
              <View style={[styles.metaRow, message.mediaType && !message.content && styles.metaRowMediaOnly]}>
                {message.isSelfDestructing && timeLeft > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginRight: 6 }}>
                    <Ionicons name="flame" size={12} color="#EF4444" />
                    <Text style={{ fontSize: 11, color: "#EF4444", fontWeight: 'bold' }}>{timeLeft}s</Text>
                  </View>
                )}
                {message.isForwarded && <Text style={[styles.forwardedTheirs, message.mediaType && !message.content && styles.timeMediaOnly]}>↪ Forwarded</Text>}
                <Text style={[styles.timeTheirs, message.mediaType && !message.content && styles.timeMediaOnly]}>{formatTime(message.createdAt)}</Text>
              </View>
            </View>

          </View>
        )}

        {/* Non-group or isMine — render bubble directly (no wrapper View) */}
        {(!isGroup || isMine || !message.sender) && (
          <>

            {/* Bubble */}
            {message.deletedForEveryone ? (
              <View
                style={[
                  styles.bubble,
                  isMine ? styles.bubbleMine : styles.bubbleTheirs,
                  {
                    backgroundColor: isMine ? Colors.primary + '80' : Colors.dark.surface,
                    borderWidth: 1,
                    borderColor: message._id === highlightedMessageId ? Colors.accent : (isMine ? Colors.primary : Colors.dark.border)
                  }
                ]}
              >
                {message.content === 'Message disappeared' ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="time-outline" size={16} color={isMine ? 'rgba(255,255,255,0.7)' : Colors.dark.muted} />
                    <Text style={[isMine ? styles.textMine : styles.textTheirs, { fontStyle: 'italic', color: isMine ? 'rgba(255,255,255,0.7)' : Colors.dark.muted }]}>
                      Message disappeared
                    </Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="ban-outline" size={16} color={isMine ? 'rgba(255,255,255,0.7)' : Colors.dark.muted} />
                    <Text style={[isMine ? styles.textMine : styles.textTheirs, { fontStyle: 'italic', color: isMine ? 'rgba(255,255,255,0.7)' : Colors.dark.muted }]}>
                      Permanently deleted
                    </Text>
                  </View>
                )}
                <View style={styles.metaRow}>
                  <Text style={isMine ? styles.timeMine : styles.timeTheirs}>{formatTime(message.createdAt)}</Text>
                </View>
              </View>
            ) : isMine ? (
              <LinearGradient
                colors={message._id === highlightedMessageId ? [Colors.accent, Colors.accent] : themeColors}
                style={[
                  styles.bubble, 
                  styles.bubbleMine,
                  message.mediaType && styles.bubbleWithMedia,
                  message.messageType === 'poll' && { width: 250, maxWidth: '90%' }
                ]}
              >
                {message.replyTo && (
                  <TouchableOpacity
                    onPress={() => onReplyPress?.(message.replyTo._id || message.replyTo)}
                    activeOpacity={0.7}
                    style={[styles.replyContext, styles.replyContextMine]}
                  >
                    <View style={styles.replyBorderBar} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.replyContextName}>
                        {message.replyTo.sender?.displayName || message.replyTo.sender?.username}
                      </Text>
                      <Text style={[styles.replyContextContent, { color: 'rgba(255,255,255,0.8)' }]} numberOfLines={1}>
                        {message.replyTo.content || '📎 Media'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
                {renderMedia()}
                {message.messageType === 'poll' && renderPoll()}
                {message.messageType === 'story_reply' && renderStoryReply()}
                {message.content ? <Text style={[styles.textMine, message.mediaType && styles.textWithMedia]}>{renderFormattedText(message.content)}</Text> : null}
                <View style={[styles.metaRow, message.mediaType && !message.content && styles.metaRowMediaOnly]}>
                  {message.isSelfDestructing && timeLeft > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginRight: 6 }}>
                      <Ionicons name="flame" size={12} color="#FFF" />
                      <Text style={{ fontSize: 11, color: "#FFF", fontWeight: 'bold' }}>{timeLeft}s</Text>
                    </View>
                  )}
                  {message.isForwarded && <Text style={styles.forwarded}>↪ Forwarded</Text>}
                  {message.isEdited && <Text style={styles.forwarded}>✎ Edited</Text>}
                  <Text style={styles.timeMine}>{formatTime(message.createdAt)}</Text>
                  {message.isOptimistic ? (
                    <Ionicons name="time-outline" size={13} color="rgba(255,255,255,0.6)" />
                  ) : (
                    <Ionicons
                      name={isRead || isDelivered ? 'checkmark-done' : 'checkmark'}
                      size={13}
                      color={getTickColor()}
                    />
                  )}
                </View>
              </LinearGradient>
            ) : (
              <View
                style={[
                  styles.bubble,
                  styles.bubbleTheirs,
                  message.mediaType && styles.bubbleWithMedia,
                  message.messageType === 'poll' && { width: 250, maxWidth: '90%' },
                  message._id === highlightedMessageId && { backgroundColor: Colors.primary + '33', borderWidth: 1, borderColor: Colors.accent }
                ]}
              >
                {message.replyTo && (
                  <TouchableOpacity
                    onPress={() => onReplyPress?.(message.replyTo._id || message.replyTo)}
                    activeOpacity={0.7}
                    style={[styles.replyContext, styles.replyContextTheirs]}
                  >
                    <View style={styles.replyBorderBar} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.replyContextName}>
                        {message.replyTo.sender?.displayName || message.replyTo.sender?.username}
                      </Text>
                      <Text style={styles.replyContextContent} numberOfLines={1}>
                        {message.replyTo.content || '📎 Media'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
                {renderMedia()}
                {message.messageType === 'story_reply' && renderStoryReply()}
                {message.content ? <Text style={[styles.textTheirs, message.mediaType && styles.textWithMedia]}>{renderFormattedText(message.content)}</Text> : null}
                <View style={[styles.metaRow, message.mediaType && !message.content && styles.metaRowMediaOnly]}>
                  {message.isSelfDestructing && timeLeft > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginRight: 6 }}>
                      <Ionicons name="flame" size={12} color="#EF4444" />
                      <Text style={{ fontSize: 11, color: "#EF4444", fontWeight: 'bold' }}>{timeLeft}s</Text>
                    </View>
                  )}
                  {message.isForwarded && <Text style={[styles.forwardedTheirs, message.mediaType && !message.content && styles.timeMediaOnly]}>↪ Forwarded</Text>}
                  {message.isEdited && <Text style={[styles.forwardedTheirs, message.mediaType && !message.content && styles.timeMediaOnly]}>✎ Edited</Text>}
                  <Text style={[styles.timeTheirs, message.mediaType && !message.content && styles.timeMediaOnly]}>{formatTime(message.createdAt)}</Text>
                </View>
              </View>
            )}

          </>
        )}
      </Pressable>
    </Swipeable>

      {/* Reactions — below the bubble */}
      {message.reactions?.length > 0 && (
        <View style={[
          styles.reactionsRow, 
          isMine ? styles.reactionsRowMine : styles.reactionsRowTheirs,
          { paddingLeft: (isGroup && !isMine && message.sender) ? 52 : 16 }
        ]}>
          {groupedReactions().map((g, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.reactionChip, g.hasMe && styles.reactionChipMine]}
              onPress={() => {
                const totalReactions = message.reactions.length;
                const onlyMe = totalReactions === 1 && g.hasMe;
                if (onlyMe) {
                  onReact?.(message._id, g.emoji);
                } else {
                  setTab('reactionsList');
                  setShowActions(true);
                }
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.reactionEmoji}>{g.emoji}</Text>
              <Text style={[styles.reactionCount, g.hasMe && styles.reactionCountMine]}>{g.count}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Action Modal (Vertical Bottom Sheet) */}
      <Modal visible={showActions} transparent animationType="slide" onRequestClose={() => setShowActions(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowActions(false)}>
          <View style={styles.actionMenu}>
            <View style={styles.sheetHandle} />

            {tab === 'actions' ? (
              <>
                {/* Quick reactions */}
                <View style={styles.emojiRow}>
                  {REACTIONS.map(emoji => (
                    <TouchableOpacity
                      key={emoji}
                      onPress={() => { onReact?.(message._id, emoji); setShowActions(false); }}
                      style={styles.emojiBtn}
                    >
                      <Text style={styles.emoji}>{emoji}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    onPress={() => { setShowActions(false); setShowEmojiPicker(true); }}
                    style={[styles.emojiBtn, { backgroundColor: Colors.dark.card, borderRadius: 20, alignItems: 'center', justifyContent: 'center', width: 40, height: 40 }]}
                  >
                    <Ionicons name="add" size={24} color={Colors.dark.text} />
                  </TouchableOpacity>
                </View>
                <View style={styles.actionDivider} />

                <View style={styles.sheetActionsWrap}>
                  {actions.map(({ icon, label, action, color }) => (
                    <TouchableOpacity key={label} style={styles.actionItem} onPress={action}>
                      <Ionicons name={icon} size={20} color={color || Colors.dark.text} />
                      <Text style={[styles.actionLabel, color && { color }]}>{label}</Text>
                      {label.startsWith('Read by') && (
                        <Ionicons name="chevron-forward" size={16} color={Colors.dark.muted} style={{ marginLeft: 'auto' }} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Cancel Button */}
                <TouchableOpacity style={styles.sheetCancelBtn} onPress={() => setShowActions(false)} activeOpacity={0.8}>
                  <Text style={styles.sheetCancelText}>Cancel</Text>
                </TouchableOpacity>
              </>
            ) : tab === 'readby' ? (
              /* Read by list */
              <>
                <TouchableOpacity style={styles.backRow} onPress={() => setTab('actions')}>
                  <Ionicons name="arrow-back" size={18} color={Colors.primary} />
                  <Text style={styles.backLabel}>Read by</Text>
                </TouchableOpacity>
                <View style={styles.actionDivider} />
                <ScrollView style={{ maxHeight: 240 }}>
                  {readByOthers.length === 0 ? (
                    <Text style={styles.noReads}>Not read yet</Text>
                  ) : (
                    readByOthers.map((id, i) => (
                      <View key={i} style={styles.readByRow}>
                        <View style={styles.readByAvatar}>
                          <Text style={styles.readByInitial}>
                            {resolveUser(id).charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View>
                          <Text style={styles.readByName}>{resolveUser(id)}</Text>
                          <Text style={styles.readByTime}>
                            {formatDate(message.updatedAt)}
                          </Text>
                        </View>
                        <Ionicons name="checkmark-done" size={16} color={Colors.accentGreen} style={{ marginLeft: 'auto' }} />
                      </View>
                    ))
                  )}
                </ScrollView>

                {/* Cancel Button */}
                <TouchableOpacity style={styles.sheetCancelBtn} onPress={() => setShowActions(false)} activeOpacity={0.8}>
                  <Text style={styles.sheetCancelText}>Cancel</Text>
                </TouchableOpacity>
              </>
            ) : (
              /* Reactions List */
              <>
                <View style={styles.backRow}>
                  <TouchableOpacity onPress={() => setTab('actions')} style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="arrow-back" size={18} color={Colors.primary} />
                    <Text style={styles.backLabel}>Reactions</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.actionDivider} />
                <ScrollView style={{ maxHeight: 240 }}>
                  {message.reactions?.map((r, i) => {
                    const rUserId = r.user?._id || r.user;
                    const isMe = rUserId?.toString() === currentUser?._id?.toString();
                    return (
                      <View key={i} style={styles.readByRow}>
                        <View style={styles.readByAvatar}>
                          <Text style={styles.readByInitial}>
                            {resolveUser(rUserId).charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.readByName}>{isMe ? 'You' : resolveUser(rUserId)}</Text>
                        </View>
                        <Text style={{ fontSize: 20, marginRight: isMe ? 16 : 0 }}>{r.emoji}</Text>
                        {isMe && (
                          <TouchableOpacity onPress={() => { onReact?.(message._id, r.emoji); setShowActions(false); }}>
                            <Text style={{ color: Colors.camera, fontSize: 13, fontWeight: 'bold' }}>Remove</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </ScrollView>
                <TouchableOpacity style={styles.sheetCancelBtn} onPress={() => setShowActions(false)} activeOpacity={0.8}>
                  <Text style={styles.sheetCancelText}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </Pressable>
      </Modal>

      <EmojiPicker 
        open={showEmojiPicker} 
        onClose={() => setShowEmojiPicker(false)} 
        onEmojiSelected={(emojiObject) => { 
          onReact?.(message._id, emojiObject.emoji); 
          setShowEmojiPicker(false); 
        }} 
        theme={{
          backdrop: '#16161888',
          knob: Colors.dark.border,
          container: Colors.dark.bg,
          header: Colors.dark.text,
          skinTonesContainer: Colors.dark.card,
          category: {
            icon: Colors.dark.muted,
            iconActive: Colors.primary,
            container: Colors.dark.card,
            containerActive: Colors.primary + '20',
          },
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 12, marginVertical: 2, flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '82%', minWidth: 90, borderRadius: 20, padding: 12, elevation: 2 },
  bubbleWithMedia: { padding: 4 },
  bubbleMine: { borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: Colors.dark.surface, borderBottomLeftRadius: 4 },
  textMine: { color: '#FFF', fontSize: 15, lineHeight: 20 },
  textTheirs: { color: Colors.dark.text, fontSize: 15, lineHeight: 20 },
  textWithMedia: { paddingHorizontal: 8, paddingBottom: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, justifyContent: 'flex-end', flexWrap: 'nowrap' },
  metaRowMediaOnly: {
    position: 'absolute', bottom: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 12, margin: 0, marginTop: 0
  },
  timeMine: { fontSize: 11, color: 'rgba(255,255,255,0.7)', flexShrink: 0 },
  timeTheirs: { fontSize: 11, color: Colors.dark.muted, flexShrink: 0 },
  timeMediaOnly: { color: 'rgba(255,255,255,0.9)' },
  forwarded: { fontSize: 10, color: 'rgba(255,255,255,0.6)', fontStyle: 'italic' },
  forwardedTheirs: { fontSize: 10, color: Colors.dark.muted, fontStyle: 'italic' },
  mediaImage: { width: 220, height: 180, borderRadius: 12, marginBottom: 6 },
  audioRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  audioBarWrap: { flex: 1, paddingVertical: 8, justifyContent: 'center' },
  audioBar: { height: 3, backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: 2, overflow: 'hidden' },
  audioProgress: { height: '100%' },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, minWidth: 160 },
  docName: { fontSize: 13, flex: 1 },
  replyContext: {
    flexDirection: 'row', 
    marginBottom: 6, 
    borderRadius: 8, 
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginHorizontal: -4,
    marginTop: -4,
    overflow: 'hidden'
  },
  replyContextMine: { backgroundColor: 'rgba(0,0,0,0.2)' },
  replyContextTheirs: { backgroundColor: 'rgba(255,255,255,0.06)' },
  replyBorderBar: { width: 3, backgroundColor: Colors.accentGreen, borderRadius: 2, marginRight: 8 },
  replyContextName: { fontSize: 12, fontWeight: '700', color: Colors.accentGreen },
  replyContextContent: { fontSize: 12, color: Colors.dark.muted },
  reactionsRow: {
    flexDirection: 'row', gap: 4, paddingHorizontal: 16, marginTop: 2, marginBottom: 4,
  },
  reactionsRowMine: { justifyContent: 'flex-end' },
  reactionsRowTheirs: { justifyContent: 'flex-start' },
  reactionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.dark.card, borderRadius: 12,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  reactionChipMine: {
    borderColor: Colors.primary + '60', backgroundColor: Colors.primary + '15',
  },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { fontSize: 11, color: Colors.dark.muted, fontWeight: '600' },
  reactionCountMine: { color: Colors.primary },
  deletedBubble: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.dark.surface, borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: Colors.dark.border,
  },
  deletedText: { color: Colors.dark.muted, fontSize: 13, fontStyle: 'italic' },
  systemRow: { alignItems: 'center', marginVertical: 8, paddingHorizontal: 24 },
  systemText: {
    fontSize: 12, color: Colors.dark.muted, fontStyle: 'italic', textAlign: 'center',
    backgroundColor: Colors.dark.surface, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, overflow: 'hidden'
  },
  // Sender name/avatar in group chats
  senderAvatarWrap: { marginRight: 6, alignSelf: 'flex-end', marginBottom: 2 },
  senderAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  senderAvatarInitial: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  groupContentCol: { maxWidth: '82%', flexShrink: 1 },
  senderNameWrap: { paddingHorizontal: 4, marginBottom: 2 },
  senderName: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  actionMenu: {
    backgroundColor: '#1A1A2E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 28,
    paddingTop: 8,
  },
  emojiRow: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 16, paddingVertical: 12 },
  emojiBtn: { padding: 4 },
  emoji: { fontSize: 26 },
  actionDivider: { height: 1, backgroundColor: Colors.dark.border, marginHorizontal: 16 },
  actionItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 14 },
  actionLabel: { fontSize: 15, color: Colors.dark.text, fontWeight: '500', flex: 1 },
  // Read by
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 },
  backLabel: { fontSize: 16, fontWeight: '700', color: Colors.dark.text },
  noReads: { textAlign: 'center', color: Colors.dark.muted, padding: 20, fontSize: 14 },
  readByRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  readByAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.primary + '33', alignItems: 'center', justifyContent: 'center',
  },
  readByInitial: { color: Colors.primary, fontWeight: '700', fontSize: 15 },
  readByName: { color: Colors.dark.text, fontWeight: '600', fontSize: 14 },
  readByTime: { color: Colors.dark.muted, fontSize: 11, marginTop: 1 },

  // Bottom Sheet elements
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark.border,
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetActionsWrap: {
    marginHorizontal: 16,
    backgroundColor: Colors.dark.card,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginBottom: 12,
  },
  sheetCancelBtn: {
    marginHorizontal: 16,
    backgroundColor: Colors.dark.card,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  sheetCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.dark.text,
  },
  mediaVideo: { width: 220, height: 150, borderRadius: 12 },
  videoContainer: { width: 220, height: 150, borderRadius: 12, overflow: 'hidden' },
  mediaLoaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  playButtonOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  disappearingMediaPlaceholder: {
    width: 220,
    height: 150,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1.5,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    borderStyle: 'dashed',
  },
  disappearingMediaIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  disappearingMediaTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  disappearingMediaSub: {
    color: Colors.dark.muted,
    fontSize: 11,
    marginTop: 2,
    fontWeight: '600',
  },
  previewTimerBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 5,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  previewTimerText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  storyReplyWrap: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 8,
    marginBottom: 6,
    overflow: 'hidden',
    alignItems: 'center',
    paddingRight: 8,
    minWidth: 200,
  },
  storyReplyMine: {
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  storyReplyTheirs: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  storyReplyBar: {
    width: 4,
    height: '100%',
    backgroundColor: Colors.accent,
  },
  storyReplyImage: {
    width: 44,
    height: 54,
    backgroundColor: Colors.dark.surface,
  },
  storyReplyContent: {
    flex: 1,
    paddingLeft: 8,
    justifyContent: 'center',
  },
  storyReplyTitle: {
    color: Colors.accent,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  storyReplyCaption: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    lineHeight: 16,
  },
  liveBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 5,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.85)', // translucent green
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  liveBadgeText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  inviteBubble: {
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  inviteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  inviteTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFF',
  },
  inviteText: {
    fontSize: 14,
    color: Colors.dark.muted,
    lineHeight: 20,
    marginBottom: 12,
  },
  joinBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  joinBtnExpired: {
    backgroundColor: Colors.dark.muted,
    opacity: 0.7,
  },
  joinBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  pollContainer: {
    marginVertical: 4,
    minWidth: 180,
    width: '100%',
  },
  pollQuestion: {
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1,
  },
  pollSubtitle: {
    fontSize: 11,
    marginBottom: 12,
  },
  pollOption: {
    marginBottom: 8,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'rgba(0,0,0,0.1)',
    position: 'relative',
  },
  pollOptionVotedMine: {
    borderColor: 'rgba(255,255,255,0.5)',
  },
  pollOptionVotedTheirs: {
    borderColor: Colors.primary,
  },
  pollProgress: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
  },
  pollOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
  },
  pollCheckbox: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pollOptionText: {
    fontSize: 14,
    fontWeight: '500',
    flexShrink: 1,
  },
  pollVoteCount: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  pollTotalVotes: {
    fontSize: 11,
    textAlign: 'right',
    marginTop: 4,
  },
});
