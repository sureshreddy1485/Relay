import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Alert, Switch, StatusBar, Platform, Modal,
  TextInput, ActivityIndicator, FlatList,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '../../theme/colors';
import api, { uploadApi } from '../../services/api';
import useAuthStore from '../../store/useAuthStore';
import useChatStore from '../../store/useChatStore';
import DisappearingMsgSheet, { secondsToLabel } from '../../components/DisappearingMsgSheet';

// Member grid item
const MemberGridItem = ({ member, role, isMe, canManage, onAction, onTap }) => (
  <TouchableOpacity
    style={styles.gridItem}
    onPress={() => onTap(member)}
    onLongPress={() => !isMe && canManage && onAction(member)}
    activeOpacity={0.7}
  >
    <View style={styles.gridAvatarWrap}>
      {member.profilePicture ? (
        <Image source={{ uri: member.profilePicture }} style={styles.gridAvatar} />
      ) : (
        <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.gridAvatar}>
          <Text style={styles.gridInitial}>
            {(member.displayName || member.username).charAt(0).toUpperCase()}
          </Text>
        </LinearGradient>
      )}

      {/* Dynamic role icon badge at bottom-right */}
      <View style={[
        styles.roleIconBadge,
        role === 'owner' ? styles.badgeOwner : role === 'admin' ? styles.badgeAdmin : styles.badgeUser
      ]}>
        <Ionicons
          name={role === 'owner' ? 'star' : role === 'admin' ? 'shield-checkmark' : 'person'}
          size={9}
          color="#FFF"
        />
      </View>
    </View>

    <Text style={styles.gridName} numberOfLines={1}>
      {member.displayName || member.username}
    </Text>
    {isMe && <Text style={styles.gridMeText}>You</Text>}
  </TouchableOpacity>
);

