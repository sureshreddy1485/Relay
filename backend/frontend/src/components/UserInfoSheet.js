import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, Image,
  Switch, Alert, ScrollView, ActivityIndicator, Animated, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../theme/colors';
import api from '../services/api';
import useAuthStore from '../store/useAuthStore';
import useChatStore from '../store/useChatStore';
import DisappearingMsgSheet, { secondsToLabel, DISAPPEAR_OPTIONS } from './DisappearingMsgSheet';

const { height: SCREEN_H } = Dimensions.get('window');

export default function UserInfoSheet({ visible, user: initialUser, chat, currentUserId, navigation, onClose }) {
  const { user: authUser, updateUser } = useAuthStore();
  const [profile, setProfile]     = useState(initialUser || null);
  const [loading, setLoading]     = useState(false);
  const [notifOn, setNotifOn]     = useState(true);
  const [pinned, setPinned]       = useState(authUser?.pinnedChats?.includes(chat?._id) || false);
  const [disappear, setDisappear] = useState(chat?.disappearAfter ?? 0);
  const [showDisappear, setShowDisappear] = useState(false);
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
      if (initialUser?.username) fetchProfile(initialUser.username);
    } else {
      Animated.timing(slideAnim, { toValue: SCREEN_H, duration: 220, useNativeDriver: true }).start();
    }
  }, [visible]);

  // Sync state when new user is passed
  useEffect(() => {
    if (initialUser) setProfile(initialUser);
  }, [initialUser]);

  const fetchProfile = async (username) => {
    try {
      setLoading(true);
      const { data } = await api.get(`/users/${username}`);
      setProfile(prev => ({ ...prev, ...data.user }));
    } catch (_) {} finally { setLoading(false); }
  };

  const handleOpenChat = async () => {
    onClose();
    try {
      const { data } = await api.post('/chats', { userId: profile._id });
      navigation.push('ChatRoom', { chat: data.chat });
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not open chat');
    }
  };

  const handlePinToggle = async (val) => {
    setPinned(val);
    
    // Optimistic UI update for global store
    const currentPinned = authUser?.pinnedChats || [];
    const newPinned = val 
      ? [...currentPinned, chat._id] 
      : currentPinned.filter(id => id !== chat._id);
    updateUser({ pinnedChats: newPinned });

    try { 
      await api.put(`/chats/${chat._id}/pin`); 
    } catch (_) { 
      setPinned(!val); 
      updateUser({ pinnedChats: currentPinned }); // Revert
    }
  };

  const handleDisappearSelect = async (seconds) => {
    try {
      await api.put(`/chats/${chat._id}/disappear`, { seconds });
      setDisappear(seconds);
      useChatStore.getState().updateChat(chat._id, { disappearAfter: seconds });
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to update');
    }
  };

  const handleStartGroup = () => {
    onClose();
    navigation.navigate('CreateGroup', { preSelectedUsers: [profile] });
  };

  const handleDeleteChat = () => {
    Alert.alert(
      'Delete Chat',
      'Are you sure you want to permanently delete this chat and all of its messages?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!chat?._id) return;
            try {
              await api.delete(`/chats/${chat._id}`);
              useChatStore.getState().removeChat(chat._id);
              onClose();
              if (navigation && navigation.goBack) navigation.goBack();
            } catch (e) {
              Alert.alert('Error', e.message || 'Delete failed');
            }
          }
        }
      ]
    );
  };

  // Days on Nexo — use whichever createdAt is available
  const createdAt = profile?.createdAt;
  const daysOnApp = createdAt
    ? Math.max(1, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000))
    : null;

  if (!profile) return null;

  return (
    <>
      <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.handle} />

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* ── Profile ─────────────────────────────────────────────── */}
            <View style={styles.profileSection}>
              <View style={styles.avatarWrap}>
                {profile.profilePicture ? (
                  <Image source={{ uri: profile.profilePicture }} style={styles.avatar} />
                ) : (
                  <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.avatar}>
                    <Text style={styles.avatarInitial}>
                      {(profile.displayName || profile.username || '?').charAt(0).toUpperCase()}
                    </Text>
                  </LinearGradient>
                )}
                {loading && (
                  <ActivityIndicator
                    color={Colors.primary}
                    style={{ position: 'absolute', top: 36, alignSelf: 'center' }}
                  />
                )}
              </View>
              <Text style={styles.displayName}>{profile.displayName || profile.username}</Text>
              <Text style={styles.username}>@{profile.username}</Text>

              {profile.bio ? (
                <Text style={styles.bioText}>{profile.bio}</Text>
              ) : null}

              {daysOnApp !== null && (
                <View style={styles.daysBadge}>
                  <Ionicons name="calendar-outline" size={13} color={Colors.dark.muted} />
                  <Text style={styles.daysText}>{daysOnApp} {daysOnApp === 1 ? 'Day' : 'Days'} on Nexo</Text>
                </View>
              )}
            </View>

            {/* ── Actions ─────────────────────────────────────────────── */}
            <View style={styles.actions}>
              <ActionRow icon="chatbubble-outline" label="Open Chat" onPress={handleOpenChat} />
              <View style={styles.divider} />
              <SwitchRow icon="notifications-outline" label="Notifications" value={notifOn} onChange={setNotifOn} />
              <View style={styles.divider} />
              <SwitchRow icon="pin-outline" label="Pin Chat" value={pinned} onChange={handlePinToggle} />
              <View style={styles.divider} />
              <ActionRow
                icon="people-outline"
                label={`Start a Group with ${profile.username}`}
                labelStyle={{ color: Colors.primary }}
                iconColor={Colors.primary}
                onPress={handleStartGroup}
              />
              <View style={styles.divider} />
              <ActionRow
                icon="time-outline"
                label="Disappearing Messages"
                value={secondsToLabel(disappear)}
                valueStyle={{ color: Colors.primary }}
                onPress={() => setShowDisappear(true)}
              />
              <View style={styles.divider} />
              <ActionRow
                icon="color-palette-outline"
                label="Change Chat Theme"
                onPress={() => Alert.alert('Themes', 'Chat themes coming soon!')}
              />
              <View style={styles.divider} />
              <ActionRow
                icon="close-circle-outline"
                label="Delete Chat"
                labelStyle={{ color: '#FF4444' }}
                iconColor="#FF4444"
                onPress={handleDeleteChat}
              />
              <View style={styles.divider} />
              <ActionRow
                icon="ban-outline"
                label="Block User"
                labelStyle={{ color: '#FF4444' }}
                iconColor="#FF4444"
                onPress={() => {
                  Alert.alert('Block User', `Are you sure you want to block ${profile.displayName || profile.username}?`, [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Block',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          await api.post(`/users/${profile._id}/block`);
                          const updatedBlocked = [...(authUser.blockedUsers || []), profile._id];
                          const updatedFriends = (authUser.friends || []).filter(id => id.toString() !== profile._id.toString());
                          updateUser({ blockedUsers: updatedBlocked, friends: updatedFriends });
                          
                          // Instantly remove chat from UI lists
                          const allChats = useChatStore.getState().chats;
                          const chatToRemove = allChats.find(c => !c.isGroupChat && c.users?.some(u => u._id === profile._id));
                          if (chatToRemove) {
                            useChatStore.getState().removeChat(chatToRemove._id);
                          }
                          
                          Alert.alert('Blocked', 'User has been blocked');
                          onClose();
                          if (navigation && navigation.goBack) navigation.goBack();
                        } catch (e) { Alert.alert('Error', e.message); }
                      }
                    }
                  ]);
                }}
              />
              {authUser.friends?.some(f => (f._id || f).toString() === profile._id.toString()) && (
                <>
                  <View style={styles.divider} />
                  <ActionRow
                    icon="person-remove-outline"
                    label="Remove Friend"
                    labelStyle={{ color: '#FF4444' }}
                    iconColor="#FF4444"
                    onPress={() => {
                      Alert.alert('Remove Friend', `Are you sure you want to remove ${profile.displayName || profile.username} from friends?`, [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Remove',
                          style: 'destructive',
                          onPress: async () => {
                            try {
                              await api.post(`/users/${profile._id}/remove-friend`);
                              const updatedFriends = (authUser.friends || []).filter(id => id.toString() !== profile._id.toString());
                              updateUser({ friends: updatedFriends });
                              Alert.alert('Removed', 'Friend removed silently');
                              onClose();
                              if (navigation && navigation.goBack) navigation.goBack();
                            } catch (e) { Alert.alert('Error', e.message); }
                          }
                        }
                      ]);
                    }}
                  />
                </>
              )}
            </View>

            <View style={{ height: 32 }} />
          </ScrollView>
        </Animated.View>
      </Modal>

      {/* Disappearing Messages bottom sheet */}
      <DisappearingMsgSheet
        visible={showDisappear}
        currentSeconds={disappear}
        onSelect={handleDisappearSelect}
        onClose={() => setShowDisappear(false)}
      />
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
const ActionRow = ({ icon, label, value, onPress, labelStyle, iconColor, valueStyle }) => (
  <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
    <Ionicons name={icon} size={22} color={iconColor || Colors.dark.text} />
    <Text style={[styles.rowLabel, labelStyle]}>{label}</Text>
    {value ? <Text style={[styles.rowValue, valueStyle]}>{value}</Text> : null}
  </TouchableOpacity>
);

