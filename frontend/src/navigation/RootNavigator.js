import React, { useState, useEffect } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { DarkTheme } from '../theme/colors';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import InAppNotification from '../components/InAppNotification';
import useAuthStore from '../store/useAuthStore';

export const navigationRef = createNavigationContainerRef();

export default function RootNavigator() {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => useAuthStore.getState().isAuthenticated
  );

  useEffect(() => {
    const unsub = useAuthStore.subscribe((state) => {
      setIsAuthenticated(state.isAuthenticated);
    });
    // Catch any changes that occurred between initialization and effect
    setIsAuthenticated(useAuthStore.getState().isAuthenticated);
    return unsub;
  }, []);

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

