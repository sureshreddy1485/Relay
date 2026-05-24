import React, { useState } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet,
  ScrollView, StatusBar, Switch, Alert, Platform, Modal, FlatList, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import useAuthStore from '../../store/useAuthStore';
import useChatStore from '../../store/useChatStore';
import { Colors } from '../../theme/colors';
import { disconnectSocket } from '../../services/socketService';
import api, { uploadApi } from '../../services/api';
import { HEADER_TOP } from '../../components/TabHeader';
import TabHeader from '../../components/TabHeader';

// ─── Reusable row components ──────────────────────────────────────────────────

const SectionTitle = ({ label }) => (
  <Text style={styles.sectionTitle}>{label}</Text>
);

const SettingRow = ({ icon, label, value, onPress, danger, right, iconBg, iconColor }) => {
  const bg = danger ? '#EF444420' : (iconBg || Colors.primary + '20');
  const color = danger ? '#EF4444' : (iconColor || Colors.primary);
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
      <View style={[styles.iconWrap, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={[styles.rowLabel, danger && { color: '#EF4444', fontWeight: '600' }]}>{label}</Text>
      {right ?? (
        <View style={styles.rowRight}>
          {value ? <Text style={styles.rowValue}>{value}</Text> : null}
          {onPress && <Ionicons name="chevron-forward" size={16} color={Colors.dark.muted} />}
        </View>
      )}
    </TouchableOpacity>
  );
};

const SwitchRow = ({ icon, label, subtitle, value, onChange, iconBg, iconColor }) => (
  <View style={styles.row}>
    <View style={[styles.iconWrap, { backgroundColor: iconBg || Colors.primary + '20' }]}>
      <Ionicons name={icon} size={20} color={iconColor || Colors.primary} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={styles.rowLabel}>{label}</Text>
      {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
    </View>
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ false: Colors.dark.border, true: Colors.primary }}
      thumbColor="#FFF"
    />
  </View>
);

