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
import ThemeSelectSheet from './ThemeSelectSheet';
import { useAlert } from './CustomAlert';

const { height: SCREEN_H } = Dimensions.get('window');

export default function UserInfoSheet({ visible, user: initialUser, chat, currentUserId, navigation, onClose }) {
  const { showAlert } = useAlert();
  const { user: authUser, updateUser } = useAuthStore();
  const [profile, setProfile]     = useState(initialUser || null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [expandedSection, setExpandedSection] = useState(null);

  const toggleSection = (sectionName) => {
    setExpandedSection(prev => prev === sectionName ? null : sectionName);
  };

  const handleBlock = () => {};
  const [loading, setLoading]     = useState(false);
  const [notifOn, setNotifOn]     = useState(true);
  const [pinned, setPinned]       = useState(authUser?.pinnedChats?.includes(chat?._id) || false);
  const [disappear, setDisappear] = useState(chat?.disappearAfter ?? 0);
  const [showDisappear, setShowDisappear] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const [showFullAvatar, setShowFullAvatar] = useState(false);
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
      navigation.reset({
        index: 1,
        routes: [
          { name: 'Tabs' },
          { name: 'ChatRoom', params: { chat: data.chat } },
        ],
      });
    } catch (e) {
      showAlert('Error', e.message || 'Could not open chat');
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
      showAlert('Error', e.message || 'Failed to update');
    }
  };

  const handleThemeSelect = async (themeId) => {
    try {
      await api.put(`/chats/${chat._id}/theme`, { theme: themeId });
      useChatStore.getState().updateChat(chat._id, { theme: themeId });
    } catch (e) {
      showAlert('Error', e.message || 'Failed to update theme');
    }
  };

  const handleStartGroup = () => {
    onClose();
    navigation.navigate('CreateGroup', { preSelectedUsers: [profile] });
  };

  const handleDeleteChat = () => {
    showAlert(
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
              showAlert('Error', e.message || 'Delete failed');
            }
          }
        }
      ]
    );
  };

  // Days on Relay — use whichever createdAt is available
  const createdAt = profile?.createdAt;
  const daysOnApp = createdAt
    ? Math.max(1, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000))
    : null;

  const isFriend = profile?.isFriend ?? (profile && authUser?.friends?.some(f => (f._id || f).toString() === profile._id.toString()));

  if (!profile) return null;

  return (
    <>
      <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.handle} />
          
          <TouchableOpacity onPress={onClose} style={{ position: 'absolute', top: 16, right: 16, zIndex: 10, padding: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20 }}>
            <Ionicons name="close" size={20} color="#FFF" />
          </TouchableOpacity>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* ── Profile ─────────────────────────────────────────────── */}
            <View style={styles.profileSection}>
              <TouchableOpacity style={styles.avatarWrap} onPress={() => { if (profile.profilePicture) setShowFullAvatar(true); }} activeOpacity={0.8}>
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
              </TouchableOpacity>
              <Text style={styles.displayName}>{profile.displayName || profile.username}</Text>
              <Text style={styles.username}>@{profile.username}</Text>

              {profile.bio ? (
                <Text style={styles.bioText}>{profile.bio}</Text>
              ) : null}

              {daysOnApp !== null && (
                <View style={styles.daysBadge}>
                  <Ionicons name="calendar-outline" size={13} color={Colors.dark.muted} />
                  <Text style={styles.daysText}>{daysOnApp} {daysOnApp === 1 ? 'Day' : 'Days'} on Relay</Text>
                </View>
              )}
            </View>

            {isFriend && profile.mutualGroups && profile.mutualGroups.length > 0 && (
              <View style={styles.mutualGroupsContainer}>
                <Text style={styles.mutualGroupsTitle}>Mutual Groups</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mutualGroupsScroll}>
                  {profile.mutualGroups.map(group => (
                    <TouchableOpacity 
                      key={group._id} 
                      style={styles.mutualGroupItem}
                      onPress={() => {
                        onClose();
                        navigation.reset({
                          index: 1,
                          routes: [
                            { name: 'Tabs' },
                            { name: 'ChatRoom', params: { chat: { ...group, isGroupChat: true } } },
                          ],
                        });
                      }}
                    >
                      {group.groupPicture ? (
                        <Image source={{ uri: group.groupPicture }} style={styles.mutualGroupAvatar} />
                      ) : (
                        <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.mutualGroupAvatar}>
                          <Text style={styles.mutualGroupInitial}>
                            {(group.chatName || '?').charAt(0).toUpperCase()}
                          </Text>
                        </LinearGradient>
                      )}
                      <Text style={styles.mutualGroupName} numberOfLines={1}>{group.chatName}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ── Actions ─────────────────────────────────────────────── */}
            <View style={styles.actions}>
              {(profile.role !== 'system_bot' && profile.username !== 'mica_bot' && profile.username !== 'relay_bot' && profile.username !== 'relay') ? (
                <>
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

                  {/* Category: Media & Appearance */}
                  <View style={[styles.card, { marginTop: 12, overflow: 'hidden' }]}>
                    <TouchableOpacity style={styles.settingRowAccordion} onPress={() => toggleSection('media')}>
                      <View style={[styles.settingIconAcc, { backgroundColor: Colors.primary + '20' }]}>
                        <Ionicons name="color-palette-outline" size={20} color={Colors.primary} />
                      </View>
                      <Text style={[styles.settingLabelAcc, { fontWeight: '700' }]}>Media & Appearance</Text>
                      <Ionicons name={expandedSection === 'media' ? "chevron-up" : "chevron-down"} size={20} color={Colors.dark.muted} />
                    </TouchableOpacity>
                    
                    {expandedSection === 'media' && (
                      <View style={{ backgroundColor: 'rgba(0,0,0,0.2)', paddingVertical: 4 }}>
                        <ActionRow 
                          icon="images-outline" 
                          label="Shared Media" 
                          onPress={() => { onClose(); navigation.navigate('SharedMedia', { chatId: chat?._id }); }} 
                          containerStyle={{ paddingLeft: 16 }}
                        />
                        <View style={[styles.divider, { marginLeft: 56 }]} />
                        <ActionRow
                          icon="color-wand-outline"
                          label="Change Chat Theme"
                          onPress={() => setShowTheme(true)}
                          containerStyle={{ paddingLeft: 16 }}
                        />
                      </View>
                    )}
                  </View>

                  {/* Category: Privacy & Security */}
                  <View style={[styles.card, { marginTop: 12, overflow: 'hidden' }]}>
                    <TouchableOpacity style={styles.settingRowAccordion} onPress={() => toggleSection('security')}>
                      <View style={[styles.settingIconAcc, { backgroundColor: '#10B98120' }]}>
                        <Ionicons name="shield-checkmark-outline" size={20} color="#10B981" />
                      </View>
                      <Text style={[styles.settingLabelAcc, { fontWeight: '700' }]}>Privacy & Security</Text>
                      <Ionicons name={expandedSection === 'security' ? "chevron-up" : "chevron-down"} size={20} color={Colors.dark.muted} />
                    </TouchableOpacity>
                    
                    {expandedSection === 'security' && (
                      <View style={{ backgroundColor: 'rgba(0,0,0,0.2)', paddingVertical: 4 }}>
                        <ActionRow
                          icon="time-outline"
                          label="Disappearing Messages"
                          value={secondsToLabel(disappear)}
                          valueStyle={{ color: Colors.primary, fontSize: 13 }}
                          onPress={() => setShowDisappear(true)}
                          containerStyle={{ paddingLeft: 16 }}
                        />
                        <View style={[styles.divider, { marginLeft: 56 }]} />
                        <SwitchRow 
                          icon="camera-outline" 
                          label="Allow Screenshots" 
                          value={chat?.allowScreenshots !== false} 
                          containerStyle={{ paddingLeft: 16 }}
                          onChange={async (val) => {
                            const prev = chat?.allowScreenshots;
                            useChatStore.getState().updateChat(chat._id, { allowScreenshots: val });
                            try {
                              await api.put(`/chats/${chat._id}/security`, { allowScreenshots: val });
                            } catch (e) {
                              useChatStore.getState().updateChat(chat._id, { allowScreenshots: prev });
                              showAlert('Error', e.message); 
                            }
                          }} 
                        />
                        <View style={[styles.divider, { marginLeft: 56 }]} />
                        <SwitchRow 
                          icon="arrow-redo-outline" 
                          label="Allow Forwarding" 
                          value={chat?.allowForwarding !== false} 
                          containerStyle={{ paddingLeft: 16 }}
                          onChange={async (val) => {
                            const prev = chat?.allowForwarding;
                            useChatStore.getState().updateChat(chat._id, { allowForwarding: val });
                            try {
                              await api.put(`/chats/${chat._id}/security`, { allowForwarding: val });
                            } catch (e) {
                              useChatStore.getState().updateChat(chat._id, { allowForwarding: prev });
                              showAlert('Error', e.message); 
                            }
                          }} 
                        />
                      </View>
                    )}
                  </View>
                  <View style={{ height: 12 }} />
                  
                  {!isFriend ? (
                    <>
                      <ActionRow
                        icon="person-add-outline"
                        label="Add Friend"
                        onPress={async () => {
                          try {
                            await api.post(`/users/${profile._id}/friend-request`);
                            showAlert('✅', 'Friend request sent!');
                          } catch (e) {
                            showAlert('Info', e.response?.data?.message || e.message);
                          }
                        }}
                      />
                      <View style={styles.divider} />
                    </>
                  ) : (
                    <>
                      <ActionRow
                        icon="checkmark-circle"
                        label="Already Friends"
                        iconColor={Colors.primary}
                        labelStyle={{ color: Colors.primary }}
                        onPress={() => {
                          showAlert('Remove Friend', `Are you sure you want to remove ${profile.displayName || profile.username} from friends?`, [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Remove',
                              style: 'destructive',
                              onPress: async () => {
                                try {
                                  await api.post(`/users/${profile._id}/remove-friend`);
                                  const updatedFriends = (authUser.friends || []).filter(id => (id._id || id).toString() !== profile._id.toString());
                                  updateUser({ friends: updatedFriends });
                                  showAlert('Removed', 'Friend removed silently');
                                } catch (e) { showAlert('Error', e.message); }
                              }
                            }
                          ]);
                        }}
                      />
                      <View style={styles.divider} />
                    </>
                  )}

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
                      showAlert('Block User', `Are you sure you want to block ${profile.displayName || profile.username}?`, [
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
                              
                              const allChats = useChatStore.getState().chats;
                              const chatToRemove = allChats.find(c => !c.isGroupChat && c.users?.some(u => u._id === profile._id));
                              if (chatToRemove) {
                                useChatStore.getState().removeChat(chatToRemove._id);
                              }
                              
                              showAlert('Blocked', 'User has been blocked');
                              onClose();
                              if (navigation && navigation.goBack) navigation.goBack();
                            } catch (e) { showAlert('Error', e.message); }
                          }
                        }
                      ]);
                    }}
                  />
                </>
              ) : (
                // System bot panel (mica, relay, relay_bot)
                <>
                  <ActionRow icon="information-circle-outline" label="System Assistant" onPress={() => {}} />
                  <View style={styles.divider} />
                  <ActionRow icon="shield-checkmark-outline" label="Managed by Relay" iconColor={Colors.primary} labelStyle={{ color: Colors.primary }} onPress={() => {}} />
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

      <ThemeSelectSheet
        visible={showTheme}
        currentThemeId={chat?.theme || 'default'}
        onSelect={handleThemeSelect}
        onClose={() => setShowTheme(false)}
      />

      <Modal visible={showFullAvatar} transparent animationType="fade" onRequestClose={() => setShowFullAvatar(false)}>
        <TouchableOpacity style={styles.fullAvatarOverlay} activeOpacity={1} onPress={() => setShowFullAvatar(false)}>
          <TouchableOpacity style={styles.fullAvatarClose} onPress={() => setShowFullAvatar(false)}>
            <Ionicons name="close" size={30} color="#FFF" />
          </TouchableOpacity>
          {profile?.profilePicture && (
            <Image source={{ uri: profile.profilePicture }} style={styles.fullAvatarImage} resizeMode="contain" />
          )}
        </TouchableOpacity>
      </Modal>
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
  mutualGroupsContainer: { paddingHorizontal: 20, marginBottom: 20 },
  mutualGroupsTitle: { color: Colors.dark.muted, fontSize: 13, fontWeight: '600', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  mutualGroupsScroll: { gap: 16 },
  mutualGroupItem: { alignItems: 'center', width: 64 },
  mutualGroupAvatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  mutualGroupInitial: { fontSize: 20, fontWeight: '700', color: '#FFF' },
  mutualGroupName: { color: Colors.dark.text, fontSize: 12, textAlign: 'center' },
  actions: {
    backgroundColor: Colors.dark.card, marginHorizontal: 16, borderRadius: 18,
    borderWidth: 1, borderColor: Colors.dark.border, overflow: 'hidden',
  },
  card: { backgroundColor: Colors.dark.card, marginHorizontal: 0, borderRadius: 18, borderWidth: 1, borderColor: Colors.dark.border },
  settingRowAccordion: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  settingIconAcc: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  settingLabelAcc: { flex: 1, fontSize: 15, color: Colors.dark.text, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, gap: 16 },
  rowLabel: { flex: 1, fontSize: 15, color: Colors.dark.text, fontWeight: '500' },
  rowValue: { fontSize: 14, color: Colors.dark.muted },
  divider: { height: 0.5, backgroundColor: Colors.dark.border, marginLeft: 56 },
  fullAvatarOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center', alignItems: 'center'
  },
  fullAvatarClose: {
    position: 'absolute', top: 50, right: 20, padding: 10, zIndex: 10
  },
  fullAvatarImage: {
    width: '100%', height: '80%'
  }
});
