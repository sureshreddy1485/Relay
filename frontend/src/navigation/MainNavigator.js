import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TabNavigator from './TabNavigator';
import ChatRoomScreen from '../screens/chat/ChatRoomScreen';
import GroupInfoScreen from '../screens/chat/GroupInfoScreen';
import GroupPreviewScreen from '../screens/chat/GroupPreviewScreen';
import UserProfileScreen from '../screens/user/UserProfileScreen';
import NewChatScreen from '../screens/chat/NewChatScreen';
import CreateGroupScreen from '../screens/chat/CreateGroupScreen';
import MediaViewerScreen from '../screens/chat/MediaViewerScreen';
import MessageInfoScreen from '../screens/chat/MessageInfoScreen';
import SharedMediaScreen from '../screens/chat/SharedMediaScreen';
import EditProfileScreen from '../screens/settings/EditProfileScreen';
import ChangePasswordScreen from '../screens/settings/ChangePasswordScreen';
import HelpScreen from '../screens/settings/HelpScreen';
import DeviceManagementScreen from '../screens/settings/DeviceManagementScreen';
import ProfileScreen from '../screens/settings/ProfileScreen';
import StoriesScreen from '../screens/stories/StoriesScreen';
import StoryViewerScreen from '../screens/stories/StoryViewerScreen';
import CommunitiesScreen from '../screens/communities/CommunitiesScreen';
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
      <Stack.Screen name="GroupPreview" component={GroupPreviewScreen} options={{ headerShown: false }} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="NewChat" component={NewChatScreen} options={{ title: 'New Chat' }} />
      <Stack.Screen name="CreateGroup" component={CreateGroupScreen} options={{ headerShown: false }} />
      <Stack.Screen name="MediaViewer" component={MediaViewerScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SharedMedia" component={SharedMediaScreen} options={{ headerShown: false }} />
      <Stack.Screen name="MessageInfo" component={MessageInfoScreen} options={{ title: 'Message Info' }} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Help" component={HelpScreen} options={{ headerShown: false }} />
      <Stack.Screen name="DeviceManagement" component={DeviceManagementScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Stories" component={StoriesScreen} options={{ headerShown: false }} />
      <Stack.Screen name="StoryViewer" component={StoryViewerScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Communities" component={CommunitiesScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
