import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, SafeAreaView, ScrollView, ActivityIndicator } from 'react-native';
import { Colors } from '../../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useAlert } from '../../components/CustomAlert';
import api from '../../services/api';
import useAuthStore from '../../store/useAuthStore';

export default function RecoveryKeyScreen({ navigation, route }) {
  const { recoveryKey: initialKey, isMigration, password } = route.params || {};
  const [key, setKey] = useState(initialKey || '');
  const [hasConfirmed, setHasConfirmed] = useState(false);
  const [loading, setLoading] = useState(isMigration && !initialKey);
  const { showAlert } = useAlert();

  useEffect(() => {
    if (isMigration && !initialKey && password) {
      generateKeyForMigration();
    }
  }, []);

  const generateKeyForMigration = async () => {
    try {
      const { data } = await api.post('/auth/generate-recovery-key', { currentPassword: password });
      setKey(data.recoveryKey);
    } catch (e) {
      useAuthStore.getState().clearPendingRecovery();
      showAlert('Error', e.response?.data?.message || 'Failed to generate recovery key');
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.replace('Tabs');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(key);
    showAlert('Success', 'Recovery key copied successfully.');
  };

  const handleDownload = async () => {
    const fileContents = `===================================

Relay Recovery Key

Recovery Key

${key}

Keep this key safe.

If you lose it and forget your password,
your account CANNOT be recovered.

Do not share this key with anyone.

===================================`;

    const fileUri = `${FileSystem.documentDirectory}relay-recovery-key.txt`;
    try {
      await FileSystem.writeAsStringAsync(fileUri, fileContents, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { dialogTitle: 'Save Recovery Key' });
      } else {
        showAlert('Error', 'Sharing is not available on this device');
      }
    } catch (err) {
      showAlert('Error', 'Failed to save recovery key file');
    }
  };

  const handleContinue = () => {
    useAuthStore.getState().clearPendingRecovery();
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.replace('Tabs'); // or wherever MainNavigator roots to
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Generating your secure Recovery Key...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.title}>Recovery Key</Text>
          <Text style={styles.desc}>
            We've generated a unique recovery key for your account. Store it in a safe place.
          </Text>
          <Text style={styles.desc2}>
            You will need this key if you ever forget your password. This key will only be shown once.
          </Text>

          <View style={styles.keyBox}>
            <Text style={styles.keyText}>{key}</Text>
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleCopy}>
              <Ionicons name="copy-outline" size={20} color="#FFF" />
              <Text style={styles.actionBtnText}>Copy Key</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtn} onPress={handleDownload}>
              <Ionicons name="download-outline" size={20} color="#FFF" />
              <Text style={styles.actionBtnText}>Download (.txt)</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.warningCard}>
            <View style={styles.warningHeader}>
              <Ionicons name="warning" size={20} color="#EF4444" />
              <Text style={styles.warningTitle}>IMPORTANT</Text>
            </View>
            <Text style={styles.warningText}>
              If you lose this recovery key, there is NO way to recover your account.
              For your privacy and security, we do not store or display this key again.
              Please save it before continuing.
            </Text>
          </View>

          <TouchableOpacity 
            style={styles.checkboxRow} 
            activeOpacity={0.8}
            onPress={() => setHasConfirmed(!hasConfirmed)}
          >
            <View style={[styles.checkbox, hasConfirmed && styles.checkboxActive]}>
              {hasConfirmed && <Ionicons name="checkmark" size={16} color="#FFF" />}
            </View>
            <Text style={styles.checkboxText}>
              I understand that if I lose this recovery key, my account cannot be recovered.
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.continueBtn, !hasConfirmed && styles.continueBtnDisabled]}
            disabled={!hasConfirmed}
            onPress={handleContinue}
          >
            <Text style={styles.continueBtnText}>Continue</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: Colors.dark.muted, marginTop: 12, fontSize: 16 },
  scroll: { padding: 24, paddingBottom: 60, flexGrow: 1 },
  title: { fontSize: 28, fontWeight: '800', color: '#FFF', marginBottom: 16 },
  desc: { fontSize: 15, color: Colors.dark.textSecondary, marginBottom: 8, lineHeight: 22 },
  desc2: { fontSize: 15, color: Colors.dark.textSecondary, marginBottom: 24, lineHeight: 22, fontWeight: '600' },
  keyBox: {
    backgroundColor: Colors.dark.input,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  keyText: { color: Colors.primary, fontSize: 20, fontWeight: '700', letterSpacing: 1 },
  buttonRow: { flexDirection: 'row', gap: 12, marginBottom: 32 },
  actionBtn: {
    flex: 1,
    backgroundColor: Colors.dark.card,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionBtnText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  warningCard: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 32,
  },
  warningHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  warningTitle: { color: '#EF4444', fontSize: 16, fontWeight: '700' },
  warningText: { color: '#EF4444', fontSize: 14, lineHeight: 22 },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 32 },
  checkbox: {
    width: 24, height: 24, borderRadius: 6,
    borderWidth: 2, borderColor: Colors.dark.muted,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  checkboxActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  checkboxText: { flex: 1, color: Colors.dark.text, fontSize: 15, lineHeight: 22 },
  continueBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  continueBtnDisabled: { opacity: 0.5 },
  continueBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
