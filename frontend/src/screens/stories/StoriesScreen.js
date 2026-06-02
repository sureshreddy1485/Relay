import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import * as ScreenCapture from 'expo-screen-capture';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ScrollView,
  ActivityIndicator, Alert, Platform, StatusBar, Dimensions,
  Modal, TextInput, KeyboardAvoidingView, SafeAreaView, DeviceEventEmitter
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '../../theme/colors';
import api, { uploadApi } from '../../services/api';
import useAuthStore from '../../store/useAuthStore';
import TabHeader from '../../components/TabHeader';
import { getSocket } from '../../services/socketService';
import { useAlert } from '../../components/CustomAlert';

const { width } = Dimensions.get('window');
const isSmall = width <= 380;

export default function StoriesScreen({ navigation }) {
  const { showAlert } = useAlert();

  useFocusEffect(
    useCallback(() => {
      ScreenCapture.preventScreenCaptureAsync().catch(() => {});
      return () => {
        ScreenCapture.allowScreenCaptureAsync().catch(() => {});
      };
    }, [])
  );
  const { user } = useAuthStore();
  const [stories, setStories] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [previewMedia, setPreviewMedia] = useState(null);
  const [caption, setCaption] = useState('');
  const [showPickerMode, setShowPickerMode] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const inputRef = useRef(null);
  const [hiddenMoments, setHiddenMoments] = useState(new Set());
  const [viewedUsers, setViewedUsers] = useState(new Set()); // track whose stories we've already seen

  const fetchStories = async (silent = false) => {
    // Only show spinner on the very first load — silent refresh on tab-switch
    if (!silent && stories.length === 0) setIsLoading(true);
    try {
      const { data } = await api.get('/stories');
      setStories(data.stories);
    } catch (_) {} finally {
      setIsLoading(false);
    }
  };

  const storiesRef = useRef(stories);
  storiesRef.current = stories;

  useEffect(() => {
    fetchStories();                          // first load — show spinner if needed
    const unsubscribe = navigation.addListener('focus', () => {
      fetchStories(true);                    // tab-switch — silent, no spinner
    });

    const socket = getSocket();

    // New story posted by a contact — prepend to the list
    const handleNewStory = ({ story }) => {
      if (!story) return;
      const authorId = story.user?._id || story.user;
      const current = storiesRef.current;
      const existing = current.findIndex(g => (g.user?._id || g.user) === authorId);
      if (existing !== -1) {
        const updated = [...current];
        updated[existing] = {
          ...updated[existing],
          stories: [story, ...updated[existing].stories],
        };
        setStories(updated);
      } else {
        fetchStories(true);                  // new author — silent refetch
      }
    };

    // Story expired — remove from list instantly, no loading
    const handleStoryExpired = ({ storyId }) => {
      setStories(prev =>
        prev.map(group => ({
          ...group,
          stories: group.stories.filter(s => s._id !== storyId),
        })).filter(group => group.stories.length > 0)
      );
    };

    if (socket) {
      socket.on('new_story', handleNewStory);
      socket.on('story_expired', handleStoryExpired);
    }

    return () => {
      unsubscribe();
      if (socket) {
        socket.off('new_story', handleNewStory);
        socket.off('story_expired', handleStoryExpired);
      }
    };
  }, [navigation]);

  // Listen for viewed events from StoryViewer (auto-advance grey ring)
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('story_user_viewed', ({ userId }) => {
      setViewedUsers(prev => new Set(prev).add(userId));
    });
    return () => sub.remove();
  }, []);

  const openGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showAlert('Permission Denied', 'We need access to your photos to add a moment.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'], quality: 0.9,
      allowsEditing: true, aspect: [9, 16],
    });
    if (result.canceled) return;
    setPreviewMedia(result.assets[0]);
    setCaption('');
  };

  const openCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showAlert('Permission Denied', 'We need camera access to capture moments live.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images', 'videos'], quality: 0.9,
      allowsEditing: true, aspect: [9, 16],
    });
    if (result.canceled) return;
    setPreviewMedia(result.assets[0]);
    setCaption('');
  };

  const addStory = () => {
    setShowPickerMode(true);
  };

  const handlePickerOption = (type) => {
    setShowPickerMode(false);
    setTimeout(() => {
      if (type === 'camera') openCamera();
      else if (type === 'gallery') openGallery();
    }, 300); // Wait for modal to close
  };

  const postMoment = async () => {
    if (!previewMedia) return;
    setIsUploading(true);
    setPreviewMedia(null);
    try {
      const formData = new FormData();
      const isVideo = previewMedia.type === 'video';
      formData.append('media', { uri: previewMedia.uri, name: isVideo ? 'story.mp4' : 'story.jpg', type: isVideo ? 'video/mp4' : 'image/jpeg' });
      if (caption.trim()) {
        formData.append('caption', caption.trim());
      }
      await uploadApi.post('/stories', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      fetchStories();
      showAlert('✨', 'Moment added!');
    } catch (e) {
      showAlert('Error', e.message);
    } finally {
      setIsUploading(false);
      setCaption('');
    }
  };

  const renderUserStory = ({ item }) => {
    const isOwnStory = item.user._id === user?._id;
    return (
      <TouchableOpacity
        style={[styles.storyItem, item.isHidden && { opacity: 0.4 }]}
        onPress={() => {
          if (isOwnStory) {
            navigation.navigate('StoryViewer', { stories: item.stories, user: item.user });
          } else {
            // Mark this user's stories as viewed (grey ring)
            setViewedUsers(prev => new Set(prev).add(item.user._id.toString()));
            const othersStories = stories.filter(s => s.user._id !== user?._id && !hiddenMoments.has(s.user._id.toString()));
            const initialUserIndex = othersStories.findIndex(s => s.user._id === item.user._id);
            navigation.navigate('StoryViewer', {
              stories: item.stories,
              user: item.user,
              allStories: initialUserIndex > -1 ? othersStories : null,
              initialUserIndex: initialUserIndex
            });
          }
        }}
        onLongPress={() => {
          if (!isOwnStory) {
            if (item.isHidden) {
              showAlert('Unhide Moment', `Do you want to unhide moments from ${item.user.displayName || item.user.username}?`, [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Unhide',
                  onPress: () => {
                    setHiddenMoments(prev => {
                      const next = new Set(prev);
                      next.delete(item.user._id.toString());
                      return next;
                    });
                  }
                }
              ]);
            } else {
              showAlert('Hide Moment', `Do you want to hide moments from ${item.user.displayName || item.user.username}?`, [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Hide',
                  style: 'destructive',
                  onPress: () => {
                    setHiddenMoments(prev => new Set(prev).add(item.user._id.toString()));
                  }
                }
              ]);
            }
          }
        }}
      >
        <LinearGradient
          colors={item.isHidden ? ['#555', '#333'] : viewedUsers.has(item.user._id.toString()) ? ['#4A4A4A', '#2A2A2A'] : [Colors.primary, Colors.primaryDark]}
          style={styles.storyRing}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        >
          {item.user.profilePicture ? (
            <Image source={{ uri: item.user.profilePicture }} style={styles.storyAvatar} />
          ) : (
            <View style={[styles.storyAvatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitial}>{item.user.username?.charAt(0).toUpperCase()}</Text>
            </View>
          )}
        </LinearGradient>
        <Text style={styles.storyName} numberOfLines={1}>
          {isOwnStory ? 'Your Moment' : (item.user.displayName || item.user.username)}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <TabHeader title="Moments" />

      {isLoading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={[
            { isMe: true, myStory: stories.find(s => s.user._id === user?._id) },
            ...stories.filter(s => s.user._id !== user?._id && !hiddenMoments.has(s.user._id.toString())),
            ...stories.filter(s => s.user._id !== user?._id && hiddenMoments.has(s.user._id.toString())).map(s => ({ ...s, isHidden: true }))
          ]}
          keyExtractor={(item) => item.isMe ? 'me' : item.user._id}
          numColumns={3}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.columnWrapper}
          renderItem={({ item }) => {
            if (item.isMe) {
              const hasStory = !!item.myStory;
              return (
                <TouchableOpacity
                  style={styles.addStoryBtn}
                  onPress={() => {
                    const options = [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Take Photo', onPress: openCamera },
                      { text: 'Choose from Gallery', onPress: openGallery }
                    ];
                    if (hasStory) {
                      options.splice(1, 0, {
                        text: 'View Moment',
                        onPress: () => navigation.navigate('StoryViewer', { stories: item.myStory.stories, user: item.myStory.user })
                      });
                    }
                    showAlert('New Moment', 'Choose an action', options);
                  }}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <ActivityIndicator color={Colors.primary} />
                  ) : hasStory ? (
                    <>
                      <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.storyRing} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                        {user?.profilePicture ? (
                          <Image source={{ uri: user.profilePicture }} style={styles.storyAvatar} />
                        ) : (
                          <View style={[styles.storyAvatar, styles.avatarFallback]}>
                            <Text style={styles.avatarInitial}>{user?.username?.charAt(0).toUpperCase()}</Text>
                          </View>
                        )}
                      </LinearGradient>
                      <Text style={styles.storyName}>My Moment</Text>
                    </>
                  ) : (
                    <>
                      <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.addIcon}>
                        <Ionicons name="add" size={28} color="#FFF" />
                      </LinearGradient>
                      <Text style={styles.storyName}>Add Moment</Text>
                    </>
                  )}
                </TouchableOpacity>
              );
            }
            return renderUserStory({ item });
          }}
        />
      )}

      {/* Caption Preview Modal */}
      <Modal visible={!!previewMedia} transparent animationType="slide" onRequestClose={() => setPreviewMedia(null)}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <SafeAreaView style={styles.previewContainer}>
            <View style={styles.previewHeader}>
              <TouchableOpacity onPress={() => setPreviewMedia(null)} style={styles.iconBtn}>
                <Ionicons name="close" size={30} color="#FFF" />
              </TouchableOpacity>
              <Text style={styles.previewTitle}>New Moment</Text>
              <View style={{ width: 30 }} />
            </View>

            <View style={styles.previewImageWrap}>
              {previewMedia && (
                <Image source={{ uri: previewMedia.uri }} style={styles.previewImage} resizeMode="contain" />
              )}
            </View>

            <View style={styles.captionContainer}>
              <TouchableOpacity 
                onPress={() => {
                  if (showEmoji) {
                    setShowEmoji(false);
                    setTimeout(() => inputRef.current?.focus(), 100);
                  } else {
                    import('react-native').then(({ Keyboard }) => Keyboard.dismiss());
                    setShowEmoji(true);
                  }
                }} 
                style={styles.emojiToggle}
              >
                <Ionicons name={showEmoji ? 'keypad-outline' : 'happy-outline'} size={26} color={showEmoji ? Colors.primary : '#999'} />
              </TouchableOpacity>
              <TextInput
                ref={inputRef}
                style={styles.captionInput}
                placeholder="Add a caption..."
                placeholderTextColor="#999"
                value={caption}
                onChangeText={setCaption}
                onFocus={() => setShowEmoji(false)}
                maxLength={200}
                multiline
              />
              <TouchableOpacity style={styles.postBtn} onPress={postMoment}>
                <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.postBtnGrad}>
                  <Ionicons name="send" size={20} color="#FFF" />
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {showEmoji && (
              <View style={styles.emojiPanel}>
                <ScrollView contentContainerStyle={styles.emojiGrid} showsVerticalScrollIndicator={false}>
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
                      onPress={() => setCaption(prev => prev + emoji)}
                    >
                      <Text style={styles.emojiItemText}>{emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Picker Bottom Sheet */}
      <Modal visible={showPickerMode} transparent animationType="slide" onRequestClose={() => setShowPickerMode(false)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setShowPickerMode(false)}>
          <View style={styles.sheetContainer} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>New Moment</Text>

            <TouchableOpacity style={styles.sheetOption} onPress={() => handlePickerOption('camera')}>
              <View style={[styles.sheetIconWrap, { backgroundColor: '#10B98120' }]}>
                <Ionicons name="camera" size={24} color="#10B981" />
              </View>
              <Text style={styles.sheetOptionText}>Take Photo or Video</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.sheetOption} onPress={() => handlePickerOption('gallery')}>
              <View style={[styles.sheetIconWrap, { backgroundColor: '#3B82F620' }]}>
                <Ionicons name="images" size={24} color="#3B82F6" />
              </View>
              <Text style={styles.sheetOptionText}>Choose from Gallery</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.sheetCloseBtn} onPress={() => setShowPickerMode(false)}>
              <Text style={styles.sheetCloseBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.bg },
  grid: { padding: 12, gap: 8 },
  columnWrapper: { justifyContent: 'flex-start', gap: 10 },
  storyItem: { alignItems: 'center', margin: isSmall ? 4 : 6, width: isSmall ? 70 : 80 },
  storyRing: { width: isSmall ? 64 : 74, height: isSmall ? 64 : 74, borderRadius: isSmall ? 32 : 37, alignItems: 'center', justifyContent: 'center', padding: isSmall ? 2 : 3 },
  storyAvatar: { width: isSmall ? 58 : 68, height: isSmall ? 58 : 68, borderRadius: isSmall ? 29 : 34 },
  avatarFallback: { backgroundColor: Colors.dark.card, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: isSmall ? 24 : 28, fontWeight: '800', color: Colors.primary },
  storyName: { fontSize: 12, color: Colors.dark.textSecondary, marginTop: 6, textAlign: 'center' },
  addStoryBtn: { alignItems: 'center', margin: isSmall ? 4 : 6, width: isSmall ? 70 : 80 },
  addIcon: { width: isSmall ? 58 : 68, height: isSmall ? 58 : 68, borderRadius: isSmall ? 29 : 34, alignItems: 'center', justifyContent: 'center', marginBottom: isSmall ? 2 : 0 },
  
  // Preview Modal Styles
  previewContainer: { flex: 1, backgroundColor: '#000' },
  previewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  previewTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  iconBtn: { padding: 4 },
  previewImageWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  previewImage: { width: '100%', height: '100%' },
  quickEmojisRow: { flexDirection: 'row', justifyContent: 'center', gap: 20, paddingVertical: 12, backgroundColor: 'rgba(0,0,0,0.6)' },
  quickEmojiText: { fontSize: 24 },
  captionContainer: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 16, paddingBottom: 16, paddingTop: 4, gap: 12, backgroundColor: 'rgba(0,0,0,0.6)' },
  emojiToggle: { paddingBottom: 12, justifyContent: 'center' },
  captionInput: { flex: 1, backgroundColor: '#222', color: '#FFF', borderRadius: 24, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14, minHeight: 48, maxHeight: 120, fontSize: 16 },
  postBtn: { justifyContent: 'center', paddingBottom: 0 },
  postBtnGrad: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', paddingLeft: 4, marginBottom: 2 },
  
  // Emoji picker
  emojiPanel: { height: 220, backgroundColor: 'rgba(0,0,0,0.8)', borderTopWidth: 1, borderTopColor: '#333' },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingVertical: 8 },
  emojiItem: { width: '10%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  emojiItemText: { fontSize: 24 },

  // Bottom Sheet
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheetContainer: { backgroundColor: Colors.dark.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingBottom: 30, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.dark.border },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.dark.border, alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { color: '#FFF', fontSize: 18, fontWeight: '700', marginBottom: 20, textAlign: 'center' },
  sheetOption: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.dark.border },
  sheetIconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sheetOptionText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  sheetCloseBtn: { marginTop: 24, backgroundColor: Colors.dark.card, paddingVertical: 14, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: Colors.dark.border },
  sheetCloseBtnText: { color: Colors.primary, fontSize: 16, fontWeight: '600' },
});
