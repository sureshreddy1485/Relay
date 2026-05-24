import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import useChatStore from '../store/useChatStore';

// ── Helpers ───────────────────────────────────────────────────────────────────

const formatTime = (dateStr) => {
  if (!dateStr) return '';
  const d   = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  if (diff < 86400000)  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diff < 604800000) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: '2-digit', month: 'short' });
};

const getReadIcon = (msg, currentUserId) => {
  if (!msg || msg.sender?._id !== currentUserId) return null;
  const readCount = msg.readBy?.length || 0;
  if (readCount > 0) return <Ionicons name="checkmark-done" size={14} color={Colors.primary} />;
  return <Ionicons name="checkmark" size={14} color={Colors.dark.muted} />;
};

// Disappearing icon config: seconds → { icon, color }
const disappearIcon = (seconds) => {
  if (!seconds || seconds === 0) return null;
  if (seconds === -1)     return { name: 'eye-outline',      color: Colors.primary };
  if (seconds <= 86400)   return { name: 'time-outline',     color: Colors.primary };
  if (seconds <= 604800)  return { name: 'calendar-outline', color: Colors.primary };
  return null;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChatListItem({ chat, currentUser, onPress, onLongPress }) {
  const otherUser     = chat.isGroupChat ? null : chat.users?.find(u => u._id !== currentUser?._id);
  const name          = chat.isGroupChat ? chat.chatName : (otherUser?.displayName || otherUser?.username || 'Unknown');
  const avatar        = chat.isGroupChat ? chat.groupPicture : otherUser?.profilePicture;
  const isOnline      = !chat.isGroupChat && !!otherUser?.isOnline;
  const isCameraActive = !chat.isGroupChat && !!otherUser?.isCameraActive;
  const isPinned      = currentUser?.pinnedChats?.includes(chat._id);
  const isMuted       = currentUser?.mutedChats?.includes(chat._id);
  const disappear     = disappearIcon(chat.disappearAfter);
  const unreadCount   = useChatStore(s => s.unreadCounts[chat._id] || 0);

  const lastMsg = chat.latestMessage;
  let lastMsgText = 'No messages yet';
  if (lastMsg) {
    if (lastMsg.deletedForEveryone)                              lastMsgText = '🚫 Deleted';
    else if (lastMsg.mediaType === 'image')                      lastMsgText = '📷 Photo';
    else if (lastMsg.mediaType === 'video')                      lastMsgText = '🎥 Video';
    else if (lastMsg.mediaType === 'audio' || lastMsg.mediaType === 'voice') lastMsgText = '🎤 Voice';
    else if (lastMsg.mediaType === 'document')                   lastMsgText = '📎 Document';
    else                                                          lastMsgText = lastMsg.content || '';
  }

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      {/* ── Avatar + status dot ──────────────────────────────────────────── */}
      <View style={styles.avatarWrap}>
        {avatar ? (
          <Image
            source={{ uri: avatar }}
            style={[styles.avatar, isCameraActive && styles.camBorder]}
          />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback, isCameraActive && styles.camBorder]}>
            <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
          </View>
        )}

        {/* Status dot — only for 1-on-1 chats */}
        {!chat.isGroupChat && (
          isCameraActive ? (
            /* Red pulsing cam dot */
            <View style={[styles.statusDot, styles.dotCam]}>
              <Ionicons name="videocam" size={7} color="#FFF" />
            </View>
          ) : (
            /* Green = online, Dark = offline */
            <View style={[styles.statusDot, isOnline ? styles.dotOnline : styles.dotOffline]} />
          )
        )}
      </View>

      {/* ── Text content ─────────────────────────────────────────────────── */}
      <View style={styles.content}>

        {/* Top row: name + time */}
        <View style={styles.topRow}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <View style={styles.topRight}>
            {/* Pin icon */}
            {isPinned && (
              <Ionicons name="pin" size={12} color={Colors.primary} style={styles.pinIcon} />
            )}
            {/* Disappearing icon in middle of pin and tick */}
            {disappear && (
              <Ionicons name={disappear.name} size={12} color={disappear.color} style={{ marginRight: 2 }} />
            )}
            {getReadIcon(lastMsg, currentUser?._id)}
            <Text style={styles.time}>{formatTime(lastMsg?.createdAt || chat.updatedAt)}</Text>
          </View>
        </View>

        {/* Bottom row: last message + badge icons */}
        <View style={styles.bottomRow}>
          <Text style={styles.lastMsg} numberOfLines={1}>{lastMsgText}</Text>
          <View style={styles.badgeRow}>
            {/* Mute icon shown under the time */}
            {isMuted && (
              <Ionicons name="volume-mute" size={14} color={Colors.dark.muted} style={{ marginRight: 2 }} />
            )}
            {/* Group icon */}
            {chat.isGroupChat && (
              <Ionicons name="people" size={14} color={Colors.dark.muted} style={{ marginRight: 2 }} />
            )}
            {/* Unread message count badge */}
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 12,
    borderBottomWidth: 0.5, borderBottomColor: Colors.dark.border,
  },

  // Avatar
  avatarWrap: { position: 'relative' },
  avatar: { width: 54, height: 54, borderRadius: 27 },
  camBorder: { borderWidth: 2, borderColor: Colors.camera },
  avatarFallback: {
    backgroundColor: Colors.primary + '40', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: Colors.primary + '60',
  },
  avatarText: { fontSize: 22, fontWeight: '700', color: Colors.primary },

  // Status dot
  statusDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 2, borderColor: Colors.dark.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  dotOnline:  { backgroundColor: Colors.accentGreen },
  dotOffline: { backgroundColor: '#3A3A3A' },         // dark charcoal = offline
  dotCam:     { backgroundColor: Colors.camera },

  // Content
  content: { flex: 1 },
  topRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 4,
  },
  name: { fontSize: 16, fontWeight: '700', color: Colors.dark.text, flex: 1, marginRight: 6 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  pinIcon: { marginRight: 2 },
  time: { fontSize: 12, color: Colors.dark.muted },

  bottomRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  lastMsg: { fontSize: 13, color: Colors.dark.textSecondary, flex: 1, marginRight: 6 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  unreadBadge: {
    backgroundColor: Colors.primary,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  unreadText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },
});
