import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../theme/colors';
import useChatStore from '../../store/useChatStore';

const { width } = Dimensions.get('window');
const COLUMN_COUNT = 3;
const ITEM_SIZE = (width - 4) / COLUMN_COUNT;

const EMPTY_MESSAGES = [];

export default function SharedMediaScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { chatId } = route.params;
  const messages = useChatStore(state => state.messages[chatId] || EMPTY_MESSAGES);

  const mediaMessages = useMemo(() => {
    return messages.filter(m => m.mediaUrl).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [messages]);

  const renderItem = ({ item }) => {
    const isVideo = item.messageType === 'video' || (item.mediaUrl && item.mediaUrl.match(/\.(mp4|mov|webm)$/i));
    return (
      <TouchableOpacity 
        style={styles.mediaItem}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('MediaViewer', { mediaUrl: item.mediaUrl, messageType: item.messageType })}
      >
        <Image source={{ uri: item.mediaUrl }} style={styles.mediaImage} />
        {isVideo && (
          <View style={styles.videoIcon}>
            <Ionicons name="play-circle" size={24} color="#FFF" />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top || 20 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Shared Media</Text>
        <View style={{ width: 40 }} />
      </View>

      {mediaMessages.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="images-outline" size={64} color={Colors.dark.muted} />
          <Text style={styles.emptyText}>No media shared yet</Text>
        </View>
      ) : (
        <FlatList
          data={mediaMessages}
          keyExtractor={(item) => item._id}
          numColumns={COLUMN_COUNT}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: Colors.dark.border
  },
  backBtn: { padding: 8, marginLeft: -8 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.dark.text },
  listContent: { padding: 2 },
  mediaItem: { width: ITEM_SIZE, height: ITEM_SIZE, padding: 1 },
  mediaImage: { width: '100%', height: '100%', backgroundColor: Colors.dark.card },
  videoIcon: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: Colors.dark.muted, marginTop: 16, fontSize: 16 },
});
