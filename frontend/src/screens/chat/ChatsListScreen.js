import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, TextInput, StatusBar, RefreshControl,
  Platform, Alert, Animated, Modal, TouchableWithoutFeedback, Image, BackHandler
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import useChatStore from '../../store/useChatStore';
import useAuthStore from '../../store/useAuthStore';
import ChatListItem from '../../components/ChatListItem';
import TabHeader from '../../components/TabHeader';
import { Colors } from '../../theme/colors';
import api from '../../services/api';
import { getSocket } from '../../services/socketService';
import { useAlert } from '../../components/CustomAlert';

export default function ChatsListScreen({ navigation }) {
  const { showAlert } = useAlert();
  const { chats, fetchChats, isLoadingChats } = useChatStore();
  const { user } = useAuthStore();
  const insets = useSafeAreaInsets();

  const [search, setSearch]           = useState('');
  const [showSearch, setShowSearch]   = useState(false);
  const [refreshing, setRefreshing]   = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected]       = useState(new Set());
  const [longPressChat, setLongPressChat] = useState(null);
  const [friendRequestsCount, setFriendRequestsCount] = useState(0);
  const [friendRequests, setFriendRequests]       = useState([]);
  const [showRequestsModal, setShowRequestsModal] = useState(false);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [isFabOpen, setIsFabOpen] = useState(false);
  const fabAnim = React.useRef(new Animated.Value(0)).current;

  const toggleFab = () => {
    const toValue = isFabOpen ? 0 : 1;
    setIsFabOpen(!isFabOpen);
    Animated.spring(fabAnim, {
      toValue,
      friction: 6,
      useNativeDriver: true,
    }).start();
  };

  const fabRotate = fabAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg']
  });

  const fetchFriendRequests = async () => {
    setIsLoadingRequests(true);
    try {
      const { data } = await api.get('/users/friend-requests');
      setFriendRequests(data.requests || []);
      setFriendRequestsCount(data.requests?.length || 0);
    } catch (_) {
    } finally {
      setIsLoadingRequests(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      // Silent refresh when switching tabs — no spinner if data already exists
      fetchChats(true);
      fetchFriendRequests();
      setSelectionMode(false);
      setSelected(new Set());
    }, [])
  );

  // Auto-refresh when the active user switches
  useEffect(() => {
    if (user && user._id) {
      useChatStore.getState().reset();
      fetchChats(false);
      fetchFriendRequests();
    }
  }, [user?._id]);

  // Real-time: auto-refresh friend request badge when a new request arrives
  useEffect(() => {
    const socket = getSocket();
    const handleNewRequest = () => fetchFriendRequests();
    const handleRequestAccepted = () => { fetchFriendRequests(); fetchChats(true); };
    if (socket) {
      socket.on('friend_request_received', handleNewRequest);
      socket.on('friend_request_accepted', handleRequestAccepted);
    }
    return () => {
      if (socket) {
        socket.off('friend_request_received', handleNewRequest);
        socket.off('friend_request_accepted', handleRequestAccepted);
      }
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (showSearch) {
          setShowSearch(false);
          setSearch('');
          return true; // Prevent default (exit app)
        }
        if (selectionMode) {
          setSelectionMode(false);
          setSelected(new Set());
          return true; // Prevent default
        }
        return false; // Let default behavior happen
      };

      const backHandler = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => backHandler.remove();
    }, [showSearch, selectionMode])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchChats();
    setRefreshing(false);
  };

  const filtered = chats.filter(c => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    if (c.isGroupChat) {
      const matchName = c.chatName?.toLowerCase().includes(searchLower);
      const matchUsername = c.groupUsername?.toLowerCase().includes(searchLower);
      return matchName || matchUsername;
    } else {
      const otherUser = c.users?.find(u => u._id !== user?._id);
      const matchName = (otherUser?.displayName || '')?.toLowerCase().includes(searchLower);
      const matchUsername = (otherUser?.username || '')?.toLowerCase().includes(searchLower);
      return matchName || matchUsername;
    }
  });

  const pinned = filtered.filter(c => user?.pinnedChats?.includes(c._id));
  const normal = filtered.filter(c => !user?.pinnedChats?.includes(c._id));

  // ── Selection helpers ───────────────────────────────────────────────────────
  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const enterSelection = (id) => {
    setSelectionMode(true);
    setSelected(new Set([id]));
  };

  const cancelSelection = () => {
    setSelectionMode(false);
    setSelected(new Set());
  };

  const pinSelected = async () => {
    try {
      const currentPinned = new Set(user?.pinnedChats?.map(c => c.toString()) || []);
      const allSelectedArePinned = [...selected].every(id => currentPinned.has(id.toString()));

      const idsToToggle = [...selected].filter(id => {
        const isPinned = currentPinned.has(id.toString());
        return allSelectedArePinned ? isPinned : !isPinned;
      });

      for (const id of idsToToggle) {
        await api.put(`/chats/${id}/pin`);
      }
      
      idsToToggle.forEach(id => {
        if (currentPinned.has(id.toString())) currentPinned.delete(id.toString());
        else currentPinned.add(id.toString());
      });
      useAuthStore.getState().updateUser({ pinnedChats: Array.from(currentPinned) });
    } catch (e) {
      showAlert('Error', e.message || 'Pin failed');
    } finally {
      cancelSelection();
    }
  };

  const muteSelected = async () => {
    try {
      const currentMuted = new Set(user?.mutedChats?.map(c => c.toString()) || []);
      const allSelectedAreMuted = [...selected].every(id => currentMuted.has(id.toString()));

      const idsToToggle = [...selected].filter(id => {
        const isMuted = currentMuted.has(id.toString());
        return allSelectedAreMuted ? isMuted : !isMuted;
      });

      for (const id of idsToToggle) {
        await api.put(`/chats/${id}/mute`);
      }
      
      idsToToggle.forEach(id => {
        if (currentMuted.has(id.toString())) currentMuted.delete(id.toString());
        else currentMuted.add(id.toString());
      });
      useAuthStore.getState().updateUser({ mutedChats: Array.from(currentMuted) });
    } catch (e) {
      showAlert('Error', e.message || 'Mute failed');
    } finally {
      cancelSelection();
    }
  };

  const deleteSelected = () => {
    showAlert(
      `Delete ${selected.size} chat${selected.size > 1 ? 's' : ''}?`,
      'This will remove these conversations from your list.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await Promise.all([...selected].map(id => api.put(`/chats/${id}/archive`)));
              await fetchChats();
            } catch (e) {
              showAlert('Error', e.message || 'Delete failed');
            } finally {
              cancelSelection();
            }
          },
        },
      ]
    );
  };

  // ── Render helpers ──────────────────────────────────────────────────────────
  const renderItem = ({ item }) => (
    <View style={[styles.itemWrap, selected.has(item._id) && styles.itemSelected]}>
      {selectionMode && (
        <View style={styles.checkbox}>
          {selected.has(item._id)
            ? <View style={styles.checkboxFilled}><Ionicons name="checkmark" size={14} color="#FFF" /></View>
            : <View style={styles.checkboxEmpty} />
          }
        </View>
      )}
      <View style={{ flex: 1 }}>
        <ChatListItem
          chat={item}
          currentUser={user}
          onPress={() => {
            if (selectionMode) { toggleSelect(item._id); return; }
            useChatStore.getState().selectChat(item);
            useChatStore.getState().clearUnread(item._id);
            navigation.navigate('ChatRoom', { chat: item });
          }}
          onLongPress={() => {
            if (selectionMode) { toggleSelect(item._id); return; }
            setLongPressChat(item);
          }}
        />
      </View>
    </View>
  );

  const listData = [
    ...(pinned.length > 0 ? [{ type: 'section', title: '📌 Pinned', id: 'pinned_header' }] : []),
    ...pinned.map(c => ({ ...c, type: 'chat' })),
    ...(normal.length > 0 && pinned.length > 0 ? [{ type: 'section', title: 'Recent', id: 'recent_header' }] : []),
    ...normal.map(c => ({ ...c, type: 'chat' })),
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.dark.card} />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      {selectionMode ? (() => {
        const currentPinned = new Set(user?.pinnedChats?.map(c => typeof c === 'object' ? c._id?.toString() : c?.toString()) || []);
        const allSelectedArePinned = selected.size > 0 && [...selected].every(id => currentPinned.has(id.toString()));
        const currentMuted = new Set(user?.mutedChats?.map(c => typeof c === 'object' ? c._id?.toString() : c?.toString()) || []);
        const allSelectedAreMuted = selected.size > 0 && [...selected].every(id => currentMuted.has(id.toString()));

        return (
          /* Selection mode header */
        <View style={[styles.selectionHeader, { paddingTop: (insets.top || StatusBar.currentHeight || 0) + 8 }]}>
          <TouchableOpacity onPress={cancelSelection} style={styles.iconBtn}>
            <Ionicons name="close" size={24} color={Colors.dark.text} />
          </TouchableOpacity>
          <Text style={styles.selectionCount}>{selected.size}</Text>
          <View style={styles.selectionActions}>
            <TouchableOpacity onPress={pinSelected} style={styles.actionBtnHeader} disabled={selected.size === 0}>
              <MaterialCommunityIcons name={allSelectedArePinned ? "pin-off-outline" : "pin-outline"} size={22} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity onPress={muteSelected} style={styles.actionBtnHeader} disabled={selected.size === 0}>
              <MaterialCommunityIcons name={allSelectedAreMuted ? "volume-high" : "volume-off"} size={22} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity onPress={deleteSelected} style={styles.deleteBtnHeader} disabled={selected.size === 0}>
              <Ionicons name="trash-outline" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
        );
      })() : (
        /* Normal header */
        <TabHeader
          title="Relay"
          right={
            <>
              <TouchableOpacity
                onPress={() => setShowRequestsModal(true)}
                style={styles.iconBtn}
              >
                <Ionicons
                  name="person-add-outline"
                  size={24}
                  color={Colors.dark.text}
                />
                {friendRequestsCount > 0 && (
                  <View style={styles.reqBadge}>
                    <Text style={styles.reqBadgeText}>{friendRequestsCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setShowSearch(v => !v); setSearch(''); }}
                style={styles.iconBtn}
              >
                <Ionicons
                  name={showSearch ? 'close-outline' : 'search-outline'}
                  size={24}
                  color={showSearch ? Colors.primary : Colors.dark.text}
                />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setSelectionMode(true)} style={styles.iconBtn}>
                <Ionicons name="checkmark-done-circle-outline" size={24} color={Colors.dark.text} />
              </TouchableOpacity>
            </>
          }
        />
      )}

      {/* ── Search bar (toggleable) ─────────────────────────────────────────── */}
      {showSearch && !selectionMode && (
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color={Colors.dark.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search chats..."
            placeholderTextColor={Colors.dark.muted}
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={Colors.dark.muted} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── List ───────────────────────────────────────────────────────────── */}
      {isLoadingChats && !refreshing ? (
        <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View>
      ) : filtered.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="chatbubbles-outline" size={64} color={Colors.dark.muted} />
          <Text style={styles.emptyTitle}>No Chats Yet</Text>
          <Text style={styles.emptyText}>Tap the + button to find people and start chatting!</Text>
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item) => item.id || item._id}
          renderItem={({ item }) =>
            item.type === 'section' ? (
              <Text style={styles.sectionTitle}>{item.title}</Text>
            ) : (
              renderItem({ item })
            )
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 20 }}
        />
      )}

      {/* ── Long Press Modal (Vertical Bottom Sheet) ─────────────────────────── */}
      <Modal visible={!!longPressChat} transparent animationType="slide" onRequestClose={() => setLongPressChat(null)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setLongPressChat(null)}>
          <View style={styles.sheetContainer}>
            <View style={styles.sheetHandle} />
            {longPressChat && (
              <>
                <Text style={styles.sheetTitle} numberOfLines={1}>
                  {longPressChat.isGroupChat ? longPressChat.chatName : (longPressChat.users?.find(u => u._id !== user?._id)?.displayName || longPressChat.users?.find(u => u._id !== user?._id)?.username)}
                </Text>
                
                <View style={styles.sheetActionsWrap}>
                  <TouchableOpacity 
                    style={styles.sheetActionItem} 
                    onPress={async () => {
                      const id = longPressChat._id;
                      setLongPressChat(null);
                      showAlert(
                        'Delete Chat',
                        'Are you sure you want to permanently delete this chat and all of its messages?',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Delete',
                            style: 'destructive',
                            onPress: async () => {
                              try {
                                await api.delete(`/chats/${id}`);
                                useChatStore.getState().removeChat(id);
                              } catch (e) {
                                showAlert('Error', e.message || 'Delete failed');
                              }
                            }
                          }
                        ]
                      );
                    }}
                  >
                    <Ionicons name="trash-outline" size={20} color="#FF4444" />
                    <Text style={[styles.sheetActionLabel, { color: '#FF4444' }]}>Delete</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.sheetActionItem} onPress={async () => {
                    const id = longPressChat._id;
                    const wasMuted = user?.mutedChats?.some(c => c.toString() === id.toString());
                    setLongPressChat(null);
                    try {
                      await api.put(`/chats/${id}/mute`);
                      const updatedMuted = wasMuted
                        ? (user.mutedChats || []).filter(c => c.toString() !== id.toString())
                        : [...(user.mutedChats || []), id];
                      useAuthStore.getState().updateUser({ mutedChats: updatedMuted });
                    } catch(e){ showAlert('Error', e.message || 'Failed'); }
                  }}>
                    <Ionicons name={user?.mutedChats?.some(c => c.toString() === longPressChat._id?.toString()) ? "volume-high-outline" : "volume-mute-outline"} size={20} color={Colors.dark.text} />
                    <Text style={styles.sheetActionLabel}>{user?.mutedChats?.some(c => c.toString() === longPressChat._id?.toString()) ? 'Unmute' : 'Mute'}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.sheetActionItem} onPress={() => {
                    const chat = longPressChat;
                    setLongPressChat(null);
                    if (chat.isGroupChat) navigation.navigate('GroupInfo', { chat });
                  }}>
                    <Ionicons name="information-circle-outline" size={20} color={Colors.dark.text} />
                    <Text style={styles.sheetActionLabel}>Chat Info</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.sheetActionItem} onPress={async () => {
                    const id = longPressChat._id;
                    const wasPinned = user?.pinnedChats?.some(c => c.toString() === id.toString());
                    setLongPressChat(null);
                    try {
                      await api.put(`/chats/${id}/pin`);
                      const updatedPinned = wasPinned
                        ? (user.pinnedChats || []).filter(c => c.toString() !== id.toString())
                        : [...(user.pinnedChats || []), id];
                      useAuthStore.getState().updateUser({ pinnedChats: updatedPinned });
                    } catch(e){ showAlert('Error', e.message || 'Failed'); }
                  }}>
                    <Ionicons name={user?.pinnedChats?.some(c => c.toString() === longPressChat._id?.toString()) ? "pin-sharp" : "pin-outline"} size={20} color={Colors.dark.text} />
                    <Text style={styles.sheetActionLabel}>{user?.pinnedChats?.some(c => c.toString() === longPressChat._id?.toString()) ? 'Unpin Chat' : 'Pin Chat'}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.sheetActionItem} onPress={() => { setLongPressChat(null); showAlert('Clear', 'Not implemented'); }}>
                    <Ionicons name="refresh-outline" size={20} color={Colors.dark.text} />
                    <Text style={styles.sheetActionLabel}>Clear Chat</Text>
                  </TouchableOpacity>

                  {!longPressChat.isGroupChat && (
                    <TouchableOpacity
                      style={styles.sheetActionItem}
                      onPress={() => {
                        const targetUser = longPressChat.users?.find(u => u._id !== user?._id);
                        if (!targetUser) return;
                        const chatToDeleteId = longPressChat._id;
                        setLongPressChat(null);
                        showAlert(
                          'Block User',
                          `Are you sure you want to block ${targetUser.displayName || targetUser.username}?`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Block',
                              style: 'destructive',
                              onPress: async () => {
                                try {
                                  await api.post(`/users/${targetUser._id}/block`);
                                  const updatedBlocked = [...(user.blockedUsers || []), targetUser._id];
                                  const updatedFriends = (user.friends || []).filter(id => id.toString() !== targetUser._id.toString());
                                  useAuthStore.getState().updateUser({ blockedUsers: updatedBlocked, friends: updatedFriends });
                                  
                                  // Instantly remove chat from UI
                                  useChatStore.getState().removeChat(chatToDeleteId);
                                  
                                  showAlert('Blocked', 'User has been blocked');
                                } catch (e) {
                                  showAlert('Error', e.message);
                                }
                              }
                            }
                          ]
                        );
                      }}
                    >
                      <Ionicons name="ban-outline" size={20} color="#FF4444" />
                      <Text style={[styles.sheetActionLabel, { color: '#FF4444' }]}>Block User</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Cancel Button */}
                <TouchableOpacity style={styles.sheetCancelBtn} onPress={() => setLongPressChat(null)} activeOpacity={0.8}>
                  <Text style={styles.sheetCancelText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Friend Requests Modal ─────────────────────────────────────────── */}
      <Modal visible={showRequestsModal} transparent animationType="slide" onRequestClose={() => setShowRequestsModal(false)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setShowRequestsModal(false)}>
          <View style={styles.sheetContainer} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: Colors.primary }]}>Friend Requests ({friendRequestsCount})</Text>

            {isLoadingRequests ? (
              <ActivityIndicator color={Colors.primary} style={{ marginVertical: 30 }} />
            ) : friendRequests.length === 0 ? (
              <View style={styles.emptyRequests}>
                <Ionicons name="people-outline" size={40} color={Colors.dark.muted} />
                <Text style={styles.emptyRequestsText}>No pending friend requests</Text>
              </View>
            ) : (
              <FlatList
                data={friendRequests}
                keyExtractor={(item) => item._id}
                style={{ maxHeight: 320 }}
                renderItem={({ item }) => (
                  <View style={styles.requestItem}>
                    {item.profilePicture ? (
                      <Image source={{ uri: item.profilePicture }} style={styles.requestAvatar} />
                    ) : (
                      <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.requestAvatar}>
                        <Text style={styles.requestAvatarInitial}>
                          {(item.displayName || item.username)?.charAt(0).toUpperCase()}
                        </Text>
                      </LinearGradient>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.requestName}>{item.displayName || item.username}</Text>
                      <Text style={styles.requestUsername}>@{item.username}</Text>
                    </View>
                    <View style={styles.requestActions}>
                      <TouchableOpacity 
                        style={[styles.actionBtn, styles.acceptBtn]}
                        onPress={async () => {
                          try {
                            const { data } = await api.post(`/users/${item._id}/accept-request`);
                            
                            // Update currentUser store locally
                            const currentUser = useAuthStore.getState().user;
                            if (currentUser) {
                              const updatedFriends = [...(currentUser.friends || []), item._id];
                              const updatedRequests = (currentUser.friendRequests || []).filter(r => r.toString() !== item._id.toString());
                              useAuthStore.getState().updateUser({ friends: updatedFriends, friendRequests: updatedRequests });
                            }

                            // Close requests modal
                            setShowRequestsModal(false);

                            if (data.chat) {
                              // Add and select the chat in the store
                              useChatStore.getState().addChat(data.chat);
                              useChatStore.getState().selectChat(data.chat);
                              // Navigate directly to the new chat room
                              navigation.navigate('ChatRoom', { chat: data.chat });
                            }
                            fetchFriendRequests();
                            fetchChats();
                          } catch (e) {
                            showAlert('Error', e.message || 'Failed');
                          }
                        }}
                      >
                        <Ionicons name="checkmark" size={18} color="#FFF" />
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.actionBtn, styles.declineBtn]}
                        onPress={async () => {
                          try {
                            await api.post(`/users/${item._id}/decline-request`);
                            fetchFriendRequests();
                          } catch (e) {
                            showAlert('Error', e.message || 'Failed');
                          }
                        }}
                      >
                        <Ionicons name="close" size={18} color="#FFF" />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              />
            )}

            <TouchableOpacity style={styles.sheetCancelBtn} onPress={() => setShowRequestsModal(false)} activeOpacity={0.8}>
              <Text style={[styles.sheetCancelText, { color: Colors.primary }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>



      {/* ── Floating Action Button ─────────────────────────────────────────── */}
      {!selectionMode && (
        <View style={styles.fabContainer}>
          {isFabOpen && (
            <View style={styles.fabOptions}>
              <TouchableOpacity
                style={styles.fabOptionItem}
                activeOpacity={0.7}
                onPress={() => {
                  toggleFab();
                  navigation.navigate('NewChat');
                }}
              >
                <View style={styles.fabOptionLabel}>
                  <Text style={styles.fabOptionText}>Find People</Text>
                </View>
                <View style={[styles.fabOptionIconWrap, { backgroundColor: Colors.primary }]}>
                  <Ionicons name="person-add-outline" size={20} color="#FFF" />
                </View>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.fabOptionItem}
                activeOpacity={0.7}
                onPress={() => {
                  toggleFab();
                  navigation.navigate('Communities');
                }}
              >
                <View style={styles.fabOptionLabel}>
                  <Text style={styles.fabOptionText}>Communities</Text>
                </View>
                <View style={[styles.fabOptionIconWrap, { backgroundColor: Colors.primary }]}>
                  <Ionicons name="people-outline" size={20} color="#FFF" />
                </View>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={toggleFab}
            style={styles.fabMain}
          >
            <Animated.View style={{ transform: [{ rotate: fabRotate }] }}>
              <Ionicons name="add" size={32} color="#FFF" />
            </Animated.View>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const HEADER_TOP = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.bg },
  iconBtn: { padding: 6 },

  // Selection mode header
  selectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingBottom: 10, paddingHorizontal: 14,
    backgroundColor: Colors.dark.card,
    borderBottomWidth: 1, borderBottomColor: Colors.dark.border,
    gap: 12,
  },
  selectionCount: { flex: 1, fontSize: 17, fontWeight: '700', color: Colors.dark.text },
  selectionActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionBtnHeader: { padding: 8, backgroundColor: Colors.dark.surface, borderRadius: 10 },
  deleteBtnHeader: { padding: 8, backgroundColor: '#FF4444', borderRadius: 10 },

  // Search
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.dark.input, borderRadius: 14,
    marginHorizontal: 16, marginTop: 10, marginBottom: 4,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  searchInput: { flex: 1, color: Colors.dark.text, fontSize: 15 },

  // List
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: Colors.dark.muted,
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8,
    textTransform: 'uppercase', letterSpacing: 1,
  },

  // Selection item
  itemWrap: { flexDirection: 'row', alignItems: 'center' },
  itemSelected: { backgroundColor: Colors.primary + '15' },
  checkbox: { paddingLeft: 14 },
  checkboxEmpty: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: Colors.dark.muted,
  },
  checkboxFilled: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  reqRejectBtn: {
    padding: 8, backgroundColor: Colors.dark.surface,
    borderRadius: 8, borderWidth: 1, borderColor: Colors.dark.border,
  },
  reqAcceptBtn: {
    padding: 8, backgroundColor: Colors.primary + '20',
    borderRadius: 8, borderWidth: 1, borderColor: Colors.primary + '50',
  },
  
  // FAB Styles
  fabContainer: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    alignItems: 'flex-end',
    zIndex: 999,
  },
  fabOptions: {
    marginBottom: 16,
    alignItems: 'flex-end',
    gap: 16,
  },
  fabOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fabOptionLabel: {
    backgroundColor: Colors.dark.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  fabOptionText: {
    color: Colors.dark.text,
    fontSize: 14,
    fontWeight: '600',
  },
  fabOptionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  fabMain: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },

  // Empty
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.dark.text },
  emptyText: { fontSize: 14, color: Colors.dark.muted },
  startBtn: { borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28, marginTop: 8 },
  startBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },

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

  // Friend requests
  reqBadge: {
    position: 'absolute',
    top: -2, right: -2,
    backgroundColor: '#EF4444',
    borderRadius: 8, minWidth: 16, height: 16,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  reqBadgeText: {
    color: '#FFF', fontSize: 10, fontWeight: '700',
  },
  emptyRequests: {
    alignItems: 'center', paddingVertical: 40, gap: 10,
  },
  emptyRequestsText: {
    color: Colors.dark.muted, fontSize: 14,
  },
  requestItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 16,
    borderBottomWidth: 0.5, borderBottomColor: Colors.dark.border,
  },
  requestAvatar: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
  },
  requestAvatarInitial: {
    fontSize: 16, fontWeight: '700', color: '#FFF',
  },
  requestName: {
    fontSize: 15, fontWeight: '600', color: Colors.dark.text,
  },
  requestUsername: {
    fontSize: 13, color: Colors.dark.muted, marginTop: 1,
  },
  requestActions: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  actionBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  acceptBtn: {
    backgroundColor: Colors.primary,
  },
  declineBtn: {
    backgroundColor: Colors.dark.muted + '40',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    elevation: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  fabGrad: {
    width: '100%',
    height: '100%',
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
