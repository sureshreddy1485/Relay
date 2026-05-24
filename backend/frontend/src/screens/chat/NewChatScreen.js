import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '../../theme/colors';
import api from '../../services/api';
import useChatStore from '../../store/useChatStore';
import useAuthStore from '../../store/useAuthStore';

export default function NewChatScreen({ navigation }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [searched, setSearched] = useState(false);

  const { user: currentUser, updateUser } = useAuthStore();

  const handleSearch = async () => {
    if (search.trim().length < 3) {
      Alert.alert('Enter username', 'Type the full username to search.');
      return;
    }
    setIsSearching(true);
    setSearched(true);
    setResults([]);
    try {
      const { data } = await api.get(`/users/search?q=${search.trim()}`);
      setResults(data.users);
    } catch (_) {} finally {
      setIsSearching(false);
    }
  };

  const startChat = async (userId) => {
    setIsCreating(userId);
    try {
      const { data } = await api.post('/chats', { userId });
      useChatStore.getState().addChat(data.chat);
      useChatStore.getState().selectChat(data.chat);
      navigation.replace('ChatRoom', { chat: data.chat });
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setIsCreating(null);
    }
  };

  const handleSendFriendRequest = async (targetId) => {
    setActionLoading(targetId);
    try {
      await api.post(`/users/${targetId}/friend-request`);
      const updatedSent = [...(currentUser.sentRequests || []), targetId];
      updateUser({ sentRequests: updatedSent });
      Alert.alert('✅', 'Friend request sent!');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || e.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleAcceptFriendRequest = async (targetId) => {
    setActionLoading(targetId);
    try {
      const { data } = await api.post(`/users/${targetId}/accept-request`);
      const updatedFriends = [...(currentUser.friends || []), targetId];
      const updatedRequests = (currentUser.friendRequests || []).filter(r => r.toString() !== targetId.toString());
      updateUser({ friends: updatedFriends, friendRequests: updatedRequests });
      
      if (data.chat) {
        useChatStore.getState().addChat(data.chat);
        useChatStore.getState().selectChat(data.chat);
        navigation.replace('ChatRoom', { chat: data.chat });
      } else {
        Alert.alert('🎉', 'Friend request accepted!');
      }
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || e.message);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <LinearGradient colors={['#0A0A0F', '#1A1A2E']} style={{ flex: 1 }}>
      {/* Search bar with button */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={20} color={Colors.dark.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Enter exact username..."
          placeholderTextColor={Colors.dark.muted}
          value={search}
          onChangeText={(v) => { setSearch(v); setSearched(false); setResults([]); }}
          autoFocus
          autoCapitalize="none"
          returnKeyType="search"
          onSubmitEditing={handleSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => { setSearch(''); setResults([]); setSearched(false); }}>
            <Ionicons name="close-circle" size={18} color={Colors.dark.muted} />
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={styles.searchBtn}
        onPress={handleSearch}
        disabled={isSearching}
      >
        {isSearching
          ? <ActivityIndicator size="small" color="#FFF" />
          : <Text style={styles.searchBtnText}>Search</Text>
        }
      </TouchableOpacity>

      <ScrollView>
        {results.map(user => {
          const isFriend = currentUser.friends?.some(f => (f._id || f).toString() === user._id.toString());
          const hasSentRequest = currentUser.sentRequests?.some(r => r.toString() === user._id.toString());
          const hasReceivedRequest = currentUser.friendRequests?.some(r => r.toString() === user._id.toString());

          return (
            <View key={user._id} style={styles.userItem}>
              {user.profilePicture ? (
                <Image source={{ uri: user.profilePicture }} style={styles.avatar} />
              ) : (
                <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.avatar}>
                  <Text style={styles.avatarText}>{user.username?.charAt(0).toUpperCase()}</Text>
                </LinearGradient>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.displayName}>{user.displayName || user.username}</Text>
                <Text style={styles.username}>@{user.username}</Text>
              </View>

              {isFriend ? (
                <TouchableOpacity
                  onPress={() => startChat(user._id)}
                  disabled={isCreating === user._id}
                  style={styles.actionBtn}
                >
                  {isCreating === user._id ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="chatbubble-outline" size={14} color="#FFF" style={{ marginRight: 4 }} />
                      <Text style={styles.actionBtnText}>Chat</Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : hasSentRequest ? (
                <View style={[styles.actionBtn, styles.btnDisabled]}>
                  <Text style={styles.actionBtnTextMuted}>Requested</Text>
                </View>
              ) : hasReceivedRequest ? (
                <TouchableOpacity
                  onPress={() => handleAcceptFriendRequest(user._id)}
                  disabled={actionLoading === user._id}
                  style={styles.actionBtn}
                >
                  {actionLoading === user._id ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={14} color="#FFF" style={{ marginRight: 4 }} />
                      <Text style={styles.actionBtnText}>Accept</Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => handleSendFriendRequest(user._id)}
                  disabled={actionLoading === user._id}
                  style={styles.actionBtn}
                >
                  {actionLoading === user._id ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="person-add-outline" size={14} color="#FFF" style={{ marginRight: 4 }} />
                      <Text style={styles.actionBtnText}>Add</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        {searched && results.length === 0 && !isSearching && (
          <View style={styles.empty}>
            <Ionicons name="person-outline" size={48} color={Colors.dark.muted} />
            <Text style={styles.emptyText}>No user found for "@{search}"</Text>
            <Text style={styles.emptyHint}>Make sure you type the full username exactly</Text>
          </View>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.dark.input, margin: 16, marginBottom: 8, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  searchInput: { flex: 1, color: Colors.dark.text, fontSize: 15 },
  searchBtn: {
    backgroundColor: Colors.primary, borderRadius: 12,
    marginHorizontal: 16, marginBottom: 12, paddingVertical: 14,
    alignItems: 'center',
  },
  searchBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  userItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 0.5, borderBottomColor: Colors.dark.border,
  },
  avatar: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontWeight: '700', color: '#FFF' },
  displayName: { fontSize: 15, fontWeight: '700', color: Colors.dark.text },
  username: { fontSize: 13, color: Colors.dark.muted, marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 15, color: Colors.dark.muted, fontWeight: '600' },
  emptyHint: { fontSize: 12, color: Colors.dark.muted },
  actionBtn: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  btnDisabled: {
    backgroundColor: Colors.dark.input,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  actionBtnTextMuted: {
    color: Colors.dark.muted,
    fontSize: 13,
    fontWeight: '600',
  },
});