// ─── Privacy picker helper ────────────────────────────────────────────────────
const VISIBILITY_OPTIONS = ['everyone', 'friends', 'nobody'];

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SettingsScreen({ navigation }) {
  const { user, updateUser, logout } = useAuthStore();

  const [privacy, setPrivacy] = useState({
    lastSeenVisibility:       user?.privacy?.lastSeenVisibility || 'everyone',
    profilePictureVisibility: user?.privacy?.profilePictureVisibility || 'everyone',
    storiesVisibility:        user?.privacy?.storiesVisibility || 'everyone',
    readReceipts:             user?.privacy?.readReceipts || 'automatic',
    allowDMFromGroups:        user?.privacy?.allowDMFromGroups !== false,
  });

  const [profileSheetVisible, setProfileSheetVisible] = useState(false);
  const [profilePicViewerVisible, setProfilePicViewerVisible] = useState(false);

  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [loadingBlocked, setLoadingBlocked] = useState(false);
  const [unblockingId, setUnblockingId] = useState(null);

  const fetchBlockedUsers = async () => {
    try {
      setLoadingBlocked(true);
      const { data } = await api.get('/users/blocked');
      setBlockedUsers(data.blockedUsers || []);
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to fetch blocked users');
    } finally {
      setLoadingBlocked(false);
    }
  };

  const handleUnblock = async (targetId) => {
    setUnblockingId(targetId);
    try {
      await api.post(`/users/${targetId}/unblock`);
      setBlockedUsers(prev => prev.filter(u => u._id !== targetId));
      const updatedBlocked = (user.blockedUsers || []).filter(id => id.toString() !== targetId.toString());
      updateUser({ blockedUsers: updatedBlocked });
      Alert.alert('Success', 'User has been unblocked.');
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to unblock user');
    } finally {
      setUnblockingId(null);
    }
  };

  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [friendsList, setFriendsList] = useState([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [removingFriendId, setRemovingFriendId] = useState(null);

  const fetchFriends = async () => {
    try {
      setLoadingFriends(true);
      const { data } = await api.get('/users/friends');
      setFriendsList(data.friends || []);
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to fetch friends');
    } finally {
      setLoadingFriends(false);
    }
  };

  const handleRemoveFriendSilent = async (targetId) => {
    setRemovingFriendId(targetId);
    try {
      await api.post(`/users/${targetId}/remove-friend`);
      setFriendsList(prev => prev.filter(f => f._id !== targetId));
      const updatedFriends = (user.friends || []).filter(id => id.toString() !== targetId.toString());
      updateUser({ friends: updatedFriends });
      Alert.alert('Removed', 'Friend removed silently');
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to remove friend');
    } finally {
      setRemovingFriendId(null);
    }
  };

  const startChatFromFriends = async (friendId) => {
    setShowFriendsModal(false);
    try {
      const { data } = await api.post('/chats', { userId: friendId });
      useChatStore.getState().addChat(data.chat);
      useChatStore.getState().selectChat(data.chat);
      navigation.replace('ChatRoom', { chat: data.chat });
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to open chat');
    }
  };

  const pickAndUploadProfilePicture = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled) return;

    try {
      const file     = result.assets[0];
      const formData = new FormData();
      formData.append('profilePicture', { uri: file.uri, name: 'profilePicture.jpg', type: 'image/jpeg' });

      const { data } = await uploadApi.put('/users/profile', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      updateUser(data.user);
      Alert.alert('✨', 'Profile picture updated successfully!');
    } catch (e) {
      Alert.alert('Upload failed', e.message || 'Try again');
    }
  };

  const removeProfilePicture = async () => {
    Alert.alert('Remove Profile Picture', 'Are you sure you want to remove your profile picture?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            const { data } = await api.put('/users/profile', { removeProfilePicture: true });
            updateUser(data.user);
            Alert.alert('✨', 'Profile picture removed successfully!');
          } catch (e) {
            Alert.alert('Removal failed', e.message || 'Try again');
          }
        }
      }
    ]);
  };

  const savePrivacy = async (newPrivacy) => {
    try {
      const { data } = await api.put('/users/profile', { privacy: newPrivacy });
      updateUser(data.user);
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to save');
    }
  };

  const [visibilitySheetField, setVisibilitySheetField] = useState(null);

  const getFieldTitle = () => {
    if (visibilitySheetField === 'lastSeenVisibility') return 'Last Seen Visibility';
    if (visibilitySheetField === 'profilePictureVisibility') return 'Profile Photo Visibility';
    if (visibilitySheetField === 'storiesVisibility') return 'Stories Visibility';
    if (visibilitySheetField === 'readReceipts') return 'Read Receipts';
    return '';
  };

  const pickVisibility = (field) => {
    setVisibilitySheetField(field);
  };

  const toggleDM = (val) => {
    const updated = { ...privacy, allowDMFromGroups: val };
    setPrivacy(updated);
    savePrivacy(updated);
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => { disconnectSocket(); await logout(); },
      },
    ]);
  };

  const handleTempDelete = () => {
    Alert.alert(
      'Temporary Deactivation',
      'Are you sure you want to temporarily deactivate your account? You can log back in anytime to reactivate it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.put('/users/profile/deactivate');
              disconnectSocket();
              await logout();
            } catch (e) {
              Alert.alert('Error', e.message || 'Deactivation failed');
            }
          }
        }
      ]
    );
  };

  const handlePermanentDelete = () => {
    Alert.alert(
      '🚨 Permanent Delete 🚨',
      'WARNING: This will permanently delete your account, chats, and messages. This action CANNOT be undone. Are you absolutely sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'DELETE PERMANENTLY',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete('/users/profile/delete');
              disconnectSocket();
              await logout();
            } catch (e) {
              Alert.alert('Error', e.message || 'Delete failed');
            }
          }
        }
      ]
    );
  };

  const capitalize = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.dark.card} />

      {/* Header */}
      <TabHeader title="Settings" />

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── Profile card ─────────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.profileCard}
          onPress={() => setProfileSheetVisible(true)}
          activeOpacity={0.8}
        >
          {user?.profilePicture ? (
            <Image source={{ uri: user.profilePicture }} style={styles.avatar} />
          ) : (
            <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.avatar}>
              <Text style={styles.avatarText}>{user?.username?.charAt(0).toUpperCase()}</Text>
            </LinearGradient>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.displayName}>{user?.displayName || user?.username}</Text>
            <Text style={styles.username}>@{user?.username}</Text>
            <Text style={styles.bio} numberOfLines={1}>{user?.bio || 'Tap to add a bio'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.dark.muted} />
        </TouchableOpacity>

        {/* ── Account ──────────────────────────────────────────────────── */}
        <SectionTitle label="Account" />
        <View style={styles.section}>
          <SettingRow
            icon="lock-closed-outline"
            label="Change Password"
            iconBg="#3B82F620"
            iconColor="#3B82F6"
            onPress={() => navigation.navigate('ChangePassword')}
          />
          <SettingRow
            icon="desktop-outline"
            label="Connected Devices"
            value="1 device"
            iconBg="#F59E0B20"
            iconColor="#F59E0B"
            onPress={() => Alert.alert('Devices', 'Multi-device management coming soon.')}
          />
          <SettingRow
            icon="people-outline"
            label="Friends List"
            iconBg="#10B98120"
            iconColor="#10B981"
            onPress={() => {
              setShowFriendsModal(true);
              fetchFriends();
            }}
          />
        </View>

        {/* ── Privacy & Security ────────────────────────────────────────── */}
        <SectionTitle label="Privacy & Security" />
        <View style={styles.section}>
          <SettingRow
            icon="eye-outline"
            label="Last Seen"
            iconBg="#10B98120"
            iconColor="#10B981"
            value={capitalize(privacy.lastSeenVisibility)}
            onPress={() => pickVisibility('lastSeenVisibility')}
          />
          <SettingRow
            icon="image-outline"
            label="Profile Photo"
            iconBg="#8B5CF620"
            iconColor="#8B5CF6"
            value={capitalize(privacy.profilePictureVisibility)}
            onPress={() => pickVisibility('profilePictureVisibility')}
          />
          <SettingRow
            icon="book-outline"
            label="Stories"
            iconBg="#EC489920"
            iconColor="#EC4899"
            value={capitalize(privacy.storiesVisibility)}
            onPress={() => pickVisibility('storiesVisibility')}
          />
          <SettingRow
            icon="checkmark-done-outline"
            label="Read Receipts"
            iconBg="#3B82F620"
            iconColor="#3B82F6"
            value={capitalize(privacy.readReceipts)}
            onPress={() => pickVisibility('readReceipts')}
          />
          <SwitchRow
            icon="chatbubble-ellipses-outline"
            label="Allow DMs from group members"
            subtitle="People in your groups can message you directly"
            iconBg="#06B6D420"
            iconColor="#06B6D4"
            value={privacy.allowDMFromGroups}
            onChange={toggleDM}
          />
          <SettingRow
            icon="ban-outline"
            label="Blocked Users"
            iconBg="#EF444420"
            iconColor="#EF4444"
            onPress={() => {
              setShowBlockedModal(true);
              fetchBlockedUsers();
            }}
          />
        </View>

        {/* ── Notifications ─────────────────────────────────────────────── */}
        <SectionTitle label="Notifications" />
        <View style={styles.section}>
          <SettingRow
            icon="notifications-outline"
            label="Push Notifications"
            iconBg="#EAB30820"
            iconColor="#EAB308"
            onPress={() => Alert.alert('Notifications', 'Manage in your device settings.')}
          />
        </View>

        {/* ── Account Actions ───────────────────────────────────────────── */}
        <SectionTitle label="Account Actions" />
        <View style={styles.section}>
          <SettingRow
            icon="log-out-outline"
            label="Sign Out"
            danger
            onPress={handleLogout}
          />
          <SettingRow
            icon="alert-circle-outline"
            label="Temporary Deactivation"
            iconBg="#F9731620"
            iconColor="#F97316"
            onPress={handleTempDelete}
          />
          <SettingRow
            icon="trash-outline"
            label="Delete Account Permanently"
            danger
            onPress={handlePermanentDelete}
          />
        </View>

        <Text style={styles.version}>Nexo v1.0.0</Text>
      </ScrollView>

      {/* ── Profile Actions Sheet (Bottom Sheet Modal) ────────────────────── */}
      <Modal visible={profileSheetVisible} transparent animationType="slide" onRequestClose={() => setProfileSheetVisible(false)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setProfileSheetVisible(false)}>
          <View style={styles.sheetContainer}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Profile Actions</Text>

            <View style={styles.sheetActionsWrap}>
              {/* View Profile Picture */}
              <TouchableOpacity style={styles.sheetActionItem} onPress={() => {
                setProfileSheetVisible(false);
                if (user?.profilePicture) {
                  setProfilePicViewerVisible(true);
                } else {
                  Alert.alert('No Profile Picture', 'You haven\'t uploaded a profile picture yet.');
                }
              }}>
                <Ionicons name="person-outline" size={20} color={Colors.dark.text} />
                <Text style={styles.sheetActionLabel}>View Profile</Text>
              </TouchableOpacity>

              {/* Edit Profile */}
              <TouchableOpacity style={styles.sheetActionItem} onPress={() => {
                setProfileSheetVisible(false);
                navigation.navigate('EditProfile');
              }}>
                <Ionicons name="create-outline" size={20} color={Colors.dark.text} />
                <Text style={styles.sheetActionLabel}>Edit Profile</Text>
              </TouchableOpacity>

              {/* Add / Change Profile Pic */}
              <TouchableOpacity style={styles.sheetActionItem} onPress={async () => {
                setProfileSheetVisible(false);
                await pickAndUploadProfilePicture();
              }}>
                <Ionicons name="camera-outline" size={20} color={Colors.dark.text} />
                <Text style={styles.sheetActionLabel}>Add / Change Profile Pic</Text>
              </TouchableOpacity>

              {/* Remove Profile Pic */}
              {user?.profilePicture ? (
                <TouchableOpacity style={styles.sheetActionItem} onPress={async () => {
                  setProfileSheetVisible(false);
                  await removeProfilePicture();
                }}>
                  <Ionicons name="trash-outline" size={20} color="#FF4444" />
                  <Text style={[styles.sheetActionLabel, { color: '#FF4444' }]}>Remove Profile Pic</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Cancel Button */}
            <TouchableOpacity style={styles.sheetCancelBtn} onPress={() => setProfileSheetVisible(false)} activeOpacity={0.8}>
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Fullscreen Profile Picture Viewer ─────────────────────────────── */}
      <Modal visible={profilePicViewerVisible} transparent animationType="fade" onRequestClose={() => setProfilePicViewerVisible(false)}>
        <View style={styles.viewerOverlay}>
          {/* Close button */}
          <TouchableOpacity style={styles.viewerCloseBtn} onPress={() => setProfilePicViewerVisible(false)}>
            <Ionicons name="close" size={28} color="#FFF" />
          </TouchableOpacity>

          {/* Username label */}
          <Text style={styles.viewerName}>{user?.displayName || user?.username}</Text>

          {/* Profile Picture */}
          {user?.profilePicture ? (
            <Image
              source={{ uri: user.profilePicture }}
              style={styles.viewerImage}
              resizeMode="contain"
            />
          ) : null}
        </View>
      </Modal>

      {/* ── Visibility Picker Bottom Sheet ────────────────────────── */}
      <Modal visible={visibilitySheetField !== null} transparent animationType="slide" onRequestClose={() => setVisibilitySheetField(null)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setVisibilitySheetField(null)}>
          <View style={styles.sheetContainer}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{getFieldTitle()}</Text>

            <View style={styles.sheetActionsWrap}>
              {(visibilitySheetField === 'readReceipts' ? ['automatic', 'hide'] : VISIBILITY_OPTIONS).map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={styles.sheetActionItem}
                  onPress={() => {
                    const field = visibilitySheetField;
                    setVisibilitySheetField(null);
                    const updated = { ...privacy, [field]: opt };
                    setPrivacy(updated);
                    savePrivacy(updated);
                  }}
                >
                  <Ionicons
                    name={
                      opt === 'everyone' ? 'earth-outline' :
                      opt === 'friends' ? 'people-outline' :
                      opt === 'nobody' ? 'lock-closed-outline' :
                      opt === 'automatic' ? 'checkmark-circle-outline' : 'eye-off-outline'
                    }
                    size={20}
                    color={Colors.dark.text}
                  />
                  <Text style={styles.sheetActionLabel}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</Text>
                  {privacy[visibilitySheetField] === opt && (
                    <Ionicons name="checkmark" size={20} color={Colors.primary} style={{ marginLeft: 'auto' }} />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {/* Cancel Button */}
            <TouchableOpacity style={styles.sheetCancelBtn} onPress={() => setVisibilitySheetField(null)} activeOpacity={0.8}>
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Blocked Users Bottom Sheet ────────────────────────── */}
      <Modal visible={showBlockedModal} transparent animationType="slide" onRequestClose={() => setShowBlockedModal(false)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setShowBlockedModal(false)}>
          <View style={[styles.sheetContainer, { maxHeight: '80%' }]} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: '#EF4444' }]}>Blocked Users</Text>

            {loadingBlocked ? (
              <ActivityIndicator color={Colors.primary} style={{ marginVertical: 40 }} />
            ) : blockedUsers.length === 0 ? (
              <View style={styles.emptyBlocked}>
                <Ionicons name="people-outline" size={48} color={Colors.dark.muted} />
                <Text style={styles.emptyBlockedText}>No blocked users</Text>
              </View>
            ) : (
              <FlatList
                data={blockedUsers}
                keyExtractor={(item) => item._id}
                style={{ maxHeight: 350, marginHorizontal: 16 }}
                renderItem={({ item }) => (
                  <View style={styles.blockedItem}>
                    {item.profilePicture ? (
                      <Image source={{ uri: item.profilePicture }} style={styles.blockedAvatar} />
                    ) : (
                      <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.blockedAvatar}>
                        <Text style={styles.blockedInitial}>{item.username?.charAt(0).toUpperCase()}</Text>
                      </LinearGradient>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.blockedName}>{item.displayName || item.username}</Text>
                      <Text style={styles.blockedUsername}>@{item.username}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.unblockBtn}
                      onPress={() => handleUnblock(item._id)}
                      disabled={unblockingId === item._id}
                    >
                      {unblockingId === item._id ? (
                        <ActivityIndicator size="small" color="#FFF" />
                      ) : (
                        <Text style={styles.unblockBtnText}>Unblock</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              />
            )}

            {/* Cancel Button */}
            <TouchableOpacity style={styles.sheetCancelBtn} onPress={() => setShowBlockedModal(false)} activeOpacity={0.8}>
              <Text style={styles.sheetCancelText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Friends List Bottom Sheet ────────────────────────── */}
      <Modal visible={showFriendsModal} transparent animationType="slide" onRequestClose={() => setShowFriendsModal(false)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setShowFriendsModal(false)}>
          <View style={[styles.sheetContainer, { maxHeight: '80%' }]} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: '#10B981' }]}>Friends List</Text>

            {loadingFriends ? (
              <ActivityIndicator color={Colors.primary} style={{ marginVertical: 40 }} />
            ) : friendsList.length === 0 ? (
              <View style={styles.emptyBlocked}>
                <Ionicons name="people-outline" size={48} color={Colors.dark.muted} />
                <Text style={styles.emptyBlockedText}>No friends added yet</Text>
              </View>
            ) : (
              <FlatList
                data={friendsList}
                keyExtractor={(item) => item._id}
                style={{ maxHeight: 350, marginHorizontal: 16 }}
                renderItem={({ item }) => (
                  <View style={styles.blockedItem}>
                    {item.profilePicture ? (
                      <Image source={{ uri: item.profilePicture }} style={styles.blockedAvatar} />
                    ) : (
                      <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.blockedAvatar}>
                        <Text style={styles.blockedInitial}>{item.username?.charAt(0).toUpperCase()}</Text>
                      </LinearGradient>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.blockedName}>{item.displayName || item.username}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <Text style={styles.blockedUsername}>@{item.username}</Text>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: item.isOnline ? '#10B981' : Colors.dark.muted }} />
                      </View>
                    </View>

                    <TouchableOpacity
                      style={[styles.unblockBtn, { backgroundColor: Colors.primary, paddingHorizontal: 10, paddingVertical: 10 }]}
                      onPress={() => startChatFromFriends(item._id)}
                    >
                      <Ionicons name="chatbubble-outline" size={14} color="#FFF" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.unblockBtn, { backgroundColor: '#EF4444', paddingHorizontal: 10, paddingVertical: 10 }]}
                      onPress={() => {
                        Alert.alert('Remove Friend', `Are you sure you want to silently remove ${item.displayName || item.username} from friends?`, [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Remove', style: 'destructive', onPress: () => handleRemoveFriendSilent(item._id) }
                        ]);
                      }}
                      disabled={removingFriendId === item._id}
                    >
                      {removingFriendId === item._id ? (
                        <ActivityIndicator size="small" color="#FFF" />
                      ) : (
                        <Ionicons name="person-remove-outline" size={14} color="#FFF" />
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              />
            )}

            {/* Cancel Button */}
            <TouchableOpacity style={styles.sheetCancelBtn} onPress={() => setShowFriendsModal(false)} activeOpacity={0.8}>
              <Text style={styles.sheetCancelText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 8 : 54,
    paddingBottom: 12,
    backgroundColor: Colors.dark.card,
    borderBottomWidth: 1, borderBottomColor: Colors.dark.border,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.dark.text },
  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.dark.card,
    margin: 16, borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  avatar: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 26, fontWeight: '800', color: '#FFF' },
  displayName: { fontSize: 17, fontWeight: '800', color: '#FFF' },
  username: { fontSize: 13, color: Colors.primary, marginTop: 1 },
  bio: { fontSize: 12, color: Colors.dark.muted, marginTop: 3 },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: Colors.dark.muted,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8,
    textTransform: 'uppercase', letterSpacing: 1.2,
  },
  section: {
    backgroundColor: Colors.dark.card, borderRadius: 16,
    marginHorizontal: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', padding: 14, gap: 14,
    borderBottomWidth: 0.5, borderBottomColor: Colors.dark.border,
  },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: 15, color: Colors.dark.text, fontWeight: '500' },
  rowSubtitle: { fontSize: 12, color: Colors.dark.muted, marginTop: 1 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowValue: { fontSize: 14, color: Colors.dark.muted },
  version: { textAlign: 'center', color: Colors.dark.muted, fontSize: 12, marginVertical: 28 },

  // Bottom Sheet
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#1A1A2E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 28,
    paddingTop: 8,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark.border,
    alignSelf: 'center',
    marginBottom: 18,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFF',
    textAlign: 'center',
    marginBottom: 18,
    paddingHorizontal: 20,
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
  sheetActionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.dark.border,
  },
  sheetActionLabel: {
    flex: 1,
    fontSize: 16,
    color: Colors.dark.text,
    fontWeight: '500',
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

  // Fullscreen Profile Picture Viewer
  viewerOverlay: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerCloseBtn: {
    position: 'absolute',
    top: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 12 : 58,
    left: 16,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerName: {
    position: 'absolute',
    top: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 20 : 66,
    alignSelf: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
    zIndex: 10,
  },
  viewerImage: {
    width: '100%',
    height: '70%',
  },
  emptyBlocked: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  emptyBlockedText: {
    color: Colors.dark.muted,
    fontSize: 14,
    fontWeight: '500',
  },
  blockedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.dark.border,
  },
  blockedAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockedInitial: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
  },
  blockedName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },
  blockedUsername: {
    fontSize: 12,
    color: Colors.dark.muted,
    marginTop: 2,
  },
  unblockBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  unblockBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
});
