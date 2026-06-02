import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as ScreenCapture from 'expo-screen-capture';
import {
  View, Text, Image, StyleSheet, TouchableOpacity,
  Dimensions, StatusBar, Platform, Animated, Modal,
  FlatList, Alert, ActivityIndicator, DeviceEventEmitter, KeyboardAvoidingView, TextInput, Keyboard, ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../theme/colors';
import api from '../../services/api';
import useAuthStore from '../../store/useAuthStore';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useAlert } from '../../components/CustomAlert';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';

const StoryVideo = ({ url, paused, mediaLoading, setMediaLoading }) => {
  const player = useVideoPlayer(url, p => {
    p.loop = false;
  });

  useEffect(() => {
    if (!player) return;
    if (paused || mediaLoading) {
      player.pause();
    } else {
      player.play();
    }
  }, [paused, mediaLoading, player]);

  // Handle load events via a wrapper if needed or just let it play
  // Actually, we can use an event listener, but for simplicity, we'll just wait for ready
  useEffect(() => {
    if (!player) return;
    const sub = player.addListener('statusChange', (status) => {
      if (status.status === 'readyToPlay') {
        setMediaLoading(false);
        if (!paused) player.play();
      } else if (status.status === 'loading') {
        setMediaLoading(true);
      } else if (status.status === 'error') {
        setMediaLoading(false);
        console.log('Story video load error');
      }
    });
    return () => sub.remove();
  }, [player, paused]);

  return <VideoView style={styles.storyImage} player={player} contentFit="contain" nativeControls={false} />;
};

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
  const { showAlert } = useAlert();

  useFocusEffect(
    useCallback(() => {
      ScreenCapture.preventScreenCaptureAsync().catch(() => {});
      return () => {
        ScreenCapture.allowScreenCaptureAsync().catch(() => {});
      };
    }, [])
  );
  const { stories: initialStories, user: initialStoryUser, allStories, initialUserIndex } = route.params;
  const { user: me } = useAuthStore();
  
  const [currentUserIndex, setCurrentUserIndex] = useState(initialUserIndex ?? -1);
  const [storyUser, setStoryUser] = useState(initialStoryUser);
  const [activeStories, setActiveStories] = useState(initialStories || []);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showViewers, setShowViewers] = useState(false);
  const [viewers, setViewers] = useState([]);
  const [viewerCount, setViewerCount] = useState(0);
  const [paused, setPaused] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isLoadingViewers, setIsLoadingViewers] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const animRef = useRef(null);
  const inputRef = useRef(null);

  const currentStory = activeStories[currentIndex];
  const isMyStory = storyUser?._id === me?._id;

  const handleReply = async () => {
    if (!replyText.trim()) return;
    setIsReplying(true);
    setPaused(true);
    try {
      const { data: chatData } = await api.post('/chats', { userId: storyUser._id });
      await api.post('/messages', {
        chatId: chatData.chat._id,
        content: replyText.trim(),
        messageType: 'story_reply',
        storyData: {
          mediaUrl: currentStory.mediaUrl || '',
          mediaType: currentStory.mediaType || 'image',
          caption: currentStory.caption || '',
        }
      });
      setReplyText('');
    } catch (e) {
      showAlert('Error', 'Failed to send reply');
    } finally {
      setIsReplying(false);
      setPaused(false);
    }
  };

  // Reset loading when story changes
  useEffect(() => {
    setMediaLoading(true);
  }, [currentIndex]);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setPaused(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      if (!showEmoji) setPaused(false);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [showEmoji]);

  useEffect(() => {
    if (showEmoji) {
      setPaused(true);
    }
  }, [showEmoji]);

  useEffect(() => {
    if (currentStory?._id && !isMyStory) {
      api.put(`/stories/${currentStory._id}/view`).then(() => {
        DeviceEventEmitter.emit('story_viewed');
        // Also tell StoriesScreen to grey out this user's ring
        if (storyUser?._id) {
          DeviceEventEmitter.emit('story_user_viewed', { userId: storyUser._id.toString() });
        }
      }).catch(() => {});
    }
    // Update viewer count for own stories
    if (currentStory?._id && isMyStory) {
      setViewerCount(currentStory.viewers?.length || 0);
    }
  }, [currentStory?._id]);



  const progressValue = useRef(0);

  useEffect(() => {
    const listener = progress.addListener(({ value }) => {
      progressValue.current = value;
    });
    return () => progress.removeListener(listener);
  }, [progress]);

  // Reset progress when story changes
  useEffect(() => {
    progress.setValue(0);
    progressValue.current = 0;
  }, [currentIndex]);

  const isFocused = useIsFocused();

  // Auto-advance timer
  useEffect(() => {
    if (paused || !currentStory || mediaLoading || !isFocused) return;
    
    // Resume from current progress
    const remainingDuration = STORY_DURATION * (1 - progressValue.current);
    
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: remainingDuration,
      useNativeDriver: false,
    });
    animRef.current = anim;
    anim.start(({ finished }) => {
      if (finished) goNext();
    });
    return () => anim.stop();
  }, [currentIndex, paused, mediaLoading, activeStories, isFocused]);

  const goNext = () => {
    if (currentIndex < activeStories.length - 1) {
      setCurrentIndex(i => i + 1);
    } else {
      // Jump to next user's story if available
      if (allStories && currentUserIndex !== -1 && currentUserIndex < allStories.length - 1) {
        const nextUserIndex = currentUserIndex + 1;
        const nextUserObj = allStories[nextUserIndex];
        setCurrentUserIndex(nextUserIndex);
        setStoryUser(nextUserObj.user);
        setActiveStories(nextUserObj.stories);
        setCurrentIndex(0);
      } else {
        navigation.goBack();
      }
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(i => i - 1);
    } else {
      if (allStories && currentUserIndex > 0) {
        const prevUserIndex = currentUserIndex - 1;
        const prevUserObj = allStories[prevUserIndex];
        setCurrentUserIndex(prevUserIndex);
        setStoryUser(prevUserObj.user);
        setActiveStories(prevUserObj.stories);
        setCurrentIndex(prevUserObj.stories.length - 1);
      }
    }
  };

  const touchStartYRef = useRef(0);
  const touchStartTimeRef = useRef(0);

  const handlePressIn = (evt) => {
    touchStartYRef.current = evt.nativeEvent.pageY;
    touchStartTimeRef.current = Date.now();
    setPaused(true);
  };

  const handlePressOut = (evt) => {
    const touchDuration = Date.now() - touchStartTimeRef.current;
    const touchEndY = evt.nativeEvent.pageY;
    
    if (touchStartYRef.current - touchEndY > 50 && isMyStory) {
      openViewers();
    } else if (touchEndY - touchStartYRef.current > 50) {
      // Swiped down to close
      navigation.goBack();
    } else {
      if (!showEmoji && !isReplying) setPaused(false);
      
      // Only navigate next/prev if it was a quick tap
      if (touchDuration < 250) {
        const x = evt.nativeEvent.locationX;
        if (x < SCREEN_WIDTH * 0.3) goPrev();
        else goNext();
      }
    }
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
    showAlert(
      'Delete Moment',
      'Are you sure you want to delete this moment?',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => setPaused(false) },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/stories/${currentStory._id}`);
              showAlert('Deleted', 'Moment deleted successfully');
              
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
              showAlert('Error', e.message || 'Failed to delete moment');
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
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
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
        <TouchableOpacity style={styles.userInfo} onPress={() => { 
          if (isMyStory) {
            setPaused(true);
            navigation.navigate('Tabs', { screen: 'Settings' });
          } else {
            setPaused(true); 
            setSelectedUser(storyUser); 
          }
        }}>
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
              {isMyStory ? 'Your Moment' : (storyUser?.displayName || storyUser?.username)}
            </Text>
            <Text style={styles.timeText}>{timeAgo(currentStory?.createdAt)}</Text>
          </View>
        </TouchableOpacity>

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
      <TouchableOpacity activeOpacity={1} onPressIn={handlePressIn} onPressOut={handlePressOut} style={styles.mediaWrap}>
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
          <StoryVideo
            url={currentStory?.mediaUrl}
            paused={paused}
            mediaLoading={mediaLoading}
            setMediaLoading={setMediaLoading}
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
        {isMyStory ? (
          <TouchableOpacity style={styles.viewerBtn} onPress={openViewers}>
            <Ionicons name="eye-outline" size={20} color="#FFF" />
            <Text style={styles.viewerBtnText}>{viewerCount}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.replyWrap}>
            <TouchableOpacity onPress={() => { 
              if (showEmoji) {
                setShowEmoji(false);
                setTimeout(() => inputRef.current?.focus(), 100);
              } else {
                Keyboard.dismiss(); 
                setShowEmoji(true); 
              }
            }} style={{ padding: 6 }}>
              <Ionicons name={showEmoji ? 'keyboard-outline' : 'happy-outline'} size={24} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
            <TextInput
              ref={inputRef}
              style={styles.replyInput}
              placeholder="Reply..."
              placeholderTextColor="rgba(255,255,255,0.6)"
              value={replyText}
              onChangeText={setReplyText}
              onFocus={() => setShowEmoji(false)}
            />
            {replyText.trim().length > 0 && (
              <TouchableOpacity style={styles.sendReplyBtn} onPress={handleReply} disabled={isReplying}>
                {isReplying ? <ActivityIndicator size="small" color={Colors.primary} /> : <Ionicons name="send" size={20} color={Colors.primary} />}
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {showEmoji && (
        <View style={styles.emojiPanel}>
          <ScrollView contentContainerStyle={styles.emojiGrid} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {['😀','😂','🤣','😍','🥰','😘','😊','😎','🤩','🥳',
              '😢','😭','😤','😡','🤯','😱','🥺','😴','🤔','🙄',
              '👍','👎','👏','🙌','🤝','💪','🔥','❤️','💔','💯',
              '🎉','🎊','✨','⭐','🌟','💫','🫡','🫠','🤭','😏',
              '👀','💀','☠️','🤡','👻','😈','💩','🙈','🙉','🙊',
              '💖','💝','💕','💞','🧡','💛','💚','💙','💜','🖤',
              '✅','❌','⚡','🌈','☀️','🌙','🍕','🍔','☕','🎵'].map(emoji => (
              <TouchableOpacity
                key={emoji}
                style={styles.emojiItem}
                onPress={() => setReplyText(prev => prev + emoji)}
              >
                <Text style={styles.emojiItemText}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

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
                    {item.emoji && (
                      <View style={styles.viewerReactionBadge}>
                        <Text style={styles.viewerReactionEmoji}>{item.emoji}</Text>
                      </View>
                    )}
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

      {/* ── Member Profile Sheet ──────────────────────────────────── */}
      <Modal visible={!!selectedUser} transparent animationType="slide" onRequestClose={() => { setSelectedUser(null); setPaused(false); }}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => { setSelectedUser(null); setPaused(false); }}>
          <View style={styles.memberSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.viewerHandle} />

            {/* Member Avatar */}
            <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 20 }}>
              {selectedUser?.profilePicture ? (
                <Image source={{ uri: selectedUser.profilePicture }} style={styles.memberSheetAvatar} />
              ) : (
                <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.memberSheetAvatar}>
                  <Text style={{ fontSize: 32, fontWeight: '800', color: '#FFF' }}>
                    {(selectedUser?.displayName || selectedUser?.username || '?').charAt(0).toUpperCase()}
                  </Text>
                </LinearGradient>
              )}
              <Text style={styles.memberSheetName}>{selectedUser?.displayName || selectedUser?.username}</Text>
              {(() => {
                let areFriends = false;
                if (selectedUser && selectedUser._id !== me?._id) {
                   areFriends = me?.friends?.some(f => (f._id || f).toString() === selectedUser._id.toString());
                }
                if (selectedUser?._id === me?._id || areFriends || selectedUser?.username === 'mica_bot') {
                  return <Text style={styles.memberSheetUsername}>@{selectedUser?.username}</Text>;
                }
                return <Text style={[styles.memberSheetUsername, { fontStyle: 'italic' }]}>@Hidden (Add friend to view)</Text>;
              })()}
            </View>

            {/* Actions */}
            {selectedUser?.role !== 'system_bot' && selectedUser?.username !== 'mica_bot' && (
              <View style={styles.memberSheetActions}>
                {selectedUser?._id !== me?._id && (
                  <>
                    {/* Message / DM */}
                    {(() => {
                      let isMsgAllowed = true;
                      if (selectedUser && selectedUser._id !== me?._id) {
                        const areFriends = me?.friends?.some(f => (f._id || f).toString() === selectedUser._id.toString());
                        if (!areFriends) {
                          isMsgAllowed = false; // Strictly disabled for non-friends
                        }
                      }

                      return (
                        <TouchableOpacity
                          style={[styles.memberSheetItem, !isMsgAllowed && styles.memberSheetItemDisabled]}
                          disabled={!isMsgAllowed}
                          onPress={async () => {
                            const memberId = selectedUser._id;
                            setSelectedUser(null);
                            // don't setPaused(false) here, isFocused handles it
                            try {
                              const { data } = await api.post('/chats', { userId: memberId });
                              navigation.reset({
                                index: 1,
                                routes: [
                                  { name: 'Tabs', params: { screen: 'Chats' } },
                                  { name: 'ChatRoom', params: { chat: data.chat } },
                                ],
                              });
                            } catch (e) { showAlert('Error', e.message); }
                          }}
                        >
                          <Ionicons name="chatbubble-outline" size={20} color={isMsgAllowed ? Colors.dark.text : Colors.dark.muted} />
                          <Text style={[styles.memberSheetLabel, !isMsgAllowed && { color: Colors.dark.muted }]}>Message</Text>
                          {!isMsgAllowed && <Text style={styles.memberSheetSub}>DMs disabled</Text>}
                        </TouchableOpacity>
                      );
                    })()}

                    <View style={{ height: 1, backgroundColor: Colors.dark.border }} />

                    {/* Add Friend */}
                    {(() => {
                      const areFriends = selectedUser && me?.friends?.some(f => (f._id || f).toString() === selectedUser._id.toString());
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
                            const memberId = selectedUser._id;
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

                    <View style={{ height: 1, backgroundColor: Colors.dark.border }} />
                  </>
                )}

                {/* View Profile */}
              <TouchableOpacity
                style={styles.memberSheetItem}
                onPress={() => {
                  setSelectedUser(null);
                  navigation.navigate('UserProfile', { username: selectedUser.username });
                }}
              >
                <Ionicons name="person-outline" size={20} color={Colors.dark.text} />
                  <Text style={styles.memberSheetLabel}>View Profile</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Cancel */}
            <TouchableOpacity style={styles.memberSheetCancel} onPress={() => { setSelectedUser(null); setPaused(false); }}>
              <Text style={styles.memberSheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
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
  mediaWrap: { flex: 1, minHeight: 0, justifyContent: 'center', alignItems: 'center', width: '100%' },
  storyImage: { width: '100%', flex: 1 },
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 20, paddingBottom: 24, paddingTop: 8,
    position: 'relative', width: '100%',
  },
  counter: { position: 'absolute', left: 20, color: 'rgba(255,255,255,0.4)', fontSize: 12 },
  viewerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  viewerBtnText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  
  replyWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 24, paddingLeft: 16, paddingRight: 8, paddingVertical: 4, flex: 1, marginLeft: 30, marginRight: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  replyInput: { flex: 1, color: '#FFF', fontSize: 14, paddingVertical: 8 },
  sendReplyBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  reactionBarMini: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reactionBtnMini: { padding: 4 },
  reactionEmoji: { fontSize: 20 },

  emojiPanel: { height: 250, backgroundColor: Colors.dark.card, borderTopWidth: 1, borderTopColor: Colors.dark.border },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 10, paddingBottom: 40 },
  emojiItem: { width: '12.5%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  emojiItemText: { fontSize: 28 },

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
  viewerReactionBadge: { backgroundColor: 'rgba(255,255,255,0.1)', padding: 6, borderRadius: 16 },
  viewerReactionEmoji: { fontSize: 20 },
  viewerCloseBtn: {
    backgroundColor: Colors.dark.card, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center', marginTop: 12,
    borderWidth: 1, borderColor: Colors.primary + '30',
  },
  viewerCloseBtnText: { fontSize: 16, fontWeight: '600', color: Colors.primary },

  // Member Profile Sheet
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
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
});
