import React, { useState, useEffect } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { DarkTheme } from '../theme/colors';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import InAppNotification from '../components/InAppNotification';
import useAuthStore from '../store/useAuthStore';

export const navigationRef = createNavigationContainerRef();

export default function RootNavigator() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return (
    <NavigationContainer theme={DarkTheme} ref={navigationRef}>
      {!isAuthenticated ? (
        <AuthNavigator />
      ) : (
        <MainNavigator />
      )}
      {isAuthenticated && <InAppNotification />}
    </NavigationContainer>
  );
}

