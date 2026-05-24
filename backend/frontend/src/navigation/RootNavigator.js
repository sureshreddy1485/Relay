import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import useAuthStore from '../store/useAuthStore';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import InAppNotification from '../components/InAppNotification';

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);

  return (
    <NavigationContainer>
      {isAuthenticated ? <MainNavigator /> : <AuthNavigator />}
      {isAuthenticated && <InAppNotification />}
    </NavigationContainer>
  );
}