export default function GroupInfoScreen({ route, navigation }) {
  const { chat: initialChat } = route.params;
  const { user } = useAuthStore();
  const [chat, setChat] = useState(initialChat);
  const [dmAllowed, setDmAllowed] = useState(chat.allowDirectMessages !== false);
  const [showDisappear, setShowDisappear] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState(chat.chatName || '');
  const [editDesc, setEditDesc] = useState(chat.groupDescription || '');
  const [editAvatar, setEditAvatar] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [addSearchQuery, setAddSearchQuery] = useState('');
  const [addSearchResults, setAddSearchResults] = useState([]);
  const [isSearchingAdd, setIsSearchingAdd] = useState(false);
  const [isAddingUser, setIsAddingUser] = useState(null);

  const myId = user?._id;
  const isOwner = chat.groupAdmin?._id === myId || chat.groupAdmin === myId;
  const isAdmin = chat.admins?.some(a => (a._id || a) === myId) || isOwner;

  const getRole = (memberId) => {
    const id = memberId?._id || memberId;
    const ownerId = chat.groupAdmin?._id || chat.groupAdmin;
    if (id === ownerId || id?.toString() === ownerId?.toString()) return 'owner';
    if (chat.admins?.some(a => (a._id || a)?.toString() === id?.toString())) return 'admin';
    return null;
  };

  // Toggle DMs from group (only admins can)
  const toggleDM = async (val) => {
    if (!isAdmin) {
      Alert.alert('Permission denied', 'Only admins can change this setting.');
      return;
    }
    try {
      setDmAllowed(val);
      // Update via group update endpoint
      await api.put(`/chats/group/${chat._id}`, { allowDirectMessages: val });
    } catch (e) {
      setDmAllowed(!val);
      Alert.alert('Error', e.message);
    }
  };

  // Leave group
  const handleLeave = () => {
    Alert.alert(
      isOwner ? 'Transfer & Leave' : 'Leave Group',
      isOwner
        ? 'You are the owner. Leaving will transfer ownership to the next admin.'
        : `Leave "${chat.chatName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave', style: 'destructive',
          onPress: async () => {
            try {
              await api.put(`/chats/group/${chat._id}/leave`);
              navigation.popToTop();
            } catch (e) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ]
    );
  };

  const handleAddSearch = async () => {
    if (addSearchQuery.trim().length < 3) {
      Alert.alert('Search', 'Type at least 3 characters to search users.');
      return;
    }
    setIsSearchingAdd(true);
    try {
      const { data } = await api.get(`/users/search?q=${addSearchQuery.trim()}`);
      // Filter out users already in the group
      const existingIds = (chat.users || []).map(u => (u._id || u).toString());
      const filtered = (data.users || []).filter(u => !existingIds.includes(u._id.toString()));
      setAddSearchResults(filtered);
    } catch (e) {
      Alert.alert('Error', e.message || 'Search failed');
    } finally {
      setIsSearchingAdd(false);
    }
  };

  const handleAddUserToGroup = async (userId) => {
    setIsAddingUser(userId);
    try {
      const { data } = await api.put(`/chats/group/${chat._id}/add`, { userId });
      // Update local state and chat store
      setChat(data.chat);
      useChatStore.getState().addChat(data.chat);
      Alert.alert('Success', 'User added to group successfully!');
      setShowAddMemberModal(false);
      setAddSearchQuery('');
      setAddSearchResults([]);
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to add user');
    } finally {
      setIsAddingUser(null);
    }
  };

  // Long-press member action (admin only)
  const handleMemberAction = (member) => {
    const memberId = member._id;
    const memberRole = getRole(memberId);
    const actions = [];

    if (isOwner && memberRole !== 'owner') {
      if (memberRole !== 'admin') {
        actions.push({
          text: 'Promote to Admin',
          onPress: async () => {
            try {
              await api.put(`/chats/group/${chat._id}/promote`, { userId: memberId });
              setChat(prev => ({ ...prev, admins: [...prev.admins, memberId] }));
              Alert.alert('Done', `${member.displayName || member.username} is now an admin.`);
            } catch (e) { Alert.alert('Error', e.message); }
          },
        });
      } else {
        actions.push({
          text: 'Demote to Member',
          onPress: async () => {
            try {
              await api.put(`/chats/group/${chat._id}/demote`, { userId: memberId });
              setChat(prev => ({ ...prev, admins: prev.admins.filter(a => (a._id || a) !== memberId) }));
              Alert.alert('Done', `${member.displayName || member.username} is now a member.`);
            } catch (e) { Alert.alert('Error', e.message); }
          },
        });
      }

      actions.push({
        text: 'Remove from Group',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.put(`/chats/group/${chat._id}/remove`, { userId: memberId });
            setChat(prev => ({ 
              ...prev, 
              users: prev.users.filter(u => (u._id || u) !== memberId),
              admins: prev.admins.filter(a => (a._id || a) !== memberId) 
            }));
          } catch (e) { Alert.alert('Error', e.message); }
        },
      });
    } else if (isAdmin && !isOwner && memberRole === null) {
      // Admins can remove regular members
      actions.push({
        text: 'Remove from Group',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.put(`/chats/group/${chat._id}/remove`, { userId: memberId });
            setChat(prev => ({ ...prev, users: prev.users.filter(u => (u._id || u) !== memberId) }));
          } catch (e) { Alert.alert('Error', e.message); }
        },
      });
    }

    if (actions.length === 0) return;
    Alert.alert(
      member.displayName || member.username,
      'Choose an action:',
      [...actions, { text: 'Cancel', style: 'cancel' }]
    );
  };

  // Sort: owner first, then admins, then members
  const sortedMembers = [...(chat.users || [])].sort((a, b) => {
    const ra = getRole(a._id || a);
    const rb = getRole(b._id || b);
    const rank = { owner: 0, admin: 1, null: 2 };
    return (rank[ra] ?? 2) - (rank[rb] ?? 2);
  });

  const memberCount = chat.users?.length || 0;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Group Info</Text>
        {isAdmin && (
          <TouchableOpacity
            style={{ padding: 4 }}
            onPress={() => {
              setEditName(chat.chatName || '');
              setEditDesc(chat.groupDescription || '');
              setEditAvatar(null);
              setShowEditModal(true);
            }}
          >
            <Ionicons name="pencil-outline" size={20} color={Colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* ── Group Profile ─────────────────────────────────────────────── */}
        <View style={styles.profileSection}>
          {chat.groupPicture ? (
            <Image source={{ uri: chat.groupPicture }} style={styles.groupAvatar} />
          ) : (
            <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.groupAvatar}>
              <Text style={styles.groupInitial}>{chat.chatName?.charAt(0).toUpperCase()}</Text>
            </LinearGradient>
          )}
          <Text style={styles.groupName}>{chat.chatName}</Text>
          {chat.groupDescription ? (
            <Text style={styles.groupDesc}>{chat.groupDescription}</Text>
          ) : null}
          <View style={styles.memberCountBadge}>
            <Ionicons name="people-outline" size={14} color={Colors.dark.muted} />
            <Text style={styles.memberCountText}>{memberCount} members</Text>
          </View>
        </View>

        {/* ── Settings ─────────────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Settings</Text>
        <View style={styles.card}>
          {/* DM Toggle */}
          <View style={styles.settingRow}>
            <View style={[styles.settingIcon, { backgroundColor: Colors.primary + '20' }]}>
              <Ionicons name="chatbubble-ellipses-outline" size={20} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingLabel}>Allow Direct Messages</Text>
              <Text style={styles.settingSubtitle}>Members can DM each other</Text>
            </View>
            <Switch
              value={dmAllowed}
              onValueChange={toggleDM}
              trackColor={{ false: Colors.dark.border, true: Colors.primary }}
              thumbColor="#FFF"
              disabled={!isAdmin}
            />
          </View>

          <View style={styles.divider} />

          {/* Disappearing messages */}
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => {
              if (!isAdmin) {
                Alert.alert('Permission Denied', 'Only group admins and the owner can change disappearing messages settings.');
                return;
              }
              setShowDisappear(true);
            }}
          >
            <View style={[styles.settingIcon, { backgroundColor: Colors.primary + '20' }]}>
              <Ionicons name="time-outline" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.settingLabel}>Disappearing Messages</Text>
            <Text style={styles.settingValue}>{secondsToLabel(chat.disappearAfter || 0)}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Members ───────────────────────────────────────────────────── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 16, marginTop: 16, marginBottom: 8 }}>
          <Text style={[styles.sectionTitle, { marginTop: 0, marginBottom: 0 }]}>Members — {memberCount} / 50</Text>
          {isAdmin && (
            <TouchableOpacity 
              onPress={() => setShowAddMemberModal(true)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primary + '15', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }}
            >
              <Ionicons name="person-add-outline" size={14} color={Colors.primary} />
              <Text style={{ color: Colors.primary, fontSize: 13, fontWeight: '700' }}>Add Member</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.membersGridContainer}>
          {sortedMembers.map((member) => {
            const id = member._id || member;
            const isMe = id?.toString() === myId?.toString();
            return (
              <MemberGridItem
                key={id}
                member={typeof member === 'object' ? member : { _id: member, username: 'Unknown' }}
                role={getRole(id)}
                isMe={isMe}
                canManage={isOwner || isAdmin}
                onAction={handleMemberAction}
                onTap={(m) => {
                  if (isMe) return;
                  setSelectedMember(m);
                }}
              />
            );
          })}
        </View>

        {/* ── Danger zone ───────────────────────────────────────────────── */}
        <View style={[styles.card, { marginTop: 8 }]}>
          <TouchableOpacity style={styles.settingRow} onPress={handleLeave}>
            <View style={[styles.settingIcon, { backgroundColor: '#FF444420' }]}>
              <Ionicons name="exit-outline" size={20} color="#FF4444" />
            </View>
            <Text style={[styles.settingLabel, { color: '#FF4444' }]}>
              {isOwner ? 'Transfer & Leave Group' : 'Leave Group'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Disappearing Messages Sheet */}
      <DisappearingMsgSheet
        visible={showDisappear}
        currentSeconds={chat.disappearAfter || 0}
        onSelect={async (seconds) => {
          try {
            await api.put(`/chats/${chat._id}/disappear`, { seconds });
            setChat(prev => ({ ...prev, disappearAfter: seconds }));
            useChatStore.getState().updateChat(chat._id, { disappearAfter: seconds });
          } catch (e) { Alert.alert('Error', e.message); }
        }}
        onClose={() => setShowDisappear(false)}
      />

      {/* ── Edit Group Modal ────────────────────────────────────────── */}
      <Modal visible={showEditModal} transparent animationType="slide" onRequestClose={() => setShowEditModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowEditModal(false)}>
          <View style={styles.editSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.editHandle} />
            <Text style={styles.editTitle}>Edit Group</Text>

            {/* Group Avatar Picker */}
            <TouchableOpacity
              style={styles.editAvatarWrap}
              onPress={async () => {
                const result = await ImagePicker.launchImageLibraryAsync({
                  mediaTypes: ['images'],
                  allowsEditing: true, aspect: [1, 1], quality: 0.8,
                });
                if (!result.canceled) setEditAvatar(result.assets[0]);
              }}
            >
              {editAvatar ? (
                <Image source={{ uri: editAvatar.uri }} style={styles.editAvatarImg} />
              ) : chat.groupPicture ? (
                <Image source={{ uri: chat.groupPicture }} style={styles.editAvatarImg} />
              ) : (
                <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.editAvatarImg}>
                  <Ionicons name="camera" size={28} color="#FFF" />
                </LinearGradient>
              )}
              <View style={styles.editCamBadge}>
                <Ionicons name="camera" size={14} color="#FFF" />
              </View>
            </TouchableOpacity>

            {/* Group Name */}
            <Text style={styles.editLabel}>Group Name</Text>
            <TextInput
              style={styles.editInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Enter group name"
              placeholderTextColor={Colors.dark.muted}
              maxLength={50}
            />

            {/* Group Description */}
            <Text style={styles.editLabel}>Description</Text>
            <TextInput
              style={[styles.editInput, { minHeight: 80, textAlignVertical: 'top' }]}
              value={editDesc}
              onChangeText={setEditDesc}
              placeholder="What's this group about?"
              placeholderTextColor={Colors.dark.muted}
              multiline
              maxLength={300}
            />

            {/* Save Button */}
            <TouchableOpacity
              style={styles.editSaveBtn}
              disabled={isSaving}
              onPress={async () => {
                if (!editName.trim()) { Alert.alert('Error', 'Group name is required.'); return; }
                setIsSaving(true);
                try {
                  const formData = new FormData();
                  formData.append('name', editName.trim());
                  formData.append('description', editDesc.trim());
                  if (editAvatar) {
                    formData.append('groupPicture', {
                      uri: editAvatar.uri, name: 'groupPic.jpg', type: 'image/jpeg',
                    });
                  }
                  const { data } = await uploadApi.put(`/chats/group/${chat._id}`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                  });
                  setChat(prev => ({
                    ...prev,
                    chatName: data.chat?.chatName || editName.trim(),
                    groupDescription: data.chat?.groupDescription || editDesc.trim(),
                    groupPicture: data.chat?.groupPicture || prev.groupPicture,
                  }));
                  useChatStore.getState().updateChat(chat._id, {
                    chatName: editName.trim(),
                    groupDescription: editDesc.trim(),
                    groupPicture: data.chat?.groupPicture || chat.groupPicture,
                  });
                  setShowEditModal(false);
                  Alert.alert('✨', 'Group updated!');
                } catch (e) {
                  Alert.alert('Error', e.response?.data?.message || e.message);
                } finally { setIsSaving(false); }
              }}
            >
              <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.editSaveGrad}>
                {isSaving ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.editSaveText}>Save Changes</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Member Profile Sheet ──────────────────────────────────── */}
      <Modal visible={!!selectedMember} transparent animationType="slide" onRequestClose={() => setSelectedMember(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSelectedMember(null)}>
          <View style={styles.memberSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.editHandle} />

            {/* Member Avatar */}
            <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 20 }}>
              {selectedMember?.profilePicture ? (
                <Image source={{ uri: selectedMember.profilePicture }} style={styles.memberSheetAvatar} />
              ) : (
                <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.memberSheetAvatar}>
                  <Text style={{ fontSize: 32, fontWeight: '800', color: '#FFF' }}>
                    {(selectedMember?.displayName || selectedMember?.username || '?').charAt(0).toUpperCase()}
                  </Text>
                </LinearGradient>
              )}
              <Text style={styles.memberSheetName}>{selectedMember?.displayName || selectedMember?.username}</Text>
              <Text style={styles.memberSheetUsername}>@{selectedMember?.username}</Text>
            </View>

            {/* Actions */}
            <View style={styles.memberSheetActions}>
              {/* Message / DM */}
              <TouchableOpacity
                style={[styles.memberSheetItem, !dmAllowed && styles.memberSheetItemDisabled]}
                disabled={!dmAllowed}
                onPress={async () => {
                  const memberId = selectedMember._id;
                  setSelectedMember(null);
                  try {
                    const { data } = await api.post('/chats', { userId: memberId });
                    navigation.push('ChatRoom', { chat: data.chat });
                  } catch (e) { Alert.alert('Error', e.message); }
                }}
              >
                <Ionicons name="chatbubble-outline" size={20} color={dmAllowed ? Colors.dark.text : Colors.dark.muted} />
                <Text style={[styles.memberSheetLabel, !dmAllowed && { color: Colors.dark.muted }]}>Message</Text>
                {!dmAllowed && <Text style={styles.memberSheetSub}>DMs disabled</Text>}
              </TouchableOpacity>

              <View style={styles.divider} />

              {/* Add Friend */}
              <TouchableOpacity
                style={styles.memberSheetItem}
                onPress={async () => {
                  const memberId = selectedMember._id;
                  try {
                    await api.post(`/users/${memberId}/friend-request`);
                    Alert.alert('✅', 'Friend request sent!');
                  } catch (e) {
                    Alert.alert('Info', e.response?.data?.message || e.message);
                  }
                }}
              >
                <Ionicons name="person-add-outline" size={20} color={Colors.dark.text} />
                <Text style={styles.memberSheetLabel}>Add Friend</Text>
              </TouchableOpacity>

              <View style={styles.divider} />

              {/* View Profile */}
              <TouchableOpacity
                style={styles.memberSheetItem}
                onPress={() => {
                  setSelectedMember(null);
                  navigation.navigate('UserProfile', { username: selectedMember.username });
                }}
              >
                <Ionicons name="person-outline" size={20} color={Colors.dark.text} />
                <Text style={styles.memberSheetLabel}>View Profile</Text>
              </TouchableOpacity>
            </View>

            {/* Cancel */}
            <TouchableOpacity style={styles.memberSheetCancel} onPress={() => setSelectedMember(null)}>
              <Text style={styles.memberSheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Add Member Modal ─────────────────────────────────────────── */}
      <Modal visible={showAddMemberModal} transparent animationType="slide" onRequestClose={() => setShowAddMemberModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowAddMemberModal(false)}>
          <View style={styles.memberSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.editHandle} />
            <Text style={[styles.memberSheetName, { color: Colors.primary, fontSize: 18, marginBottom: 16 }]}>Add People to Group</Text>

            {/* Search Input */}
            <View style={styles.addSearchWrap}>
              <Ionicons name="search-outline" size={18} color={Colors.dark.muted} />
              <TextInput
                style={styles.addSearchInput}
                placeholder="Search username to add..."
                placeholderTextColor={Colors.dark.muted}
                value={addSearchQuery}
                onChangeText={setAddSearchQuery}
                autoCapitalize="none"
                onSubmitEditing={handleAddSearch}
              />
              {addSearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => { setAddSearchQuery(''); setAddSearchResults([]); }}>
                  <Ionicons name="close-circle" size={18} color={Colors.dark.muted} />
                </TouchableOpacity>
              )}
            </View>
            
            <TouchableOpacity 
              onPress={handleAddSearch} 
              style={styles.addSearchBtn}
              disabled={isSearchingAdd}
            >
              {isSearchingAdd ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.addSearchBtnText}>Search</Text>
              )}
            </TouchableOpacity>

            {/* Results */}
            <FlatList
              data={addSearchResults}
              keyExtractor={(item) => item._id}
              style={{ maxHeight: 220, marginVertical: 8 }}
              ListEmptyComponent={() => (
                <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                  <Text style={{ color: Colors.dark.muted, fontSize: 13 }}>
                    {addSearchQuery.trim().length >= 3 ? 'No results found' : 'Enter 3+ characters to search'}
                  </Text>
                </View>
              )}
              renderItem={({ item }) => (
                <View style={styles.addResultItem}>
                  {item.profilePicture ? (
                    <Image source={{ uri: item.profilePicture }} style={styles.addAvatar} />
                  ) : (
                    <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.addAvatar}>
                      <Text style={styles.addAvatarInitial}>
                        {(item.displayName || item.username).charAt(0).toUpperCase()}
                      </Text>
                    </LinearGradient>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: Colors.dark.text, fontSize: 14, fontWeight: '600' }}>
                      {item.displayName || item.username}
                    </Text>
                    <Text style={{ color: Colors.dark.muted, fontSize: 12 }}>
                      @{item.username}
                    </Text>
                  </View>
                  <TouchableOpacity 
                    onPress={() => handleAddUserToGroup(item._id)}
                    style={styles.addButton}
                    disabled={isAddingUser === item._id}
                  >
                    {isAddingUser === item._id ? (
                      <ActivityIndicator color="#FFF" size="small" />
                    ) : (
                      <>
                        <Ionicons name="add" size={14} color="#FFF" />
                        <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }}>Add</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            />

            {/* Cancel */}
            <TouchableOpacity style={styles.memberSheetCancel} onPress={() => { setShowAddMemberModal(false); setAddSearchQuery(''); setAddSearchResults([]); }}>
              <Text style={styles.memberSheetCancelText}>Cancel</Text>
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
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.dark.text, flex: 1, textAlign: 'center' },

  // Profile
  profileSection: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20 },
  groupAvatar: {
    width: 96, height: 96, borderRadius: 48,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  groupInitial: { fontSize: 38, fontWeight: '800', color: '#FFF' },
  groupName: { fontSize: 22, fontWeight: '800', color: '#FFF', textAlign: 'center' },
  groupDesc: { fontSize: 14, color: Colors.dark.muted, textAlign: 'center', marginTop: 6, lineHeight: 20 },
  memberCountBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.dark.card, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 6, marginTop: 12,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  memberCountText: { color: Colors.dark.muted, fontSize: 13 },

  // Section
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: Colors.dark.muted,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8,
    textTransform: 'uppercase', letterSpacing: 1.2,
  },
  card: {
    backgroundColor: Colors.dark.card, borderRadius: 16,
    marginHorizontal: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.dark.border,
  },

  // Settings rows
  settingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  settingIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  settingLabel: { flex: 1, fontSize: 15, color: Colors.dark.text, fontWeight: '500' },
  settingSubtitle: { fontSize: 12, color: Colors.dark.muted, marginTop: 1 },
  settingValue: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  divider: { height: 0.5, backgroundColor: Colors.dark.border, marginLeft: 66 },

  // Member Grid & Badges
  membersGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 16,
    backgroundColor: Colors.dark.card,
    borderRadius: 16,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  gridItem: {
    width: '18%', // perfectly formats 5 columns per row!
    alignItems: 'center',
    marginBottom: 12,
  },
  gridAvatarWrap: {
    position: 'relative',
    marginBottom: 6,
  },
  gridAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridInitial: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  gridName: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.dark.text,
    textAlign: 'center',
    width: '100%',
  },
  gridMeText: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.primary,
    marginTop: 1,
  },
  roleIconBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.dark.card,
  },
  badgeOwner: { backgroundColor: '#FFD700' }, // Gold
  badgeAdmin: { backgroundColor: Colors.primary }, // Cyan
  badgeUser: { backgroundColor: '#4B5563' }, // Gray

  // Modal overlay
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },

  // Edit Group Modal
  editSheet: {
    backgroundColor: Colors.dark.bg,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingBottom: 30, paddingTop: 8,
    borderTopWidth: 2, borderTopColor: Colors.primary,
  },
  editHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.primary, alignSelf: 'center', marginBottom: 16,
  },
  editTitle: { fontSize: 18, fontWeight: '700', color: Colors.primary, textAlign: 'center', marginBottom: 20 },
  editAvatarWrap: { alignSelf: 'center', marginBottom: 20, position: 'relative' },
  editAvatarImg: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.primary,
  },
  editCamBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.dark.bg,
  },
  editLabel: { fontSize: 13, fontWeight: '600', color: Colors.primary, marginBottom: 6, marginTop: 4 },
  editInput: {
    backgroundColor: Colors.dark.card, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 15, color: Colors.dark.text, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.primary + '40',
  },
  editSaveBtn: { marginTop: 8 },
  editSaveGrad: {
    borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  editSaveText: { fontSize: 16, fontWeight: '700', color: '#FFF' },

  // Member Profile Sheet
  memberSheet: {
    backgroundColor: Colors.dark.bg,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 16, paddingBottom: 28, paddingTop: 8,
    borderTopWidth: 2, borderTopColor: Colors.primary,
  },
  memberSheetAvatar: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    borderWidth: 2, borderColor: Colors.primary,
  },
  memberSheetName: { fontSize: 20, fontWeight: '800', color: '#FFF', textAlign: 'center' },
  memberSheetUsername: { fontSize: 14, color: Colors.primary, marginTop: 2 },
  memberSheetActions: {
    backgroundColor: Colors.dark.card, borderRadius: 16,
    overflow: 'hidden', borderWidth: 1, borderColor: Colors.primary + '30',
    marginBottom: 12,
  },
  memberSheetItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 18, paddingVertical: 16,
  },
  memberSheetItemDisabled: { opacity: 0.4 },
  memberSheetLabel: { flex: 1, fontSize: 15, color: Colors.dark.text, fontWeight: '500' },
  memberSheetSub: { fontSize: 11, color: Colors.dark.muted, fontStyle: 'italic' },
  memberSheetCancel: {
    backgroundColor: Colors.dark.card, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.primary + '30',
  },
  memberSheetCancelText: { fontSize: 16, fontWeight: '600', color: Colors.primary },

  // Add Member
  addSearchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.dark.card, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: Colors.primary + '30',
    marginBottom: 8,
  },
  addSearchInput: { flex: 1, color: Colors.dark.text, fontSize: 15 },
  addSearchBtn: {
    backgroundColor: Colors.primary, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginBottom: 12,
  },
  addSearchBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  addResultItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: Colors.dark.border,
  },
  addAvatar: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  addAvatarInitial: {
    fontSize: 14, fontWeight: '700', color: '#FFF',
  },
  addButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.primary, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
  },
});
