import React from 'react';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, StyleSheet, Platform, DeviceEventEmitter, Dimensions, Image, AppState, Modal, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ChatsListScreen from '../screens/chat/ChatsListScreen';
import StoriesScreen from '../screens/stories/StoriesScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import { Colors } from '../theme/colors';
import useChatStore from '../store/useChatStore';
import useAuthStore from '../store/useAuthStore';
import api from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getSocket } from '../services/socketService';

const Tab = createMaterialTopTabNavigator();

const { width } = Dimensions.get('window');
const isSmall = width <= 380;

const TabBarIcon = ({ name, color, badge, isDot }) => (
  <View style={{ alignItems: 'center', justifyContent: 'center' }}>
    <Ionicons name={name} size={24} color={color} />
    {badge > 0 && (
      isDot ? (
        <View style={styles.dotBadge} />
      ) : (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )
    )}
  </View>
);

export default function TabNavigator() {
  const unreadCounts = useChatStore(s => s.unreadCounts);
  const totalUnread  = Object.values(unreadCounts).filter(count => count > 0).length;
  const { user }       = useAuthStore();
  const [unseenStoriesCount, setUnseenStoriesCount] = React.useState(0);
  const [showAccManager, setShowAccManager] = React.useState(false);
  const [hasOtherUnread, setHasOtherUnread] = React.useState(false);
  const { savedAccounts, switchAccount, logout } = useAuthStore();
  const insets       = useSafeAreaInsets();
  const lastSettingsPressRef = React.useRef(0);
  const settingsTapTimeoutRef = React.useRef(null);
  const navigation = useNavigation();

  const checkOtherAccountsUnread = React.useCallback(async () => {
    const state = useAuthStore.getState();
    const _savedAccounts = state.savedAccounts;
    const _user = state.user;
    if (!_savedAccounts || _savedAccounts.length <= 1 || !_user) {
      setHasOtherUnread(false);
      return;
    }
    
    let anyUnread = false;
    for (const acc of _savedAccounts || []) {
      if (!acc?.user?._id) continue;
      if (acc.user._id === _user?._id) continue;
      try {
        const res = await api.get('/chats', { headers: { Authorization: `Bearer ${acc.token}` }, ignore401: true });
        if (res.data.chats.some(c => c.unreadCount > 0)) {
          anyUnread = true;
          break;
        }
      } catch (e) {
        if (e.response?.status === 401) {
          const newSaved = useAuthStore.getState().savedAccounts.filter(a => a?.user?._id !== acc?.user?._id);
          useAuthStore.setState({ savedAccounts: newSaved });
          AsyncStorage.setItem('relay_saved_accounts', JSON.stringify(newSaved));
        }
      }
    }
    setHasOtherUnread(anyUnread);
  }, []);

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
    checkOtherAccountsUnread();
    const interval = setInterval(() => {
      fetchUnseenStories();
      checkOtherAccountsUnread();
    }, 30000); // Poll every 30s as fallback
    
    const socket = getSocket();
    if (socket) {
      socket.on('new_story', fetchUnseenStories);
    }

    const sub = DeviceEventEmitter.addListener('story_viewed', fetchUnseenStories);
    const appSub = AppState.addEventListener('change', next => {
      if (next === 'active') checkOtherAccountsUnread();
    });
    
    return () => {
      clearInterval(interval);
      if (socket) {
        socket.off('new_story', fetchUnseenStories);
      }
      sub.remove();
      appSub.remove();
    };
  }, [fetchUnseenStories, checkOtherAccountsUnread]);

  // Tab bar height = base height + device bottom inset
  const baseHeight = isSmall ? 56 : 62;
  const tabBarHeight = baseHeight + (insets.bottom || 8);

  return (
    <>
      <Tab.Navigator
        tabBarPosition="bottom"
      screenOptions={{
        animationEnabled: false,
        swipeEnabled: true,
        tabBarShowIcon: true,
        tabBarActiveTintColor:   Colors.primary,
        tabBarInactiveTintColor: Colors.dark.muted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIconStyle: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
        tabBarIndicatorStyle: { height: 0 },
        tabBarStyle: {
          backgroundColor:  Colors.dark.card,
          borderTopColor:   Colors.dark.border,
          borderTopWidth:   1,
          height:           tabBarHeight,
          paddingBottom:    (insets.bottom || 8) + (isSmall ? 2 : 6),
          paddingTop:       isSmall ? 6 : 10,
        },
      }}
    >
      <Tab.Screen
        name="Chats"
        component={ChatsListScreen}
        options={{
          title: 'Relay',
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
        name="Stories"
        component={StoriesScreen}
        options={{
          tabBarLabel: 'Moments',
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
        listeners={{
          tabPress: (e) => {
            const now = Date.now();
            if (now - lastSettingsPressRef.current < 400) {
              // Double tap detected
              const { user: currentUser, savedAccounts, switchAccount } = useAuthStore.getState();
              if (currentUser && Array.isArray(savedAccounts)) {
                const validAccounts = savedAccounts.filter(a => a?.user?._id);
                const otherAccounts = validAccounts.filter(a => String(a.user._id) !== String(currentUser._id));
                if (otherAccounts.length > 0) {
                  switchAccount(otherAccounts[0].user._id);
                  navigation.navigate('Chats');
                }
              }
            }
            lastSettingsPressRef.current = now;
          },
          tabLongPress: (e) => {
            setShowAccManager(true);
          }
        }}
        options={{
          tabBarIcon: ({ focused, color }) => {
            if (user?.profilePicture) {
              return (
                <View style={[styles.profileTabWrap, focused && styles.profileTabWrapFocused]}>
                  <Image source={{ uri: user.profilePicture }} style={styles.profileTabImg} />
                  {hasOtherUnread && <View style={styles.dotBadge} />}
                </View>
              );
            }
            return (
              <View style={[styles.profileTabWrap, focused && styles.profileTabWrapFocused]}>
                <View style={[styles.profileTabImg, { backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }}>
                    {(user?.displayName || user?.username || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
                {hasOtherUnread && <View style={styles.dotBadge} />}
              </View>
            );
          },
        }}
      />
    </Tab.Navigator>
      
      {/* Account Manager Modal */}
      <Modal visible={showAccManager} transparent animationType="slide" onRequestClose={() => setShowAccManager(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} activeOpacity={1} onPress={() => setShowAccManager(false)}>
          <View style={{ backgroundColor: Colors.dark.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: (insets.bottom || 24) + 24 }}>
            <View style={{ width: 40, height: 4, backgroundColor: Colors.dark.border, borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />
            <Text style={{ color: Colors.dark.text, fontSize: 18, fontWeight: '700', marginBottom: 16 }}>Saved Accounts</Text>
            
            {(() => {
              const validAccounts = (Array.isArray(savedAccounts) ? savedAccounts : []).filter(a => a?.user?._id);
              const activeAcc = validAccounts.find(a => String(a.user._id) === String(user?._id));
              const otherAccs = validAccounts.filter(a => String(a.user._id) !== String(user?._id));
              const displayAccounts = activeAcc ? [activeAcc, ...otherAccs] : validAccounts;
              
              return (
                <>
                  {displayAccounts.map((acc) => (
                    <TouchableOpacity
                      key={acc.user._id || Math.random().toString()}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.dark.border }}
                      onPress={async () => {
                        if (String(acc.user._id) !== String(user?._id)) {
                          await switchAccount(acc.user._id);
                          setShowAccManager(false);
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {acc.user.profilePicture ? (
                          <Image source={{ uri: acc.user.profilePicture }} style={{ width: 44, height: 44, borderRadius: 22, marginRight: 12, borderWidth: acc.user._id === user?._id ? 2 : 0, borderColor: Colors.primary }} />
                        ) : (
                          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primary, marginRight: 12, alignItems: 'center', justifyContent: 'center', borderWidth: acc.user._id === user?._id ? 2 : 0, borderColor: '#FFF' }}>
                            <Text style={{ color: '#FFF', fontSize: 18, fontWeight: '700' }}>
                              {(acc.user.displayName || acc.user.username || '?').charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <View>
                          <Text style={{ color: Colors.dark.text, fontSize: 16, fontWeight: '600' }}>{acc.user.username}</Text>
                          {acc.user._id === user?._id ? (
                            <Text style={{ color: Colors.primary, fontSize: 13, fontWeight: '500' }}>Active Account</Text>
                          ) : (
                            <Text style={{ color: Colors.dark.muted, fontSize: 13 }}>Tap to switch</Text>
                          )}
                        </View>
                      </View>
                      
                      <TouchableOpacity
                        style={{ padding: 8 }}
                        onPress={() => {
                          const newSaved = savedAccounts.filter(a => a?.user?._id !== acc.user._id);
                          useAuthStore.setState({ savedAccounts: newSaved });
                          AsyncStorage.setItem('relay_saved_accounts', JSON.stringify(newSaved));
                          if (acc.user._id === user?._id) {
                            logout();
                            setShowAccManager(false);
                          }
                        }}
                      >
                        <Ionicons name="close-circle" size={24} color={Colors.dark.muted} />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  ))}
                  
                  {validAccounts.length < 3 && (
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16 }}
                      onPress={() => {
                        setShowAccManager(false);
                        const { prepareAddAccount } = useAuthStore.getState();
                        if (prepareAddAccount) prepareAddAccount();
                      }}
                    >
                      <View style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: Colors.dark.muted, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                        <Ionicons name="add" size={24} color={Colors.dark.muted} />
                      </View>
                      <Text style={{ color: Colors.dark.text, fontSize: 16, fontWeight: '600' }}>Add Account</Text>
                    </TouchableOpacity>
                  )}
                </>
              );
            })()}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
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
  dotBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.accent,
    borderWidth: 1.5,
    borderColor: Colors.dark.card,
  },
  profileTabWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  profileTabWrapFocused: {
    borderColor: Colors.primary,
  },
  profileTabImg: {
    width: 23,
    height: 23,
    borderRadius: 12,
  },
});
