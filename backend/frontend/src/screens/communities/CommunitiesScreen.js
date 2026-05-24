import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  TextInput, ActivityIndicator, Alert, StatusBar, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';
import api from '../../services/api';
import TabHeader from '../../components/TabHeader';

export default function CommunitiesScreen({ navigation }) {
  const [communities, setCommunities] = useState([]);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const fetchCommunities = async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get(`/chats/search/public?q=${search}`);
      setCommunities(data.chats);
    } catch (_) {} finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchCommunities();
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [search]);

  const joinCommunity = async (chatId) => {
    try {
      await api.put(`/chats/group/${chatId}/add`, { userId: null });
      Alert.alert('Joined!', 'You joined the community');
      fetchCommunities(); // refresh list
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.card} 
      activeOpacity={0.8}
      onPress={() => navigation.navigate('ChatRoom', { chat: item })}
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
        {item.groupDescription ? (
          <Text style={styles.cardDesc} numberOfLines={2}>{item.groupDescription}</Text>
        ) : null}
        <View style={styles.cardMeta}>
          <Ionicons name="people-outline" size={14} color={Colors.dark.muted} />
          <Text style={styles.cardMetaText}>{item.users?.length || 0} members</Text>
        </View>
      </View>
      <TouchableOpacity onPress={() => joinCommunity(item._id)}>
        <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.joinBtn}>
          <Text style={styles.joinBtnText}>Join</Text>
        </LinearGradient>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.dark.card} />

      <TabHeader 
        title="Communities" 
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
