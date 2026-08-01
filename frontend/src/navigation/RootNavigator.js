import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { DarkTheme } from '../theme/colors';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import RecoveryKeyScreen from '../screens/auth/RecoveryKeyScreen';
import InAppNotification from '../components/InAppNotification';
import useAuthStore from '../store/useAuthStore';
import { navigationRef } from '../services/navigationService';

export default function RootNavigator() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const pendingRecoveryKey = useAuthStore(s => s.pendingRecoveryKey);
  const migrationPassword = useAuthStore(s => s.migrationPassword);
  const showRecovery = !!(pendingRecoveryKey || migrationPassword);

  return (
    <NavigationContainer theme={DarkTheme} ref={navigationRef}>
      {!isAuthenticated ? (
        <AuthNavigator />
      ) : showRecovery ? (
        <RecoveryKeyScreen route={{ params: { recoveryKey: pendingRecoveryKey, isMigration: !!migrationPassword, password: migrationPassword } }} />
      ) : (
        <MainNavigator />
      )}
      {isAuthenticated && !showRecovery && <InAppNotification />}
    </NavigationContainer>
  );
}
