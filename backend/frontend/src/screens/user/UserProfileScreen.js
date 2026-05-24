import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Image, ActivityIndicator, TouchableOpacity,
  ScrollView, Alert, StatusBar, Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../theme/colors';
import api from '../../services/api';
import useAuthStore from '../../store/useAuthStore';

const { width: SCREEN_W } = Dimensions.get('window');

export default function UserProfileScreen({ route, navigation }) {
  const { username } = route.params || {};
  const { user: authUser, updateUser } = useAuthStore();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (username) {
      fetchProfile();
    }
  }, [username]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const { data } = await api.get(`/users/${username}`);
      setProfile(data.user);
    } catch (e) {
      console.log('Error fetching user profile:', e);
      Alert.alert('Error', 'Failed to load user profile.');
    } finally {
      setLoading(false);
    }
  };

  const handleMessage = async () => {
    if (!profile) return;
    try {
      const { data } = await api.post('/chats', { userId: profile._id });
      navigation.navigate('ChatRoom', { chat: data.chat });
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not open chat');
    }
  };

  const handleAddFriend = async () => {
    if (!profile) return;
    try {
      await api.post(`/users/${profile._id}/friend-request`);
      Alert.alert('Success', 'Friend request sent!');
    } catch (e) {
      Alert.alert('Info', e.response?.data?.message || e.message);
    }
  };

  const handleRemoveFriend = () => {
    if (!profile) return;
    Alert.alert(
      'Remove Friend',
      `Are you sure you want to remove ${profile.displayName || profile.username} from your friends list?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.post(`/users/${profile._id}/remove-friend`);
              const updatedFriends = (authUser.friends || []).filter(
                id => id.toString() !== profile._id.toString()
              );
              updateUser({ friends: updatedFriends });
              Alert.alert('Success', 'Removed from friends list.');
            } catch (e) {
              Alert.alert('Error', e.message || 'Failed to remove friend');
            }
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.muted} />
        <Text style={styles.errorText}>User profile not found</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isFriend = authUser?.friends?.some(
    f => (f._id || f).toString() === profile._id.toString()
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Custom Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBack} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>User Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          {/* Avatar Section */}
          <View style={styles.avatarContainer}>
            {profile.profilePicture ? (
              <Image source={{ uri: profile.profilePicture }} style={styles.avatarImage} />
            ) : (
              <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.avatarGradient}>
                <Text style={styles.avatarLetter}>
                  {(profile.displayName || profile.username || '?').charAt(0).toUpperCase()}
                </Text>
              </LinearGradient>
            )}
          </View>

          {/* Profile Details */}
          <Text style={styles.displayName}>{profile.displayName || profile.username}</Text>
          <Text style={styles.username}>@{profile.username}</Text>

          {/* Bio Box */}
          <View style={styles.bioContainer}>
            <Text style={styles.bioTitle}>Bio</Text>
            <Text style={styles.bioText}>
              {profile.bio || 'No bio written yet.'}
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity onPress={handleMessage} activeOpacity={0.8}>
            <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.primaryActionBtn}>
              <Ionicons name="chatbubble-ellipses-outline" size={20} color="#FFF" />
              <Text style={styles.primaryActionText}>Send Message</Text>
            </LinearGradient>
          </TouchableOpacity>

          {isFriend ? (
            <TouchableOpacity style={styles.secondaryActionBtn} onPress={handleRemoveFriend} activeOpacity={0.8}>
              <Ionicons name="person-remove-outline" size={20} color="#FF4444" />
              <Text style={[styles.secondaryActionText, { color: '#FF4444' }]}>Remove Friend</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.secondaryActionBtn} onPress={handleAddFriend} activeOpacity={0.8}>
              <Ionicons name="person-add-outline" size={20} color={Colors.primary} />
              <Text style={styles.secondaryActionText}>Add Friend</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.bg,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.dark.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: Colors.dark.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorText: {
    color: Colors.dark.textSecondary,
    fontSize: 16,
    marginTop: 12,
    marginBottom: 24,
  },
  backBtn: {
    backgroundColor: Colors.dark.card,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  backBtnText: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: StatusBar.currentHeight ? StatusBar.currentHeight + 10 : 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    backgroundColor: Colors.dark.card,
  },
  headerBack: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: Colors.dark.text,
    fontSize: 18,
    fontWeight: '800',
  },
  scrollContent: {
    padding: 20,
    alignItems: 'center',
  },
  profileCard: {
    backgroundColor: Colors.dark.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: 24,
    width: '100%',
    alignItems: 'center',
    marginBottom: 24,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatarImage: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 3,
    borderColor: Colors.primary,
  },
  avatarGradient: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 48,
    fontWeight: '800',
    color: '#FFF',
  },
  displayName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFF',
    textAlign: 'center',
  },
  username: {
    fontSize: 15,
    color: Colors.dark.muted,
    marginTop: 4,
  },
  bioContainer: {
    marginTop: 24,
    width: '100%',
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  bioTitle: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  bioText: {
    fontSize: 15,
    color: Colors.dark.text,
    lineHeight: 22,
  },
  actionsContainer: {
    width: '100%',
    gap: 12,
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 24,
    width: '100%',
  },
  primaryActionText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 24,
    width: '100%',
    backgroundColor: Colors.dark.card,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  secondaryActionText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '700',
  },
});
