import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';
import api from '../../services/api';
import useAuthStore from '../../store/useAuthStore';
import useChatStore from '../../store/useChatStore';

export default function GroupPreviewScreen({ route, navigation }) {
  const { groupId } = route.params;
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    fetchPreview();
  }, []);

  const fetchPreview = async () => {
    try {
      setLoading(true);
      const { data } = await api.get(`/chats/group/${groupId}/preview`);
      setPreview(data.chat);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load group preview');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    try {
      setIsJoining(true);
      const { data } = await api.put(`/chats/group/${groupId}/add`, {});
      
      if (data.status === 'requested') {
        setPreview(p => ({ ...p, hasRequested: true }));
        alert('Join request sent to group admins.');
      } else {
        useChatStore.getState().addChat(data.chat);
        navigation.reset({
          index: 1,
          routes: [
            { name: 'Tabs' },
            { name: 'ChatRoom', params: { chat: data.chat } },
          ],
        });
      }
    } catch (e) {
      alert(e.response?.data?.message || 'Failed to join group');
    } finally {
      setIsJoining(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (error || !preview) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 20 }]}>
        <Ionicons name="alert-circle-outline" size={64} color="#EF4444" />
        <Text style={styles.errorText}>{error || 'Group not found'}</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backArrow} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Group Preview</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Avatar */}
        <View style={styles.avatarContainer}>
          {preview.groupPicture ? (
            <Image source={{ uri: preview.groupPicture }} style={styles.avatar} />
          ) : (
            <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.avatar}>
              <Text style={styles.avatarInitial}>
                {preview.chatName?.charAt(0).toUpperCase()}
              </Text>
            </LinearGradient>
          )}
        </View>

        <Text style={styles.groupName}>{preview.chatName}</Text>
        {preview.groupUsername && <Text style={styles.groupTag}>@{preview.groupUsername}</Text>}
        
        <View style={styles.statsRow}>
          <View style={styles.statBadge}>
            <Ionicons name="people-outline" size={16} color={Colors.dark.text} />
            <Text style={styles.statText}>{preview.users?.length || 0} Members</Text>
          </View>
          <View style={styles.statBadge}>
            <Ionicons name={preview.isPublic ? "earth" : "lock-closed"} size={16} color={Colors.dark.text} />
            <Text style={styles.statText}>{preview.isPublic ? 'Public Group' : 'Private Group'}</Text>
          </View>
        </View>

        {preview.groupDescription ? (
          <Text style={styles.description}>{preview.groupDescription}</Text>
        ) : (
          <Text style={[styles.description, { fontStyle: 'italic', color: Colors.dark.muted }]}>
            No description provided.
          </Text>
        )}

        <View style={styles.membersPreviewContainer}>
          <Text style={styles.sectionTitle}>Members Preview</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.membersList}>
            {preview.users.slice(0, 10).map((u, i) => (
              <View key={u._id || i} style={styles.memberListItem}>
                {u.profilePicture ? (
                  <Image source={{ uri: u.profilePicture }} style={styles.memberListAvatar} />
                ) : (
                  <View style={[styles.memberListAvatar, { backgroundColor: Colors.primary + '40', justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 18 }}>{u.displayName?.charAt(0) || u.username?.charAt(0) || '?'}</Text>
                  </View>
                )}
                <Text style={styles.memberListName} numberOfLines={1}>{(u.displayName || u.username).split(' ')[0]}</Text>
              </View>
            ))}
            {preview.users.length > 10 && (
              <View style={[styles.memberListItem, { justifyContent: 'center' }]}>
                <View style={[styles.memberListAvatar, { backgroundColor: Colors.dark.border, justifyContent: 'center', alignItems: 'center' }]}>
                  <Text style={{ color: Colors.dark.text, fontSize: 14, fontWeight: 'bold' }}>+{preview.users.length - 10}</Text>
                </View>
                <Text style={styles.memberListName}>More</Text>
              </View>
            )}
          </ScrollView>
        </View>

      </ScrollView>

      {/* Bottom Action Area */}
      <View style={styles.bottomBar}>
        {preview.isMember ? (
          <TouchableOpacity 
            style={[styles.joinBtn, { backgroundColor: Colors.dark.border }]} 
            onPress={() => {
              const existingChat = useChatStore.getState().chats.find(c => c._id === preview._id);
              if (existingChat) {
                navigation.reset({
                  index: 1,
                  routes: [
                    { name: 'Tabs' },
                    { name: 'ChatRoom', params: { chat: existingChat } },
                  ],
                });
              }
            }}
          >
            <Text style={styles.joinBtnText}>Open Chat</Text>
          </TouchableOpacity>
        ) : preview.hasRequested ? (
          <TouchableOpacity style={[styles.joinBtn, { backgroundColor: '#F59E0B' }]} disabled>
            <Text style={styles.joinBtnText}>Join Requested (Pending)</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.joinBtn} onPress={handleJoin} disabled={isJoining}>
            {isJoining ? <ActivityIndicator color="#FFF" /> : (
              <Text style={styles.joinBtnText}>
                {preview.joinPrivacy === 'invite_only' ? 'Request to Join' : 'Join Group'}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 50, paddingBottom: 15, paddingHorizontal: 15,
    backgroundColor: Colors.dark.card, borderBottomWidth: 1, borderBottomColor: Colors.dark.border
  },
  backArrow: { marginRight: 15, padding: 5 },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  scrollContent: { padding: 20, paddingBottom: 100, alignItems: 'center' },
  avatarContainer: { marginBottom: 20 },
  avatar: { width: 120, height: 120, borderRadius: 60, justifyContent: 'center', alignItems: 'center' },
  avatarInitial: { fontSize: 48, color: '#FFF', fontWeight: 'bold' },
  groupName: { color: '#FFF', fontSize: 26, fontWeight: '800', textAlign: 'center', marginBottom: 5 },
  groupTag: { color: Colors.primary, fontSize: 16, fontWeight: '600', marginBottom: 20 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 25 },
  statBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.dark.border, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 5 },
  statText: { color: Colors.dark.text, fontSize: 14, fontWeight: '500' },
  description: { color: Colors.dark.muted, fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 30, paddingHorizontal: 10 },
  membersPreviewContainer: { width: '100%', backgroundColor: Colors.dark.card, padding: 20, borderRadius: 16, borderWidth: 1, borderColor: Colors.dark.border },
  sectionTitle: { color: '#FFF', fontSize: 16, fontWeight: '600', marginBottom: 5 },
  membersList: { flexDirection: 'row', gap: 16, paddingVertical: 10, paddingHorizontal: 5 },
  memberListItem: { alignItems: 'center', width: 60, gap: 6 },
  memberListAvatar: { width: 50, height: 50, borderRadius: 25 },
  memberListName: { color: '#FFF', fontSize: 12, fontWeight: '500', textAlign: 'center' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, backgroundColor: Colors.dark.card, borderTopWidth: 1, borderTopColor: Colors.dark.border },
  joinBtn: { backgroundColor: Colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  joinBtnText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  errorText: { color: '#FFF', fontSize: 18, fontWeight: '600', marginTop: 15, marginBottom: 20 },
  backBtn: { backgroundColor: Colors.dark.border, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  backBtnText: { color: '#FFF', fontSize: 14, fontWeight: '600' }
});
