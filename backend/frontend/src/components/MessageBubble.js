import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, Image, StyleSheet,
  Pressable, Modal, Alert, Clipboard, ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, ResizeMode } from 'expo-av';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { Colors } from '../theme/colors';

const REACTIONS = ['❤️', '😂', '👍', '😮', '😢', '🔥'];

const formatTime = (d) =>
  new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const formatDate = (d) =>
  new Date(d).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function MessageBubble({ message, currentUser, chat, chatUsers = [], isGroup, onReply, onDelete, onReact, onSenderPress, onReplyPress, highlightedMessageId, onMediaPress }) {
  const [showActions, setShowActions] = useState(false);
  const [tab, setTab] = useState('actions'); // 'actions' | 'readby'
  const swipeableRef = useRef(null);

  const getSecondsLeft = () => {
    if (!message.isSelfDestructing || !message.expiresAt) return 0;
    const diff = Math.ceil((new Date(message.expiresAt).getTime() - Date.now()) / 1000);
    return Math.max(0, diff);
  };

  const [timeLeft, setTimeLeft] = useState(getSecondsLeft());

  useEffect(() => {
    if (!message.isSelfDestructing || !message.expiresAt) return;
    
    const initial = getSecondsLeft();
    if (initial <= 0) {
      onDelete?.(message._id, 'me');
      return;
    }
    
    setTimeLeft(initial);
    
    const interval = setInterval(() => {
      const remaining = getSecondsLeft();
      if (remaining <= 0) {
        clearInterval(interval);
        onDelete?.(message._id, 'me');
      } else {
        setTimeLeft(remaining);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [message.expiresAt]);

  const isMine = message.sender?._id === currentUser?._id;
  
  // Logic for Admin/Owner delete for everyone
  let canDeleteEveryone = isMine;
  if (!canDeleteEveryone && isGroup && chat) {
    const isReqOwner = chat.groupAdmin === currentUser?._id;
    const isReqAdmin = chat.admins?.includes(currentUser?._id);
    const isSenderOwner = chat.groupAdmin === message.sender?._id;
    
    if (isReqOwner) canDeleteEveryone = true;
    else if (isReqAdmin && !isSenderOwner) canDeleteEveryone = true;
  }

  const readByOthers = (message.readBy || []).filter(
    id => id !== currentUser?._id && id !== message.sender?._id
  );
  const isRead = readByOthers.length > 0;

  // Resolve user IDs to display names from chatUsers
  const resolveUser = (id) => {
    const u = chatUsers.find(u => u._id === id || u._id?.toString() === id?.toString());
    return u ? (u.displayName || u.username) : 'Unknown';
  };

  if (message.deletedForEveryone) {
    return (
      <View style={[styles.row, isMine && styles.rowMine]}>
        <View style={styles.deletedBubble}>
          <Ionicons name="ban-outline" size={14} color={Colors.dark.muted} />
          <Text style={styles.deletedText}>Permanently deleted</Text>
        </View>
      </View>
    );
  }

  if (message.isSystemMessage) {
    return (
      <View style={styles.systemRow}>
        <Text style={styles.systemText}>{message.content}</Text>
      </View>
    );
  }

  const renderMedia = () => {
    if (!message.mediaUrl) return null;

    if (message.isSelfDestructing && !isMine) {
      const label = message.mediaType === 'video' ? 'Disappearing Video' : 'Disappearing Photo';
      const duration = message.destructAfterSeconds || 5;
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
          <Text style={styles.disappearingMediaSub}>{duration}s • Tap to view</Text>
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
          <Image source={{ uri: message.mediaUrl }} style={styles.mediaImage} resizeMode="cover" />
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
          <Video
            source={{ uri: message.mediaUrl }}
            resizeMode={ResizeMode.COVER}
            shouldPlay={false}
            useNativeControls={false}
            style={styles.mediaVideo}
          />
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
        <View style={styles.audioRow}>
          <Ionicons name="play-circle" size={36} color={isMine ? '#FFF' : Colors.primary} />
          <View style={styles.audioBar} />
        </View>
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
    setTab('actions'); 
    setShowActions(true); 
  };

  const actions = [
    {
      icon: 'arrow-undo-outline', label: 'Reply',
      action: () => { onReply?.(message); setShowActions(false); },
    },
    {
      icon: 'copy-outline', label: 'Copy',
      action: () => { Clipboard.setString(message.content || ''); setShowActions(false); Alert.alert('Copied!'); },
    },
    {
      icon: 'arrow-redo-outline', label: 'Forward',
      action: () => setShowActions(false),
    },
    ...(!isMine ? [{
      icon: 'trash-outline', label: 'Delete for me',
      color: Colors.camera,
      action: () => { onDelete?.(message._id, 'me'); setShowActions(false); },
    }] : []),
    ...(canDeleteEveryone && !isMine ? [{
      icon: 'trash-bin-outline', label: 'Delete for everyone',
      color: Colors.camera,
      action: () => { onDelete?.(message._id, 'everyone'); setShowActions(false); },
    }] : []),
    ...(isMine ? [
      {
        icon: 'trash-outline', label: 'Delete for me',
        color: Colors.camera,
        action: () => { onDelete?.(message._id, 'me'); setShowActions(false); },
      },
      {
        icon: 'trash-bin-outline', label: 'Delete for everyone',
        color: Colors.camera,
        action: () => { onDelete?.(message._id, 'everyone'); setShowActions(false); },
      }
    ] : []),
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


  const renderLeftActions = () => {
    return (
      <View style={{ width: 50, justifyContent: 'center', alignItems: 'center', paddingLeft: 10 }}>
        <Ionicons name="arrow-undo-outline" size={22} color={Colors.primary} />
      </View>
    );
  };

  return (
    <>
      <Swipeable
        ref={swipeableRef}
        renderLeftActions={renderLeftActions}
        onSwipeableWillOpen={() => {
          onReply?.(message);
          setTimeout(() => {
            swipeableRef.current?.close();
          }, 50);
        }}
      >
      <Pressable
        onLongPress={openModal}
        style={[
          styles.row,
          isMine ? styles.rowMine : styles.rowTheirs,
          message._id === highlightedMessageId && { backgroundColor: 'rgba(124, 58, 237, 0.15)' }
        ]}
      >
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

            {/* Reply context */}
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

            {/* Bubble */}
            <View
              style={[
                styles.bubble,
                styles.bubbleTheirs,
                message._id === highlightedMessageId && { backgroundColor: Colors.primary + '33', borderWidth: 1, borderColor: Colors.accent }
              ]}
            >
              {renderMedia()}
              {message.content ? <Text style={styles.textTheirs}>{message.content}</Text> : null}
              <View style={styles.metaRow}>
                {message.isSelfDestructing && timeLeft > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginRight: 6 }}>
                    <Ionicons name="flame" size={12} color="#EF4444" />
                    <Text style={{ fontSize: 11, color: "#EF4444", fontWeight: 'bold' }}>{timeLeft}s</Text>
                  </View>
                )}
                {message.isForwarded && <Text style={styles.forwardedTheirs}>↪ Forwarded</Text>}
                <Text style={styles.timeTheirs}>{formatTime(message.createdAt)}</Text>
              </View>
            </View>

          </View>
        )}

        {/* Non-group or isMine — render bubble directly (no wrapper View) */}
        {(!isGroup || isMine || !message.sender) && (
          <>
            {/* Reply context */}
            {message.replyTo && (
              <TouchableOpacity
                onPress={() => onReplyPress?.(message.replyTo._id || message.replyTo)}
                activeOpacity={0.7}
                style={[styles.replyContext, isMine ? styles.replyContextMine : styles.replyContextTheirs]}
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
                {message.content === 'Media expired' ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="eye-off-outline" size={16} color={isMine ? 'rgba(255,255,255,0.7)' : Colors.dark.muted} />
                    <Text style={[isMine ? styles.textMine : styles.textTheirs, { fontStyle: 'italic', color: isMine ? 'rgba(255,255,255,0.7)' : Colors.dark.muted }]}>
                      Media expired
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
                colors={message._id === highlightedMessageId ? [Colors.accent, Colors.accent] : [Colors.primary, Colors.primaryDark]}
                style={[styles.bubble, styles.bubbleMine]}
              >
                {renderMedia()}
                {message.content ? <Text style={styles.textMine}>{message.content}</Text> : null}
                <View style={styles.metaRow}>
                  {message.isSelfDestructing && timeLeft > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginRight: 6 }}>
                      <Ionicons name="flame" size={12} color="#FFF" />
                      <Text style={{ fontSize: 11, color: "#FFF", fontWeight: 'bold' }}>{timeLeft}s</Text>
                    </View>
                  )}
                  {message.isForwarded && <Text style={styles.forwarded}>↪ Forwarded</Text>}
                  <Text style={styles.timeMine}>{formatTime(message.createdAt)}</Text>
                  {message.isOptimistic ? (
                    <Ionicons name="time-outline" size={13} color="rgba(255,255,255,0.6)" />
                  ) : (
                    <Ionicons
                      name={isRead ? 'checkmark-done' : 'checkmark'}
                      size={13}
                      color={isRead ? Colors.accentGreen : 'rgba(255,255,255,0.6)'}
                    />
                  )}
                </View>
              </LinearGradient>
            ) : (
              <View
                style={[
                  styles.bubble,
                  styles.bubbleTheirs,
                  message._id === highlightedMessageId && { backgroundColor: Colors.primary + '33', borderWidth: 1, borderColor: Colors.accent }
                ]}
              >
                {renderMedia()}
                {message.content ? <Text style={styles.textTheirs}>{message.content}</Text> : null}
                <View style={styles.metaRow}>
                  {message.isSelfDestructing && timeLeft > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginRight: 6 }}>
                      <Ionicons name="flame" size={12} color="#EF4444" />
                      <Text style={{ fontSize: 11, color: "#EF4444", fontWeight: 'bold' }}>{timeLeft}s</Text>
                    </View>
                  )}
                  {message.isForwarded && <Text style={styles.forwardedTheirs}>↪ Forwarded</Text>}
                  <Text style={styles.timeTheirs}>{formatTime(message.createdAt)}</Text>
                </View>
              </View>
            )}

          </>
        )}
      </Pressable>
    </Swipeable>

      {/* Reactions — below the bubble */}
      {message.reactions?.length > 0 && (
        <View style={[styles.reactionsRow, isMine ? styles.reactionsRowMine : styles.reactionsRowTheirs]}>
          {groupedReactions().map((g, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.reactionChip, g.hasMe && styles.reactionChipMine]}
              onPress={() => onReact?.(message._id, g.emoji)}
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
            ) : (
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
            )}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 12, marginVertical: 2, flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '75%', minWidth: 90, borderRadius: 20, padding: 12, elevation: 2 },
  bubbleMine: { borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: Colors.dark.surface, borderBottomLeftRadius: 4 },
  textMine: { color: '#FFF', fontSize: 15, lineHeight: 20 },
  textTheirs: { color: Colors.dark.text, fontSize: 15, lineHeight: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, justifyContent: 'flex-end', flexWrap: 'nowrap' },
  timeMine: { fontSize: 11, color: 'rgba(255,255,255,0.7)', flexShrink: 0 },
  timeTheirs: { fontSize: 11, color: Colors.dark.muted, flexShrink: 0 },
  forwarded: { fontSize: 10, color: 'rgba(255,255,255,0.6)', fontStyle: 'italic' },
  forwardedTheirs: { fontSize: 10, color: Colors.dark.muted, fontStyle: 'italic' },
  mediaImage: { width: 220, height: 180, borderRadius: 12, marginBottom: 6 },
  audioRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, minWidth: 160 },
  audioBar: { flex: 1, height: 3, backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: 2 },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, minWidth: 160 },
  docName: { fontSize: 13, flex: 1 },
  replyContext: {
    flexDirection: 'row', marginBottom: 6, borderRadius: 10, padding: 8, maxWidth: '75%',
  },
  replyContextMine: { backgroundColor: 'rgba(0,0,0,0.2)', alignSelf: 'flex-end' },
  replyContextTheirs: { backgroundColor: Colors.dark.border, alignSelf: 'flex-start' },
  replyBorderBar: { width: 3, backgroundColor: Colors.accentGreen, borderRadius: 2, marginRight: 8 },
  replyContextName: { fontSize: 12, fontWeight: '700', color: Colors.accentGreen },
  replyContextContent: { fontSize: 12, color: Colors.dark.muted },
  reactionsRow: {
    flexDirection: 'row', gap: 4, paddingHorizontal: 16, marginTop: -4, marginBottom: 4,
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
  systemRow: { alignItems: 'center', marginVertical: 8 },
  systemText: {
    fontSize: 12, color: Colors.dark.muted, fontStyle: 'italic',
    backgroundColor: Colors.dark.surface, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4,
  },
  // Sender name/avatar in group chats
  senderAvatarWrap: { marginRight: 6, alignSelf: 'flex-end', marginBottom: 2 },
  senderAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  senderAvatarInitial: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  groupContentCol: { maxWidth: '75%', flexShrink: 1 },
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
});
