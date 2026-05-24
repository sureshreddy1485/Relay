import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ChatsListScreen from '../screens/chat/ChatsListScreen';
import CommunitiesScreen from '../screens/communities/CommunitiesScreen';
import StoriesScreen from '../screens/stories/StoriesScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import { Colors } from '../theme/colors';
import useChatStore from '../store/useChatStore';
import useAuthStore from '../store/useAuthStore';
import api from '../services/api';

const Tab = createBottomTabNavigator();

const TabBarIcon = ({ name, color, badge }) => (
  <View style={{ alignItems: 'center', justifyContent: 'center' }}>
    <Ionicons name={name} size={24} color={color} />
    {badge > 0 && (
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
      </View>
    )}
  </View>
);

export default function TabNavigator() {
  const unreadCounts = useChatStore(s => s.unreadCounts);
  const totalUnread  = Object.values(unreadCounts).filter(count => count > 0).length;
  const { user }       = useAuthStore();
  const [unseenStoriesCount, setUnseenStoriesCount] = React.useState(0);
  const insets       = useSafeAreaInsets();

  const fetchUnseenStories = React.useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await api.get('/stories');
      let count = 0;
      (data.stories || []).forEach(item => {
        if (item.user?._id === user._id || item.user === user._id) return;
        (item.stories || []).forEach(story => {
          const viewed = story.viewers?.some(v => {
            if (!v) return false;
            if (typeof v === 'string') return v === user._id;
            const uId = v.user?._id || v.user;
            if (uId) return uId.toString() === user._id.toString();
            const directId = v._id || v;
            return directId.toString() === user._id.toString();
          });
          if (!viewed) {
            count++;
          }
        });
      });
      setUnseenStoriesCount(count);
    } catch (_) {}
  }, [user]);

  React.useEffect(() => {
    fetchUnseenStories();
    const interval = setInterval(fetchUnseenStories, 30000); // Poll every 30s to keep developer console logs clean
    return () => clearInterval(interval);
  }, [fetchUnseenStories]);

  // Tab bar height = 62px content + device bottom inset
  const tabBarHeight = 62 + (insets.bottom || 8);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor:   Colors.primary,
        tabBarInactiveTintColor: Colors.dark.muted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: {
          backgroundColor:  Colors.dark.card,
          borderTopColor:   Colors.dark.border,
          borderTopWidth:   1,
          height:           tabBarHeight,
          paddingBottom:    (insets.bottom || 8) + 6,
          paddingTop:       10,
        },
      }}
    >
      <Tab.Screen
        name="Chats"
        component={ChatsListScreen}
        options={{
          title: 'Nexo',
          tabBarLabel: 'Chats',
          tabBarIcon: ({ focused, color }) => (
            <TabBarIcon
              name={focused ? 'chatbubbles' : 'chatbubbles-outline'}
              color={color}
              badge={totalUnread}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Communities"
        component={CommunitiesScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? 'people' : 'people-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Stories"
        component={StoriesScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <TabBarIcon
              name={focused ? 'sparkles' : 'sparkles-outline'}
              color={color}
              badge={unseenStoriesCount}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? 'settings' : 'settings-outline'} size={24} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: Colors.accent,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },
});