const SwitchRow = ({ icon, label, value, onChange }) => (
  <View style={styles.row}>
    <Ionicons name={icon} size={22} color={Colors.dark.text} />
    <Text style={styles.rowLabel}>{label}</Text>
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ false: Colors.dark.border, true: Colors.primary }}
      thumbColor="#FFF"
    />
  </View>
);

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.dark.bg,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: SCREEN_H * 0.88, paddingTop: 8,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.dark.border, alignSelf: 'center', marginBottom: 12,
  },
  profileSection: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 20 },
  avatarWrap: { marginBottom: 14, position: 'relative' },
  avatar: { width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 36, fontWeight: '800', color: '#FFF' },
  displayName: { fontSize: 22, fontWeight: '800', color: '#FFF', textAlign: 'center' },
  username: { fontSize: 14, color: Colors.dark.muted, marginTop: 4 },
  bioText: { fontSize: 14, color: Colors.dark.textSecondary, marginTop: 8, textAlign: 'center', paddingHorizontal: 20 },
  daysBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.dark.card, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 6, marginTop: 12,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  daysText: { color: Colors.dark.muted, fontSize: 12 },
  actions: {
    backgroundColor: Colors.dark.card, marginHorizontal: 16, borderRadius: 18,
    borderWidth: 1, borderColor: Colors.dark.border, overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, gap: 16 },
  rowLabel: { flex: 1, fontSize: 15, color: Colors.dark.text, fontWeight: '500' },
  rowValue: { fontSize: 14, color: Colors.dark.muted },
  divider: { height: 0.5, backgroundColor: Colors.dark.border, marginLeft: 56 },
});
