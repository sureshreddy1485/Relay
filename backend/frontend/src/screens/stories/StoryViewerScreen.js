import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, Image, StyleSheet, TouchableOpacity,
  Dimensions, StatusBar, Platform, Animated, Modal,
  FlatList, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../theme/colors';
import api from '../../services/api';
import useAuthStore from '../../store/useAuthStore';
import { Video, ResizeMode } from 'expo-av';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const STORY_DURATION = 5000;
const TOP_SAFE = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 8 : 54;

const formatViewedTime = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export default function StoryViewerScreen({ route, navigation }) {
  const { stories: initialStories, user: storyUser } = route.params;
  const { user: me } = useAuthStore();
  const [activeStories, setActiveStories] = useState(initialStories || []);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showViewers, setShowViewers] = useState(false);
  const [viewers, setViewers] = useState([]);
  const [viewerCount, setViewerCount] = useState(0);
  const [paused, setPaused] = useState(false);
  const [isLoadingViewers, setIsLoadingViewers] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(true);
  const progress = useRef(new Animated.Value(0)).current;
  const animRef = useRef(null);

  const currentStory = activeStories[currentIndex];
  const isMyStory = storyUser?._id === me?._id;

  // Reset loading when story changes
  useEffect(() => {
    setMediaLoading(true);
  }, [currentIndex]);

  // Mark story as viewed
  useEffect(() => {
    if (currentStory?._id && !isMyStory) {
      api.put(`/stories/${currentStory._id}/view`).catch(() => {});
    }
    // Update viewer count for own stories
    if (currentStory?._id && isMyStory) {
      setViewerCount(currentStory.viewers?.length || 0);
    }
  }, [currentStory?._id]);

  // Auto-advance timer
  useEffect(() => {
    if (paused || !currentStory || mediaLoading) return;
    progress.setValue(0);
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: STORY_DURATION,
      useNativeDriver: false,
    });
    animRef.current = anim;
    anim.start(({ finished }) => {
      if (finished) goNext();
    });
    return () => anim.stop();
  }, [currentIndex, paused, mediaLoading, activeStories]);

  const goNext = () => {
    if (currentIndex < activeStories.length - 1) {
      setCurrentIndex(i => i + 1);
    } else {
      navigation.goBack();
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) setCurrentIndex(i => i - 1);
  };

  const handleTap = (evt) => {
    const x = evt.nativeEvent.locationX;
    if (x < SCREEN_WIDTH * 0.3) goPrev();
    else goNext();
  };

  const openViewers = async () => {
    setPaused(true);
    animRef.current?.stop();
    setIsLoadingViewers(true);
    setShowViewers(true);
    try {
      const { data } = await api.get(`/stories/${currentStory._id}/viewers`);
      setViewers(data.viewers || []);
      setViewerCount(data.count || 0);
    } catch (e) {
      setViewers([]);
    } finally {
      setIsLoadingViewers(false);
    }
  };

  const closeViewers = () => {
    setShowViewers(false);
    setPaused(false);
  };

  const deleteCurrentStory = async () => {
    setPaused(true);
    animRef.current?.stop();
    Alert.alert(
      'Delete Story',
      'Are you sure you want to delete this story?',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => setPaused(false) },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/stories/${currentStory._id}`);
              Alert.alert('Deleted', 'Story deleted successfully');
              
              const updatedStories = activeStories.filter(s => s._id !== currentStory._id);
              if (updatedStories.length === 0) {
                navigation.goBack();
              } else {
                setActiveStories(updatedStories);
                if (currentIndex >= updatedStories.length) {
                  setCurrentIndex(updatedStories.length - 1);
                }
                setPaused(false);
              }
            } catch (e) {
              Alert.alert('Error', e.message || 'Failed to delete story');
              setPaused(false);
            }
          }
        }
      ]
    );
  };

  const timeAgo = (date) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* Progress bars */}
      <View style={styles.progressRow}>
        {activeStories.map((_, i) => (
          <View key={i} style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  width: i < currentIndex
                    ? '100%'
                    : i === currentIndex
                      ? progress.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0%', '100%'],
                        })
                      : '0%',
                },
              ]}
            />
          </View>
        ))}
      </View>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.userInfo}>
          {storyUser?.profilePicture ? (
            <Image source={{ uri: storyUser.profilePicture }} style={styles.avatar} />
          ) : (
            <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.avatar}>
              <Text style={styles.avatarInitial}>
                {(storyUser?.displayName || storyUser?.username)?.charAt(0).toUpperCase()}
              </Text>
            </LinearGradient>
          )}
          <View>
            <Text style={styles.username}>
              {isMyStory ? 'Your Story' : (storyUser?.displayName || storyUser?.username)}
            </Text>
            <Text style={styles.timeText}>{timeAgo(currentStory?.createdAt)}</Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          {isMyStory && (
            <TouchableOpacity onPress={deleteCurrentStory} style={styles.deleteBtn}>
              <Ionicons name="trash-outline" size={22} color="#EF4444" />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
            <Ionicons name="close" size={28} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Story Media */}
      <TouchableOpacity activeOpacity={1} onPress={handleTap} style={styles.mediaWrap}>
        {mediaLoading && (
          <ActivityIndicator color={Colors.primary} size="large" style={{ position: 'absolute', zIndex: 10 }} />
        )}
        {currentStory?.mediaType === 'image' || !currentStory?.mediaType ? (
          <Image
            source={{ uri: currentStory?.mediaUrl }}
            style={styles.storyImage}
            resizeMode="contain"
            onLoadStart={() => setMediaLoading(true)}
            onLoadEnd={() => setMediaLoading(false)}
          />
        ) : (
          <Video
            source={{ uri: currentStory?.mediaUrl }}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={!paused && !mediaLoading}
            isMuted={false}
            style={styles.storyImage}
            useNativeControls={false}
            onLoadStart={() => setMediaLoading(true)}
            onLoad={() => setMediaLoading(false)}
            onError={(err) => {
              console.log('Story video load error:', err);
              setMediaLoading(false);
            }}
          />
        )}
      </TouchableOpacity>

      {/* Caption */}
      {currentStory?.caption ? (
        <View style={styles.captionWrap}>
          <Text style={styles.captionText}>{currentStory.caption}</Text>
        </View>
      ) : null}

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        <Text style={styles.counter}>{currentIndex + 1} / {activeStories.length}</Text>

        {isMyStory && (
          <TouchableOpacity style={styles.viewerBtn} onPress={openViewers}>
            <Ionicons name="eye-outline" size={20} color="#FFF" />
            <Text style={styles.viewerBtnText}>{viewerCount}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Viewers Bottom Sheet */}
      <Modal visible={showViewers} transparent animationType="slide" onRequestClose={closeViewers}>
        <TouchableOpacity style={styles.viewerOverlay} activeOpacity={1} onPress={closeViewers}>
          <View style={styles.viewerSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.viewerHandle} />
            <View style={styles.viewerHeader}>
              <Ionicons name="eye-outline" size={20} color={Colors.primary} />
              <Text style={styles.viewerTitle}>Viewed by {viewerCount}</Text>
            </View>

            {isLoadingViewers ? (
              <ActivityIndicator color={Colors.primary} size="large" style={{ marginVertical: 40 }} />
            ) : viewers.length === 0 ? (
              <View style={styles.viewerEmpty}>
                <Ionicons name="eye-off-outline" size={36} color={Colors.dark.muted} />
                <Text style={styles.viewerEmptyText}>No one has viewed this yet</Text>
              </View>
            ) : (
              <FlatList
                data={viewers}
                keyExtractor={(item) => item._id}
                style={{ maxHeight: 320 }}
                renderItem={({ item }) => (
                  <View style={styles.viewerItem}>
                    {item.profilePicture ? (
                      <Image source={{ uri: item.profilePicture }} style={styles.viewerAvatar} />
                    ) : (
                      <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.viewerAvatar}>
                        <Text style={styles.viewerAvatarInitial}>
                          {(item.displayName || item.username)?.charAt(0).toUpperCase()}
                        </Text>
                      </LinearGradient>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.viewerName}>{item.displayName || item.username}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <Text style={styles.viewerUsername}>@{item.username}</Text>
                        {item.viewedAt && (
                          <>
                            <Text style={{ color: Colors.dark.muted, fontSize: 11 }}>•</Text>
                            <Text style={{ color: Colors.dark.muted, fontSize: 11 }}>{formatViewedTime(item.viewedAt)}</Text>
                          </>
                        )}
                      </View>
                    </View>
                  </View>
                )}
              />
            )}

            <TouchableOpacity style={styles.viewerCloseBtn} onPress={closeViewers}>
              <Text style={styles.viewerCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  // Progress bars
  progressRow: {
    flexDirection: 'row', gap: 4,
    paddingHorizontal: 8, paddingTop: TOP_SAFE,
  },
  progressTrack: {
    flex: 1, height: 2.5,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 2, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#FFF', borderRadius: 2 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 12,
  },
  userInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  username: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  timeText: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  deleteBtn: { padding: 4 },
  closeBtn: { padding: 4 },

  // Media
  mediaWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  storyImage: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.65 },
  videoPlaceholder: { alignItems: 'center', gap: 12 },
  videoText: { color: Colors.dark.muted, fontSize: 14 },

  // Caption
  captionWrap: {
    position: 'absolute', bottom: 70, left: 0, right: 0,
    paddingHorizontal: 20, paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  captionText: { color: '#FFF', fontSize: 15, textAlign: 'center', lineHeight: 22 },

  // Bottom bar
  bottomBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 24, paddingTop: 8,
  },
  counter: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },
  viewerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  viewerBtnText: { color: '#FFF', fontSize: 14, fontWeight: '600' },

  // Viewer sheet
  viewerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  viewerSheet: {
    backgroundColor: Colors.dark.bg,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 16, paddingBottom: 28, paddingTop: 8,
    borderTopWidth: 2, borderTopColor: Colors.primary,
  },
  viewerHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.primary, alignSelf: 'center', marginBottom: 16,
  },
  viewerHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: Colors.dark.border,
    marginBottom: 4,
  },
  viewerTitle: { fontSize: 16, fontWeight: '700', color: Colors.primary },
  viewerEmpty: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  viewerEmptyText: { color: Colors.dark.muted, fontSize: 14 },
  viewerItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 4,
    borderBottomWidth: 0.5, borderBottomColor: Colors.dark.border,
  },
  viewerAvatar: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  viewerAvatarInitial: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  viewerName: { fontSize: 15, fontWeight: '600', color: Colors.dark.text },
  viewerUsername: { fontSize: 13, color: Colors.dark.muted, marginTop: 1 },
  viewerCloseBtn: {
    backgroundColor: Colors.dark.card, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center', marginTop: 12,
    borderWidth: 1, borderColor: Colors.primary + '30',
  },
  viewerCloseBtnText: { fontSize: 16, fontWeight: '600', color: Colors.primary },
});
