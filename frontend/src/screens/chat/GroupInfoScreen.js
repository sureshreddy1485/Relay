import React, { useState, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Alert, Switch, StatusBar, Platform, Modal,
  TextInput, ActivityIndicator, FlatList, KeyboardAvoidingView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '../../theme/colors';
import api, { uploadApi } from '../../services/api';
import useAuthStore from '../../store/useAuthStore';
import useChatStore from '../../store/useChatStore';
import DisappearingMsgSheet, { secondsToLabel } from '../../components/DisappearingMsgSheet';
import ThemeSelectSheet from '../../components/ThemeSelectSheet';
import { getSocket } from '../../services/socketService';
import { useAlert } from '../../components/CustomAlert';

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
        role === 'system_bot' ? { backgroundColor: '#3B82F6' } :
        role === 'owner' ? styles.badgeOwner : 
        role === 'admin' ? styles.badgeAdmin : styles.badgeUser
      ]}>
        <Ionicons
          name={role === 'system_bot' ? 'hardware-chip' : role === 'owner' ? 'star' : role === 'admin' ? 'shield-checkmark' : 'person'}
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
  const { showAlert } = useAlert();
  const insets = useSafeAreaInsets();
  const { chat: initialChat } = route.params;
  const { user } = useAuthStore();
  const [chat, setChat] = useState(initialChat);
  const [showDisappear, setShowDisappear] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState(chat.chatName || '');
  const [editDesc, setEditDesc] = useState(chat.groupDescription || '');
  const [editPrivacy, setEditPrivacy] = useState(chat.joinPrivacy || 'anyone');
  const [editIsPublic, setEditIsPublic] = useState(chat.isPublic !== false);
  const [editAvatar, setEditAvatar] = useState(null);
  const [showFullAvatar, setShowFullAvatar] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [addSearchQuery, setAddSearchQuery] = useState('');
  const [addSearchResults, setAddSearchResults] = useState([]);
  const [isSearchingAdd, setIsSearchingAdd] = useState(false);
  const [isAddingUser, setIsAddingUser] = useState(null);
  const [showBulkRemoveModal, setShowBulkRemoveModal] = useState(false);
  const [selectedForRemoval, setSelectedForRemoval] = useState([]);
  const [isBulkRemoving, setIsBulkRemoving] = useState(false);
  const [expandedSection, setExpandedSection] = useState(null);

  const toggleSection = (sectionName) => {
    setExpandedSection(prev => prev === sectionName ? null : sectionName);
  };

  const myId = user?._id;
  const isOwner = chat.groupAdmin?._id === myId || chat.groupAdmin === myId;
  const isAdmin = chat.admins?.some(a => (a._id || a) === myId) || isOwner;

  const getRole = (memberId) => {
    const id = memberId?._id || memberId;
    
    // Check if user object has system_bot role
    const fullUser = chat.users?.find(u => (u._id || u).toString() === id?.toString());
    if (fullUser?.role === 'system_bot' || fullUser?.username === 'mica_bot') return 'system_bot';

    const ownerId = chat.groupAdmin?._id || chat.groupAdmin;
    if (id === ownerId || id?.toString() === ownerId?.toString()) return 'owner';
    if (chat.admins?.some(a => (a._id || a)?.toString() === id?.toString())) return 'admin';
    return null;
  };

  // Auto-refresh when the group is updated by anyone (theme, DM settings, name, picture, etc.)
  useEffect(() => {
    const socket = getSocket();
    const handleChatUpdated = (updatedChat) => {
      if (updatedChat._id === chat._id || updatedChat._id?.toString() === chat._id?.toString()) {
        setChat(prev => ({ ...prev, ...updatedChat }));
        useChatStore.getState().updateChat(chat._id, updatedChat);
      }
    };
    if (socket) socket.on('chat_updated', handleChatUpdated);
    return () => {
      if (socket) socket.off('chat_updated', handleChatUpdated);
    };
  }, [chat._id]);

  // Leave group
  const handleLeave = () => {
    showAlert(
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
              showAlert('Error', e.message);
            }
          },
        },
      ]
    );
  };

  const handleAddSearch = async () => {
    if (addSearchQuery.trim().length < 3) {
      showAlert('Search', 'Type at least 3 characters to search users.');
      return;
    }
    setIsSearchingAdd(true);
    try {
      const { data } = await api.get(`/users/search?q=${addSearchQuery.trim()}`);
      // Filter out users already in the group
      const existingIds = (chat.users || []).map(u => (u._id || u).toString());
      const filtered = (data.users || []).filter(u => !existingIds.includes(u._id.toString()) && u.username !== 'relay_bot' && u.username !== 'relay');
      setAddSearchResults(filtered);
    } catch (e) {
      showAlert('Error', e.message || 'Search failed');
    } finally {
      setIsSearchingAdd(false);
    }
  };

  const handleAddUserToGroup = async (userId) => {
    setIsAddingUser(userId);
    try {
      // Add user to invited list on backend
      await api.put(`/chats/group/${chat._id}/invite`, { userId });
      
      // Get/create DM chat to send the invite message
      const { data: chatData } = await api.post('/chats', { userId });
      const dmChatId = chatData.chat._id;
      
      // Send the invite message
      await api.post('/messages', {
        chatId: dmChatId,
        content: JSON.stringify({ groupId: chat._id, groupName: chat.chatName || 'Group' }),
        messageType: 'group_invite',
      });

      showAlert('Invite Sent', 'An invitation has been sent to the user in their direct messages.');
      setShowAddMemberModal(false);
      setAddSearchQuery('');
      setAddSearchResults([]);
    } catch (e) {
      showAlert('Error', e.response?.data?.message || e.message || 'Failed to send invite');
    } finally {
      setIsAddingUser(null);
    }
  };

  // Long-press member action (admin only)
  const handleMemberAction = (member) => {
    const memberId = member._id;
    const memberRole = getRole(memberId);
    
    if (memberRole === 'system_bot') {
      showAlert('System Assistant', 'Mica cannot be modified or removed.');
      return;
    }

    const actions = [];

    if (isOwner && memberRole !== 'owner') {
      if (memberRole !== 'admin') {
        actions.push({
          text: 'Promote to Admin',
          onPress: async () => {
            const previousAdmins = chat.admins;
            const updatedChat = { ...chat, admins: [...chat.admins, memberId] };
            setChat(updatedChat);
            useChatStore.getState().updateChat(chat._id, updatedChat);
            try {
              await api.put(`/chats/group/${chat._id}/promote`, { userId: memberId });
              showAlert('Done', `${member.displayName || member.username} is now an admin.`);
            } catch (e) {
              const revertedChat = { ...chat, admins: previousAdmins };
              setChat(revertedChat);
              useChatStore.getState().updateChat(chat._id, revertedChat);
              showAlert('Error', e.message); 
            }
          },
        });
      } else {
        actions.push({
          text: 'Demote to Member',
          onPress: async () => {
            const previousAdmins = chat.admins;
            const updatedChat = { ...chat, admins: chat.admins.filter(a => (a._id || a) !== memberId) };
            setChat(updatedChat);
            useChatStore.getState().updateChat(chat._id, updatedChat);
            try {
              await api.put(`/chats/group/${chat._id}/demote`, { userId: memberId });
              showAlert('Done', `${member.displayName || member.username} is now a member.`);
            } catch (e) { 
              const revertedChat = { ...chat, admins: previousAdmins };
              setChat(revertedChat);
              useChatStore.getState().updateChat(chat._id, revertedChat);
              showAlert('Error', e.message); 
            }
          },
        });
      }
      
      actions.push({
        text: 'Transfer Ownership',
        onPress: () => {
          showAlert(
            'Transfer Ownership',
            `Are you sure you want to transfer ownership of this group to ${member.displayName || member.username}? You will become a regular admin.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Transfer',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await api.put(`/chats/group/${chat._id}/transfer-ownership`, { userId: memberId });
                    showAlert('Success', `Ownership transferred to ${member.displayName || member.username}.`);
                  } catch (e) {
                    showAlert('Error', e.message);
                  }
                }
              }
            ]
          );
        }
      });

      actions.push({
        text: 'Remove from Group',
        style: 'destructive',
        onPress: async () => {
          const previousUsers = chat.users;
          const previousAdmins = chat.admins;
          const updatedChat = { 
            ...chat, 
            users: chat.users.filter(u => (u._id || u) !== memberId),
            admins: chat.admins.filter(a => (a._id || a) !== memberId) 
          };
          setChat(updatedChat);
          useChatStore.getState().updateChat(chat._id, updatedChat);
          try {
            await api.put(`/chats/group/${chat._id}/remove`, { userId: memberId });
          } catch (e) { 
            const revertedChat = { ...chat, users: previousUsers, admins: previousAdmins };
            setChat(revertedChat);
            useChatStore.getState().updateChat(chat._id, revertedChat);
            showAlert('Error', e.message); 
          }
        },
      });
    } else if (isAdmin && !isOwner && memberRole === null) {
      // Admins can remove regular members
      actions.push({
        text: 'Remove from Group',
        style: 'destructive',
        onPress: async () => {
          const previousUsers = chat.users;
          const updatedChat = { ...chat, users: chat.users.filter(u => (u._id || u) !== memberId) };
          setChat(updatedChat);
          useChatStore.getState().updateChat(chat._id, updatedChat);
          try {
            await api.put(`/chats/group/${chat._id}/remove`, { userId: memberId });
          } catch (e) { 
            const revertedChat = { ...chat, users: previousUsers };
            setChat(revertedChat);
            useChatStore.getState().updateChat(chat._id, revertedChat);
            showAlert('Error', e.message); 
          }
        },
      });
    }

    if (actions.length === 0) return;
    showAlert(
      member.displayName || member.username,
      'Choose an action:',
      [...actions, { text: 'Cancel', style: 'cancel' }]
    );
  };

  const handleBulkRemoveSubmit = async () => {
    if (selectedForRemoval.length === 0) return;
    showAlert(
      'Remove Members',
      `Are you sure you want to remove ${selectedForRemoval.length} member(s)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setIsBulkRemoving(true);
            try {
              // Optimistically update UI
              const previousUsers = chat.users;
              const previousAdmins = chat.admins;
              const updatedChat = { 
                ...chat, 
                users: chat.users.filter(u => !selectedForRemoval.includes((u._id || u).toString())),
                admins: chat.admins.filter(a => !selectedForRemoval.includes((a._id || a).toString())) 
              };
              setChat(updatedChat);
              useChatStore.getState().updateChat(chat._id, updatedChat);

              // API call
              await api.put(`/chats/group/${chat._id}/remove`, { userIds: selectedForRemoval });
              setShowBulkRemoveModal(false);
              setSelectedForRemoval([]);
            } catch (e) {
              showAlert('Error', e.message);
              // Revert
            } finally {
              setIsBulkRemoving(false);
            }
          }
        }
      ]
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
      <View style={[styles.header, { paddingTop: (insets.top || StatusBar.currentHeight || 0) + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4 }}>
          <Ionicons name="close" size={24} color={Colors.dark.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Group Info</Text>
        {isAdmin && (
          <TouchableOpacity
            style={{ padding: 4 }}
            onPress={() => {
              setEditName(chat.chatName || '');
              setEditDesc(chat.groupDescription || '');
              setEditPrivacy(chat.joinPrivacy || 'anyone');
              setEditIsPublic(chat.isPublic !== false);
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
          <TouchableOpacity 
            activeOpacity={0.8}
            onPress={() => { if (chat.groupPicture) setShowFullAvatar(true); }}
          >
            {chat.groupPicture ? (
              <Image source={{ uri: chat.groupPicture }} style={styles.groupAvatar} />
            ) : (
              <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.groupAvatar}>
                <Text style={styles.groupInitial}>{chat.chatName?.charAt(0).toUpperCase()}</Text>
              </LinearGradient>
            )}
          </TouchableOpacity>
          <Text style={styles.groupName}>{chat.chatName}</Text>
          {chat.groupUsername ? (
            <Text style={{ color: Colors.primary, fontSize: 15, fontWeight: '600', marginTop: 4 }}>
              @{chat.groupUsername}
            </Text>
          ) : null}
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

        {/* Category: Media & Appearance */}
        <View style={[styles.card, { marginBottom: 12, overflow: 'hidden' }]}>
          <TouchableOpacity style={styles.settingRow} onPress={() => toggleSection('media')}>
            <View style={[styles.settingIcon, { backgroundColor: Colors.primary + '20' }]}>
              <Ionicons name="color-palette-outline" size={20} color={Colors.primary} />
            </View>
            <Text style={[styles.settingLabel, { fontWeight: '700' }]}>Media & Appearance</Text>
            <Ionicons name={expandedSection === 'media' ? "chevron-up" : "chevron-down"} size={20} color={Colors.dark.muted} />
          </TouchableOpacity>
          
          {expandedSection === 'media' && (
            <View style={{ backgroundColor: 'rgba(0,0,0,0.2)', paddingVertical: 4 }}>
              <TouchableOpacity
                style={[styles.settingRow, { paddingVertical: 12, paddingLeft: 56 }]}
                onPress={() => navigation.navigate('SharedMedia', { chatId: chat._id })}
              >
                <Text style={styles.settingLabel}>Shared Media</Text>
                <Ionicons name="images-outline" size={18} color={Colors.dark.muted} />
              </TouchableOpacity>
              
              {isAdmin && (
                <>
                  <View style={[styles.divider, { marginLeft: 56 }]} />
                  <TouchableOpacity
                    style={[styles.settingRow, { paddingVertical: 12, paddingLeft: 56 }]}
                    onPress={() => setShowTheme(true)}
                  >
                    <Text style={styles.settingLabel}>Change Chat Theme</Text>
                    <Ionicons name="color-wand-outline" size={18} color={Colors.dark.muted} />
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </View>

        {/* Category: Privacy & Security */}
        <View style={[styles.card, { marginBottom: 12, overflow: 'hidden' }]}>
          <TouchableOpacity style={styles.settingRow} onPress={() => toggleSection('security')}>
            <View style={[styles.settingIcon, { backgroundColor: '#10B98120' }]}>
              <Ionicons name="shield-checkmark-outline" size={20} color="#10B981" />
            </View>
            <Text style={[styles.settingLabel, { fontWeight: '700' }]}>Privacy & Security</Text>
            <Ionicons name={expandedSection === 'security' ? "chevron-up" : "chevron-down"} size={20} color={Colors.dark.muted} />
          </TouchableOpacity>
          
          {expandedSection === 'security' && (
            <View style={{ backgroundColor: 'rgba(0,0,0,0.2)', paddingVertical: 4 }}>
              <TouchableOpacity
                style={[styles.settingRow, { paddingVertical: 12, paddingLeft: 56 }]}
                onPress={() => {
                  if (!isAdmin) {
                    showAlert('Permission Denied', 'Only group admins and the owner can change disappearing messages settings.');
                    return;
                  }
                  setShowDisappear(true);
                }}
              >
                <Text style={styles.settingLabel}>Disappearing Messages</Text>
                <Text style={[styles.settingValue, { fontSize: 13 }]}>{secondsToLabel(chat.disappearAfter || 0)}</Text>
              </TouchableOpacity>

              {isAdmin && (
                <>
                  <View style={[styles.divider, { marginLeft: 56 }]} />
                  <View style={[styles.settingRow, { paddingVertical: 12, paddingLeft: 56 }]}>
                    <Text style={styles.settingLabel}>Allow Screenshots</Text>
                    <Switch
                      value={chat.allowScreenshots !== false}
                      onValueChange={async (val) => {
                        const prev = chat.allowScreenshots;
                        setChat(c => ({ ...c, allowScreenshots: val }));
                        useChatStore.getState().updateChat(chat._id, { allowScreenshots: val });
                        try {
                          await api.put(`/chats/${chat._id}/security`, { allowScreenshots: val });
                        } catch (e) {
                          setChat(c => ({ ...c, allowScreenshots: prev }));
                          useChatStore.getState().updateChat(chat._id, { allowScreenshots: prev });
                          showAlert('Error', e.message); 
                        }
                      }}
                      trackColor={{ false: '#3A3A3A', true: Colors.primary }}
                      thumbColor="#FFF"
                      style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                    />
                  </View>

                  <View style={[styles.divider, { marginLeft: 56 }]} />
                  <View style={[styles.settingRow, { paddingVertical: 12, paddingLeft: 56 }]}>
                    <Text style={styles.settingLabel}>Allow Forwarding</Text>
                    <Switch
                      value={chat.allowForwarding !== false}
                      onValueChange={async (val) => {
                        const prev = chat.allowForwarding;
                        setChat(c => ({ ...c, allowForwarding: val }));
                        useChatStore.getState().updateChat(chat._id, { allowForwarding: val });
                        try {
                          await api.put(`/chats/${chat._id}/security`, { allowForwarding: val });
                        } catch (e) {
                          setChat(c => ({ ...c, allowForwarding: prev }));
                          useChatStore.getState().updateChat(chat._id, { allowForwarding: prev });
                          showAlert('Error', e.message); 
                        }
                      }}
                      trackColor={{ false: '#3A3A3A', true: Colors.primary }}
                      thumbColor="#FFF"
                      style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                    />
                  </View>
                </>
              )}
            </View>
          )}
        </View>

        {/* ── Pending Requests ──────────────────────────────────────────────── */}
        {isAdmin && chat.joinRequests?.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Pending Requests ({chat.joinRequests.length})</Text>
            <View style={[styles.card, { paddingVertical: 4 }]}>
              {chat.joinRequests.map(reqUser => (
                <View key={reqUser._id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: Colors.dark.border }}>
                  {reqUser.profilePicture ? (
                    <Image source={{ uri: reqUser.profilePicture }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                  ) : (
                    <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#FFF', fontWeight: 'bold' }}>{(reqUser.displayName || reqUser.username || '?').charAt(0).toUpperCase()}</Text>
                    </LinearGradient>
                  )}
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ color: Colors.dark.text, fontSize: 15, fontWeight: '600' }}>{reqUser.displayName || reqUser.username}</Text>
                    <Text style={{ color: Colors.dark.muted, fontSize: 13 }}>@{reqUser.username}</Text>
                  </View>
                  <TouchableOpacity
                    style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}
                    onPress={async () => {
                      try {
                        const { data } = await api.put(`/chats/group/${chat._id}/accept-request`, { userId: reqUser._id });
                        setChat(data.chat);
                        useChatStore.getState().updateChat(chat._id, data.chat);
                      } catch (e) { showAlert('Error', e.response?.data?.message || e.message); }
                    }}
                  >
                    <Ionicons name="checkmark" size={18} color="#FFF" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.dark.muted + '40', alignItems: 'center', justifyContent: 'center' }}
                    onPress={async () => {
                      try {
                        const { data } = await api.put(`/chats/group/${chat._id}/decline-request`, { userId: reqUser._id });
                        setChat(data.chat);
                        useChatStore.getState().updateChat(chat._id, data.chat);
                      } catch (e) { showAlert('Error', e.response?.data?.message || e.message); }
                    }}
                  >
                    <Ionicons name="close" size={18} color="#FFF" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Members ───────────────────────────────────────────────────── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 16, marginTop: 16, marginBottom: 8 }}>
          <Text style={[styles.sectionTitle, { marginTop: 0, marginBottom: 0 }]}>Members — {memberCount} / 50</Text>
          {isAdmin && (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity 
                onPress={() => setShowBulkRemoveModal(true)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.dark.card, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: Colors.dark.border }}
              >
                <Ionicons name="trash-bin-outline" size={14} color="#EF4444" />
                <Text style={{ color: '#EF4444', fontSize: 13, fontWeight: '700' }}>Manage</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => setShowAddMemberModal(true)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primary + '15', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 }}
              >
                <Ionicons name="person-add-outline" size={14} color={Colors.primary} />
                <Text style={{ color: Colors.primary, fontSize: 13, fontWeight: '700' }}>Add</Text>
              </TouchableOpacity>
            </View>
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
            const res = await api.put(`/chats/${chat._id}/disappear`, { seconds });
            setChat(prev => ({ ...prev, disappearAfter: seconds }));
            useChatStore.getState().updateChat(chat._id, { disappearAfter: seconds });
            if (res.data && res.data.message) {
              useChatStore.getState().addMessage(chat._id, res.data.message);
            }
          } catch (e) { showAlert('Error', e.message); }
        }}
        onClose={() => setShowDisappear(false)}
      />

      {/* Theme Select Sheet */}
      <ThemeSelectSheet
        visible={showTheme}
        currentThemeId={chat?.theme || 'default'}
        isGroup={true}
        onSelect={async (themeId) => {
          try {
            await api.put(`/chats/${chat._id}/theme`, { theme: themeId });
            setChat(prev => ({ ...prev, theme: themeId }));
            useChatStore.getState().updateChat(chat._id, { theme: themeId });
          } catch (e) { showAlert('Error', e.message); }
        }}
        onClose={() => setShowTheme(false)}
      />

      {/* ── Edit Group Modal ────────────────────────────────────────── */}
      <Modal visible={showEditModal} transparent animationType="slide" onRequestClose={() => setShowEditModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowEditModal(false)}>
            <View style={styles.editSheet} onStartShouldSetResponder={() => true}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 16 }}>
              <View style={{ width: 24 }} />
              <Text style={[styles.editTitle, { marginBottom: 0 }]}>Edit Group</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </TouchableOpacity>
            </View>

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

            {/* Public/Private Toggle */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 24, marginTop: 16, marginBottom: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: Colors.dark.text, fontSize: 15, fontWeight: '600' }}>Public Group</Text>
                <Text style={{ color: Colors.dark.muted, fontSize: 13, marginTop: 2 }}>{editIsPublic ? 'Group can be found in search' : 'Hidden from public search'}</Text>
              </View>
              <Switch
                value={editIsPublic}
                onValueChange={setEditIsPublic}
                trackColor={{ false: Colors.dark.border, true: Colors.primary }}
                thumbColor="#FFF"
              />
            </View>

            {/* Join Privacy */}
            <Text style={[styles.editLabel, { marginTop: 16 }]}>Who can join?</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24, marginHorizontal: 24 }}>
              {['anyone', 'invite_only', 'closed'].map(option => (
                <TouchableOpacity
                  key={option}
                  onPress={() => setEditPrivacy(option)}
                  style={[{ flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.dark.border, alignItems: 'center' }, editPrivacy === option && { backgroundColor: Colors.primary + '20', borderColor: Colors.primary }]}
                >
                  <Text style={[{ fontSize: 13, color: Colors.dark.muted, fontWeight: '500' }, editPrivacy === option && { color: Colors.primary, fontWeight: '700' }]}>
                    {option === 'anyone' ? 'Anyone' : option === 'invite_only' ? 'Request' : 'Closed'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Save Button */}
            <TouchableOpacity
              style={styles.editSaveBtn}
              disabled={isSaving}
              onPress={async () => {
                if (!editName.trim()) { showAlert('Error', 'Group name is required.'); return; }
                setIsSaving(true);
                try {
                  const formData = new FormData();
                  formData.append('name', editName.trim());
                  formData.append('description', editDesc.trim());
                  formData.append('joinPrivacy', editPrivacy);
                  formData.append('isPublic', editIsPublic);
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
                    joinPrivacy: data.chat?.joinPrivacy || editPrivacy,
                    isPublic: data.chat?.isPublic ?? editIsPublic,
                    groupPicture: data.chat?.groupPicture || prev.groupPicture,
                  }));
                  useChatStore.getState().updateChat(chat._id, {
                    chatName: editName.trim(),
                    groupDescription: editDesc.trim(),
                    joinPrivacy: data.chat?.joinPrivacy || editPrivacy,
                    isPublic: data.chat?.isPublic ?? editIsPublic,
                    groupPicture: data.chat?.groupPicture || chat.groupPicture,
                  });
                  setShowEditModal(false);
                  showAlert('✨', 'Group updated!');
                } catch (e) {
                  showAlert('Error', e.response?.data?.message || e.message);
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
        </KeyboardAvoidingView>
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
              {(() => {
                let areFriends = false;
                if (selectedMember && selectedMember._id !== myId) {
                   areFriends = user?.friends?.some(f => (f._id || f).toString() === selectedMember._id.toString());
                }
                if (selectedMember?._id === myId || areFriends || selectedMember?.username === 'mica_bot') {
                  return <Text style={styles.memberSheetUsername}>@{selectedMember?.username}</Text>;
                }
                return <Text style={[styles.memberSheetUsername, { fontStyle: 'italic' }]}>@Hidden (Add friend to view)</Text>;
              })()}
            </View>

            {/* Actions */}
            {selectedMember?.role !== 'system_bot' && selectedMember?.username !== 'mica_bot' && (
              <View style={styles.memberSheetActions}>
                {/* Message / DM */}
                {(() => {
                  let isMsgAllowed = true;
                  if (selectedMember && selectedMember._id !== myId) {
                    const areFriends = user?.friends?.some(f => (f._id || f).toString() === selectedMember._id.toString());
                    if (!areFriends) {
                      isMsgAllowed = false; // Strictly disabled for non-friends
                    }
                  }

                return (
                  <TouchableOpacity
                    style={[styles.memberSheetItem, !isMsgAllowed && styles.memberSheetItemDisabled]}
                    disabled={!isMsgAllowed}
                    onPress={async () => {
                      const memberId = selectedMember._id;
                      setSelectedMember(null);
                      try {
                        const { data } = await api.post('/chats', { userId: memberId });
                        navigation.push('ChatRoom', { chat: data.chat });
                      } catch (e) { showAlert('Error', e.message); }
                    }}
                  >
                    <Ionicons name="chatbubble-outline" size={20} color={isMsgAllowed ? Colors.dark.text : Colors.dark.muted} />
                    <Text style={[styles.memberSheetLabel, !isMsgAllowed && { color: Colors.dark.muted }]}>Message</Text>
                    {!isMsgAllowed && <Text style={styles.memberSheetSub}>DMs disabled</Text>}
                  </TouchableOpacity>
                );
              })()}

              <View style={styles.divider} />

              {/* Add Friend */}
              {(() => {
                const areFriends = selectedMember && user?.friends?.some(f => (f._id || f).toString() === selectedMember._id.toString());
                if (areFriends) {
                  return (
                    <View style={styles.memberSheetItem}>
                      <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
                      <Text style={[styles.memberSheetLabel, { color: Colors.primary }]}>Friends</Text>
                    </View>
                  );
                }
                return (
                  <TouchableOpacity
                    style={styles.memberSheetItem}
                    onPress={async () => {
                      const memberId = selectedMember._id;
                      try {
                        await api.post(`/users/${memberId}/friend-request`);
                        showAlert('✅', 'Friend request sent!');
                      } catch (e) {
                        showAlert('Info', e.response?.data?.message || e.message);
                      }
                    }}
                  >
                    <Ionicons name="person-add-outline" size={20} color={Colors.dark.text} />
                    <Text style={styles.memberSheetLabel}>Add Friend</Text>
                  </TouchableOpacity>
                );
              })()}

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
            )}

            {/* Cancel */}
            <TouchableOpacity style={styles.memberSheetCancel} onPress={() => setSelectedMember(null)}>
              <Text style={styles.memberSheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Add Member Modal ─────────────────────────────────────────── */}
      <Modal visible={showAddMemberModal} transparent animationType="slide" onRequestClose={() => setShowAddMemberModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
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
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Bulk Remove Modal ─────────────────────────────────────────── */}
      <Modal visible={showBulkRemoveModal} transparent animationType="slide" onRequestClose={() => { setShowBulkRemoveModal(false); setSelectedForRemoval([]); }}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => { setShowBulkRemoveModal(false); setSelectedForRemoval([]); }}>
          <View style={[styles.memberSheet, { height: '70%' }]} onStartShouldSetResponder={() => true}>
            <View style={styles.editHandle} />
            <Text style={[styles.memberSheetName, { color: '#EF4444', fontSize: 18, marginBottom: 8 }]}>Remove Members</Text>
            <Text style={{ color: Colors.dark.muted, fontSize: 13, textAlign: 'center', marginBottom: 16 }}>Select members to remove from the group.</Text>

            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1, marginBottom: 16 }}>
              {sortedMembers.map((member) => {
                const id = member._id || member;
                const mRole = getRole(id);
                // Admins cannot remove the owner, themselves, or Mica. 
                // Owners cannot remove themselves or Mica.
                if (id?.toString() === myId?.toString() || mRole === 'system_bot' || mRole === 'owner') return null;
                if (!isOwner && mRole === 'admin') return null;

                const isSelected = selectedForRemoval.includes(id?.toString());
                
                return (
                  <TouchableOpacity
                    key={id}
                    onPress={() => {
                      if (isSelected) {
                        setSelectedForRemoval(prev => prev.filter(pId => pId !== id?.toString()));
                      } else {
                        setSelectedForRemoval(prev => [...prev, id?.toString()]);
                      }
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: Colors.dark.border }}
                  >
                    <View style={[{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: isSelected ? '#EF4444' : Colors.dark.muted, alignItems: 'center', justifyContent: 'center', marginRight: 12 }, isSelected && { backgroundColor: '#EF4444' }]}>
                      {isSelected && <Ionicons name="checkmark" size={16} color="#FFF" />}
                    </View>
                    
                    {member.profilePicture ? (
                      <Image source={{ uri: member.profilePicture }} style={styles.addAvatar} />
                    ) : (
                      <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.addAvatar}>
                        <Text style={styles.addAvatarInitial}>
                          {(member.displayName || member.username || '?').charAt(0).toUpperCase()}
                        </Text>
                      </LinearGradient>
                    )}
                    
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={{ color: Colors.dark.text, fontSize: 15, fontWeight: '600' }}>{member.displayName || member.username}</Text>
                      <Text style={{ color: Colors.dark.muted, fontSize: 13 }}>@{member.username}</Text>
                    </View>
                    
                    {mRole === 'admin' && (
                      <View style={{ backgroundColor: Colors.primary + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                        <Text style={{ color: Colors.primary, fontSize: 11, fontWeight: '600' }}>Admin</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity style={[styles.memberSheetCancel, { flex: 1 }]} onPress={() => { setShowBulkRemoveModal(false); setSelectedForRemoval([]); }}>
                <Text style={[styles.memberSheetCancelText, { color: Colors.dark.text }]}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[{ flex: 1, backgroundColor: '#EF4444', borderRadius: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' }, selectedForRemoval.length === 0 && { opacity: 0.5 }]} 
                disabled={selectedForRemoval.length === 0 || isBulkRemoving}
                onPress={handleBulkRemoveSubmit}
              >
                {isBulkRemoving ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFF' }}>Remove ({selectedForRemoval.length})</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Fullscreen Avatar Modal ─────────────────────────────────────── */}
      <Modal visible={showFullAvatar} transparent animationType="fade" onRequestClose={() => setShowFullAvatar(false)}>
        <TouchableOpacity style={styles.fullAvatarOverlay} activeOpacity={1} onPress={() => setShowFullAvatar(false)}>
          <TouchableOpacity style={styles.fullAvatarClose} onPress={() => setShowFullAvatar(false)}>
            <Ionicons name="close" size={30} color="#FFF" />
          </TouchableOpacity>
          {chat?.groupPicture && (
            <Image source={{ uri: chat.groupPicture }} style={styles.fullAvatarImage} resizeMode="contain" />
          )}
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
