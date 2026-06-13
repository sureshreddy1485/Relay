import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, Image, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import useChatStore from '../store/useChatStore';
import { Colors } from '../theme/colors';

const { width } = Dimensions.get('window');

export default function InAppNotification() {
  const { inAppNotification, hideNotification } = useChatStore();
  const navigation = useNavigation();
  const slideAnim = useRef(new Animated.Value(-120)).current;
  // Keep track of the notification data even when it's null to allow for exit animation
  const [displayNotification, setDisplayNotification] = React.useState(null);

  useEffect(() => {
    if (inAppNotification) {
      setDisplayNotification(inAppNotification);
      Animated.spring(slideAnim, {
        toValue: 50, // slide down to 50px from top
        useNativeDriver: true,
        bounciness: 12,
        speed: 12,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: -120,
        duration: 250,
        useNativeDriver: true,
      }).start(() => {
        setDisplayNotification(null);
      });
    }
  }, [inAppNotification]);

  if (!displayNotification) return null;

  const handlePress = () => {
    if (displayNotification.chat) {
      useChatStore.getState().selectChat(displayNotification.chat);
      useChatStore.getState().clearUnread(displayNotification.chatId);
      navigation.reset({
        index: 1,
        routes: [
          { name: 'Tabs' },
          { name: 'ChatRoom', params: { chat: displayNotification.chat } },
        ],
      });
    }
    hideNotification();
  };

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY: slideAnim }] }]}>
      <TouchableOpacity activeOpacity={0.9} onPress={handlePress} style={styles.card}>
        <View style={styles.avatarWrap}>
          {displayNotification.avatar ? (
            <Image source={{ uri: displayNotification.avatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: Colors.primary + '44' }]}>
              <Text style={styles.avatarInitials}>
                {displayNotification.title?.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.content}>
          <Text style={styles.title} numberOfLines={1}>{displayNotification.title}</Text>
          <Text style={styles.body} numberOfLines={2}>{displayNotification.body}</Text>
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={hideNotification} hitSlop={10}>
          <Ionicons name="close" size={20} color={Colors.dark.muted} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    zIndex: 9999,
    width: width - 32,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 10,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  avatarWrap: {
    marginRight: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.primary,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 2,
  },
  body: {
    fontSize: 13,
    color: Colors.dark.muted,
  },
  closeBtn: {
    padding: 4,
    marginLeft: 8,
  },
});
