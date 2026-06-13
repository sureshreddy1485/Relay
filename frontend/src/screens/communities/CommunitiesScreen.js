import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  TextInput, ActivityIndicator, Alert, StatusBar, Platform, BackHandler
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';
import api from '../../services/api';
import TabHeader from '../../components/TabHeader';
import { getSocket } from '../../services/socketService';
import useAuthStore from '../../store/useAuthStore';
import { useAlert } from '../../components/CustomAlert';

export default function CommunitiesScreen({ navigation }) {
  const { showAlert } = useAlert();
  const { user } = useAuthStore();
  const [communities, setCommunities] = useState([]);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const fetchCommunities = async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get(`/chats/search/public?q=${search}`);
      setCommunities(data.chats);
    } catch (_) { } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchCommunities();
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [search]);

  // Real-time: update community member count when anyone joins, and refresh list when groups are created/deleted/privacy changed
  useEffect(() => {
    const socket = getSocket();
    const handleChatUpdated = (updatedChat) => {
      setCommunities(prev =>
        prev.map(c => c._id === updatedChat._id ? { ...c, ...updatedChat } : c)
      );
    };
    
    const handlePublicGroupsUpdated = () => {
      fetchCommunities();
    };

    if (socket) {
      socket.on('chat_updated', handleChatUpdated);
      socket.on('public_groups_updated', handlePublicGroupsUpdated);
    }
    
    return () => {
      if (socket) {
        socket.off('chat_updated', handleChatUpdated);
        socket.off('public_groups_updated', handlePublicGroupsUpdated);
      }
    };
  }, [search]); // Depend on search so fetchCommunities uses the latest search query

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (showSearch) {
          setShowSearch(false);
          setSearch('');
          return true; // Prevent default behavior (navigating back to Chats)
        }
        return false; // Let default behavior happen
      };

      const backHandler = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => backHandler.remove();
    }, [showSearch])
  );

  const joinCommunity = async (chatId) => {
    try {
      const { data } = await api.put(`/chats/group/${chatId}/add`, { userId: null });
      if (data.status === 'requested') {
        showAlert('Request Sent', 'Your request to join the group has been sent to the admins.');
      } else {
        showAlert('Joined!', 'You joined the community');
      }
      fetchCommunities(); // refresh list
    } catch (e) {
      showAlert('Error', e.response?.data?.message || e.message);
    }
  };

  const formatLastActive = (dateString) => {
    if (!dateString) return '';
    const diffMs = new Date() - new Date(dateString);
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Last active just now';
    if (diffMins < 60) return `Last active ${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `Last active ${diffHrs} hr${diffHrs > 1 ? 's' : ''} ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 365) return `Last active ${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return `Last active ${new Date(dateString).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  };

  const renderItem = ({ item }) => {
    const isMember = item.users?.some(u => (u._id || u).toString() === user?._id?.toString());
    const isRequested = item.joinRequests?.includes(user?._id);
    const isClosed = item.joinPrivacy === 'closed';

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => {
          if (isMember) {
            navigation.reset({
              index: 1,
              routes: [
                { name: 'Tabs' },
                { name: 'ChatRoom', params: { chat: item } },
              ],
            });
          } else {
            navigation.push('GroupPreview', { groupId: item._id });
          }
        }}
      >
        {item.groupPicture ? (
          <Image source={{ uri: item.groupPicture }} style={styles.cardImage} />
        ) : (
          <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.cardImage}>
            <Text style={styles.cardImageText}>{item.chatName?.charAt(0)}</Text>
          </LinearGradient>
        )}
        <View style={styles.cardContent}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={styles.cardName}>{item.chatName}</Text>
            {item.groupUsername ? (
              <Text style={{ color: Colors.primary, fontSize: 13, fontWeight: '600' }}>@{item.groupUsername}</Text>
            ) : null}
          </View>
          {item.updatedAt ? (
            <Text style={{ color: Colors.dark.muted, fontSize: 12, marginTop: 2, marginBottom: 2 }}>
              {formatLastActive(item.updatedAt)}
            </Text>
          ) : null}
          {item.groupDescription ? (
            <Text style={styles.cardDesc} numberOfLines={2}>{item.groupDescription}</Text>
          ) : null}
          <View style={styles.cardMeta}>
            <Ionicons name="people-outline" size={14} color={Colors.dark.muted} />
            <Text style={styles.cardMetaText}>{item.users?.length || 0} members</Text>
          </View>
        </View>
        {isMember ? (
          <View style={[styles.joinBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.primary }]}>
            <Text style={[styles.joinBtnText, { color: Colors.primary }]}>Joined</Text>
          </View>
        ) : (
          <TouchableOpacity 
            onPress={() => !isClosed && !isRequested && joinCommunity(item._id)}
            disabled={isClosed || isRequested}
          >
            <LinearGradient 
              colors={isClosed ? ['#555', '#444'] : isRequested ? [Colors.primary+'80', Colors.primaryDark+'80'] : [Colors.primary, Colors.primaryDark]} 
              style={styles.joinBtn}
            >
              <Text style={styles.joinBtnText}>
                {isClosed ? 'Closed' : isRequested ? 'Requested' : 'Join'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.dark.card} />

      <TabHeader
        title="Communities"
        left={
          <TouchableOpacity onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.replace('Tabs');
            }
          }}>
            <Ionicons name="arrow-back" size={24} color={Colors.primary} />
          </TouchableOpacity>
        }
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <TouchableOpacity onPress={() => navigation.navigate('CreateGroup')} style={{ padding: 4 }}>
              <Ionicons name="add-circle-outline" size={24} color={Colors.dark.text} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                if (showSearch) {
                  setSearch('');
                }
                setShowSearch(!showSearch);
              }}
              style={{ padding: 4 }}
            >
              <Ionicons name={showSearch ? "close-outline" : "search-outline"} size={24} color={Colors.dark.text} />
            </TouchableOpacity>
          </View>
        }
      />

      {showSearch && (
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color={Colors.dark.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search communities..."
            placeholderTextColor={Colors.dark.muted}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={fetchCommunities}
            autoFocus
          />
        </View>
      )}

      <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.primary, textTransform: 'uppercase', letterSpacing: 1.5, paddingHorizontal: 18, marginTop: 16, marginBottom: 8 }}>
        {search.trim().length === 0 ? '🔥 Trending & Active' : '🔍 Search Results'}
      </Text>

      {isLoading ? (
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={communities}
          keyExtractor={item => item._id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          ListEmptyComponent={() => (
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={64} color={Colors.dark.muted} />
              <Text style={styles.emptyTitle}>No communities found</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.bg },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.dark.input, margin: 16, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: Colors.dark.border,
  },
  searchInput: { flex: 1, color: Colors.dark.text, fontSize: 15 },
  card: {
    backgroundColor: Colors.dark.card, borderRadius: 16,
    flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  cardImage: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  cardImageText: { fontSize: 24, fontWeight: '800', color: '#FFF' },
  cardContent: { flex: 1 },
  cardName: { fontSize: 16, fontWeight: '700', color: Colors.dark.text },
  cardDesc: { fontSize: 13, color: Colors.dark.muted, marginTop: 4 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  cardMetaText: { fontSize: 12, color: Colors.dark.muted },
  joinBtn: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  joinBtnText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 16, color: Colors.dark.muted },
});
