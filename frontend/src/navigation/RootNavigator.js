import React from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { DarkTheme } from '../theme/colors';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import RecoveryKeyScreen from '../screens/auth/RecoveryKeyScreen';
import InAppNotification from '../components/InAppNotification';
import useAuthStore from '../store/useAuthStore';

export const navigationRef = createNavigationContainerRef();

const RootStack = createNativeStackNavigator();

export default function RootNavigator() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const pendingRecoveryKey = useAuthStore(s => s.pendingRecoveryKey);
  const migrationPassword = useAuthStore(s => s.migrationPassword);
  const showRecovery = !!(pendingRecoveryKey || migrationPassword);

  return (
    <NavigationContainer theme={DarkTheme} ref={navigationRef}>
      <RootStack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        {!isAuthenticated ? (
          <RootStack.Screen name="Auth" component={AuthNavigator} />
        ) : (
          <>
            <RootStack.Screen name="Main" component={MainNavigator} />
            {showRecovery && (
              <RootStack.Screen
                name="RecoveryKeyRoot"
                component={RecoveryKeyScreen}
                initialParams={{
                  recoveryKey: pendingRecoveryKey,
                  isMigration: !!migrationPassword,
                  password: migrationPassword,
                }}
              />
            )}
          </>
        )}
      </RootStack.Navigator>
      {isAuthenticated && !showRecovery && <InAppNotification />}
    </NavigationContainer>
  );
}
