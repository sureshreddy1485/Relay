import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TabNavigator from './TabNavigator';
import ChatRoomScreen from '../screens/chat/ChatRoomScreen';
import GroupInfoScreen from '../screens/chat/GroupInfoScreen';
import UserProfileScreen from '../screens/user/UserProfileScreen';
import NewChatScreen from '../screens/chat/NewChatScreen';
import CreateGroupScreen from '../screens/chat/CreateGroupScreen';
import MediaViewerScreen from '../screens/chat/MediaViewerScreen';
import MessageInfoScreen from '../screens/chat/MessageInfoScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import EditProfileScreen from '../screens/settings/EditProfileScreen';
import ChangePasswordScreen from '../screens/settings/ChangePasswordScreen';
import ProfileScreen from '../screens/settings/ProfileScreen';
import StoriesScreen from '../screens/stories/StoriesScreen';
import StoryViewerScreen from '../screens/stories/StoryViewerScreen';
import { Colors } from '../theme/colors';

const Stack = createNativeStackNavigator();

export default function MainNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: Colors.dark.card },
        headerTintColor: Colors.dark.text,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: Colors.dark.bg },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Tabs" component={TabNavigator} options={{ headerShown: false }} />
      <Stack.Screen name="ChatRoom" component={ChatRoomScreen} options={{ headerShown: false }} />
      <Stack.Screen name="GroupInfo" component={GroupInfoScreen} options={{ headerShown: false }} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} options={{ title: '' }} />
      <Stack.Screen name="NewChat" component={NewChatScreen} options={{ title: 'New Chat' }} />
      <Stack.Screen name="CreateGroup" component={CreateGroupScreen} options={{ headerShown: false }} />
      <Stack.Screen name="MediaViewer" component={MediaViewerScreen} options={{ headerShown: false }} />
      <Stack.Screen name="MessageInfo" component={MessageInfoScreen} options={{ title: 'Message Info' }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Stories" component={StoriesScreen} options={{ headerShown: false }} />
      <Stack.Screen name="StoryViewer" component={StoryViewerScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
