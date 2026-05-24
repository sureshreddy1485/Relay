import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Image, StatusBar, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '../../theme/colors';
import api, { uploadApi } from '../../services/api';
import useChatStore from '../../store/useChatStore';

export default function CreateGroupScreen({ navigation, route }) {
  const preSelected = route.params?.preSelectedUsers || [];
  const [name, setName]               = useState('');
  const [description, setDescription] = useState('');
  const [groupUsername, setGroupUsername] = useState('');
  const [isPublic, setIsPublic]       = useState(true);
  const [search, setSearch]           = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selected, setSelected]       = useState(preSelected);
  const [avatar, setAvatar]           = useState(null);
  const [isCreating, setIsCreating]   = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searched, setSearched]       = useState(false);
  // Jump straight to add-more step if users pre-selected
  const [step, setStep]               = useState(preSelected.length > 0 ? 'form' : 'form');

  const handleSearch = async () => {
    if (search.trim().length < 3) {
      Alert.alert('Enter username', 'Type the full username to search.');
      return;
    }
    setIsSearching(true);
    setSearched(true);
    setSearchResults([]);
    try {
      const { data } = await api.get(`/users/search?q=${search.trim()}`);
      setSearchResults(data.users);
    } catch (_) {} finally { setIsSearching(false); }
  };

  const toggleUser = (user) => {
    const exists = selected.find(u => u._id === user._id);
    if (exists) {
      setSelected(s => s.filter(u => u._id !== user._id));
    } else {
      if (selected.length >= 49) {
        Alert.alert('Limit Reached', 'Maximum group capacity is 50 members (including yourself).');
        return;
      }
      setSelected(s => [...s, user]);
    }
  };

  const pickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true, aspect: [1, 1], quality: 0.8,
    });
    if (!result.canceled) setAvatar(result.assets[0]);
  };

  const createGroup = async () => {
    if (!name.trim()) { Alert.alert('Error', 'Group name is required'); return; }
    if (selected.length >= 50) { Alert.alert('Error', 'Maximum group capacity is 50 members.'); return; }
    setIsCreating(true);
    try {
      const formData = new FormData();
      formData.append('name', name.trim());
      formData.append('description', description.trim());
      formData.append('users', JSON.stringify(selected.map(u => u._id)));
      formData.append('isPublic', isPublic ? 'true' : 'false');
      if (groupUsername.trim()) {
        formData.append('groupUsername', groupUsername.trim());
      }
      if (avatar) formData.append('groupPicture', { uri: avatar.uri, name: 'group.jpg', type: 'image/jpeg' });
      const { data } = await uploadApi.post('/chats/group', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      useChatStore.getState().addChat(data.chat);
      navigation.replace('ChatRoom', { chat: data.chat });
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to create group');
    } finally { setIsCreating(false); }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.dark.card} />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Group</Text>
        <TouchableOpacity
          onPress={createGroup}
          disabled={isCreating || !name.trim()}
          style={[styles.createHeaderBtn, !name.trim() && { opacity: 0.4 }]}
        >
          {isCreating
            ? <ActivityIndicator size="small" color={Colors.primary} />
            : <Text style={styles.createHeaderText}>Create</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        {/* ── Group avatar ──────────────────────────────────────────────────── */}
        <TouchableOpacity style={styles.avatarWrap} onPress={pickAvatar} activeOpacity={0.8}>
          {avatar ? (
            <Image source={{ uri: avatar.uri }} style={styles.avatar} />
          ) : (
            <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.avatar}>
              <Ionicons name="people" size={36} color="#FFF" />
            </LinearGradient>
          )}
          <View style={styles.cameraBadge}>
            <Ionicons name="camera" size={14} color="#FFF" />
          </View>
        </TouchableOpacity>
        <Text style={styles.avatarHint}>Tap to add group photo</Text>

        {/* ── Info card ─────────────────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.fieldRow}>
            <Ionicons name="people-outline" size={20} color={Colors.dark.muted} />
            <TextInput
              style={styles.fieldInput}
              value={name}
              onChangeText={setName}
              placeholder="Group name"
              placeholderTextColor={Colors.dark.muted}
              maxLength={50}
            />
          </View>
          <View style={styles.fieldDivider} />
          <View style={styles.fieldRow}>
            <Ionicons name="document-text-outline" size={20} color={Colors.dark.muted} />
            <TextInput
              style={[styles.fieldInput, styles.descInput]}
              value={description}
              onChangeText={setDescription}
              placeholder="Group description (optional)"
              placeholderTextColor={Colors.dark.muted}
              multiline
              maxLength={200}
              textAlignVertical="top"
            />
          </View>
          <View style={styles.fieldDivider} />
          <View style={styles.fieldRow}>
            <Ionicons name="at-outline" size={20} color={Colors.dark.muted} />
            <TextInput
              style={styles.fieldInput}
              value={groupUsername}
              onChangeText={setGroupUsername}
              placeholder="Group username (optional, for search)"
              placeholderTextColor={Colors.dark.muted}
              autoCapitalize="none"
              maxLength={30}
            />
          </View>
          <View style={styles.fieldDivider} />
          <View style={[styles.fieldRow, { justifyContent: 'space-between', paddingVertical: 12 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Ionicons name="globe-outline" size={20} color={Colors.dark.muted} />
              <Text style={{ color: Colors.dark.text, fontSize: 15 }}>Public & Searchable</Text>
            </View>
            <TouchableOpacity 
              onPress={() => setIsPublic(!isPublic)}
              style={[styles.toggleBtn, isPublic && styles.toggleBtnActive]}
              activeOpacity={0.8}
            >
              <View style={[styles.toggleDot, isPublic && styles.toggleDotActive]} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Selected members chips ────────────────────────────────────────── */}
        {selected.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>PARTICIPANTS ({selected.length})</Text>
            <View style={styles.chipsWrap}>
              {selected.map(u => (
                <TouchableOpacity key={u._id} style={styles.chip} onPress={() => toggleUser(u)}>
                  <View style={styles.chipAvatar}>
                    <Text style={styles.chipInitial}>{(u.displayName || u.username).charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={styles.chipText}>{u.displayName || u.username}</Text>
                  <Ionicons name="close-circle" size={16} color={Colors.dark.muted} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── Search ───────────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ADD PARTICIPANTS</Text>
          <View style={styles.card}>
            <View style={styles.searchRow}>
              <Ionicons name="search-outline" size={18} color={Colors.dark.muted} />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={(v) => { setSearch(v); setSearched(false); setSearchResults([]); }}
                placeholder="Enter exact username..."
                placeholderTextColor={Colors.dark.muted}
                autoCapitalize="none"
                returnKeyType="search"
                onSubmitEditing={handleSearch}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => { setSearch(''); setSearchResults([]); }}>
                  <Ionicons name="close-circle" size={18} color={Colors.dark.muted} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <TouchableOpacity
            style={styles.searchBtn}
            onPress={handleSearch}
            disabled={isSearching}
          >
            {isSearching
              ? <ActivityIndicator size="small" color="#FFF" />
              : <Text style={styles.searchBtnText}>Search</Text>}
          </TouchableOpacity>
        </View>

        {/* Search results */}
        {searchResults.length > 0 && (
          <View style={styles.card}>
            {searchResults.map(u => {
              const isSelected = !!selected.find(s => s._id === u._id);
              return (
                <TouchableOpacity key={u._id} style={styles.userRow} onPress={() => toggleUser(u)}>
                  {u.profilePicture ? (
                    <Image source={{ uri: u.profilePicture }} style={styles.userAvatarImg} />
                  ) : (
                    <View style={styles.userAvatar}>
                      <Text style={styles.userInitial}>{(u.displayName || u.username).charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userName}>{u.displayName || u.username}</Text>
                    <Text style={styles.userHandle}>@{u.username}</Text>
                  </View>
                  <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                    {isSelected && <Ionicons name="checkmark" size={15} color="#FFF" />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {searched && searchResults.length === 0 && !isSearching && (
          <View style={styles.emptySearch}>
            <Ionicons name="person-outline" size={36} color={Colors.dark.muted} />
            <Text style={styles.emptySearchText}>No user found for "@{search}"</Text>
          </View>
        )}

        {/* ── Create button (bottom) ────────────────────────────────────────── */}
        <TouchableOpacity
          onPress={createGroup}
          disabled={isCreating || !name.trim()}
          style={[styles.createBtn, !name.trim() && { opacity: 0.45 }]}
        >
          <LinearGradient
            colors={[Colors.primary, Colors.primaryDark]}
            style={styles.createBtnGradient}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          >
            {isCreating ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="people" size={20} color="#FFF" />
                <Text style={styles.createBtnText}>
                  Create Group{selected.length > 0 ? ` (${selected.length + 1})` : ' (Just Me)'}
                </Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.bg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 8 : 54,
    paddingBottom: 12,
    backgroundColor: Colors.dark.card,
    borderBottomWidth: 1, borderBottomColor: Colors.dark.border,
  },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: Colors.primary, marginLeft: 12 },
  createHeaderBtn: { paddingHorizontal: 4 },
  createHeaderText: { fontSize: 16, fontWeight: '700', color: Colors.primary },

  // Scroll
  scroll: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 48 },

  // Avatar
  avatarWrap: { alignSelf: 'center', marginBottom: 6, position: 'relative' },
  avatar: { width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center' },
  cameraBadge: {
    position: 'absolute', bottom: 0, right: 0,
    backgroundColor: Colors.primary, borderRadius: 14, width: 28, height: 28,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.dark.bg,
  },
  avatarHint: { textAlign: 'center', color: Colors.primary, fontSize: 12, marginBottom: 24 },

  // Card
  card: {
    backgroundColor: Colors.dark.card, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.dark.border,
    overflow: 'hidden', marginBottom: 4,
  },

  // Field rows inside card
  fieldRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 4,
  },
  fieldInput: {
    flex: 1, color: Colors.dark.text, fontSize: 15,
    paddingVertical: 14,
  },
  descInput: { minHeight: 60, textAlignVertical: 'top' },
  fieldDivider: { height: 0.5, backgroundColor: Colors.dark.border, marginLeft: 48 },

  // Section
  section: { marginBottom: 12 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.dark.muted,
    paddingHorizontal: 4, paddingBottom: 8, paddingTop: 16,
    textTransform: 'uppercase', letterSpacing: 1.2,
  },

  // Selected chips
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.dark.card, borderRadius: 20,
    paddingLeft: 6, paddingRight: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  chipAvatar: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.primary + '30', alignItems: 'center', justifyContent: 'center',
  },
  chipInitial: { fontSize: 11, fontWeight: '700', color: Colors.primary },
  chipText: { fontSize: 13, color: Colors.dark.text, fontWeight: '500' },

  // Search
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  searchInput: { flex: 1, color: Colors.dark.text, fontSize: 15 },
  searchBtn: {
    backgroundColor: Colors.primary, borderRadius: 12,
    marginTop: 8, paddingVertical: 13, alignItems: 'center',
  },
  searchBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },

  // User rows
  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: Colors.dark.border,
  },
  userAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.primary + '25', alignItems: 'center', justifyContent: 'center',
  },
  userAvatarImg: { width: 44, height: 44, borderRadius: 22 },
  userInitial: { fontSize: 18, fontWeight: '700', color: Colors.primary },
  userName: { fontSize: 15, fontWeight: '600', color: Colors.dark.text },
  userHandle: { fontSize: 13, color: Colors.dark.muted, marginTop: 1 },
  checkbox: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: Colors.dark.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },

  // Empty search
  emptySearch: { alignItems: 'center', paddingVertical: 20, gap: 6 },
  emptySearchText: { fontSize: 13, color: Colors.dark.muted },

  // Create button
  createBtn: { marginTop: 24 },
  createBtnGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, borderRadius: 16, paddingVertical: 18,
  },
  createBtnText: { color: '#FFF', fontSize: 17, fontWeight: '700' },

  // Toggle button (switch)
  toggleBtn: {
    width: 44, height: 24, borderRadius: 12,
    backgroundColor: '#1E2840', padding: 2,
    justifyContent: 'center', borderWidth: 1, borderColor: Colors.dark.border,
  },
  toggleBtnActive: {
    backgroundColor: Colors.primary + '20', borderColor: Colors.primary,
  },
  toggleDot: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: Colors.dark.muted,
  },
  toggleDotActive: {
    backgroundColor: Colors.primary,
    transform: [{ translateX: 20 }],
  },
});
