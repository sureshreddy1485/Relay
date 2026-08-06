import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, ActivityIndicator } from 'react-native';
import { Colors } from '../../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useAlert } from '../../components/CustomAlert';
import api from '../../services/api';
import useAuthStore from '../../store/useAuthStore';

export default function RecoveryKeyScreen({ navigation, route }) {
  const { recoveryKey: initialKey, isMigration, password, pendingUser, pendingToken } = route.params || {};
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
      setLoading(true);
      const headers = pendingToken ? { Authorization: `Bearer ${pendingToken}` } : undefined;
      const { data } = await api.post('/auth/generate-recovery-key', { currentPassword: password }, { headers });
      if (data?.recoveryKey) {
        setKey(data.recoveryKey);
      } else {
        showAlert('Error', 'No key returned from server.');
      }
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'Failed to generate recovery key');
      if (navigation?.canGoBack && navigation.canGoBack()) {
        navigation.goBack();
      } else if (navigation?.navigate) {
        navigation.navigate('Tabs');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!key) {
      showAlert('Error', 'No recovery key available to copy');
      return;
    }
    await Clipboard.setStringAsync(key);
    showAlert('Success', 'Recovery key copied successfully to clipboard.');
  };

  const handleDownloadTxt = async () => {
    if (!key) {
      showAlert('Error', 'No recovery key available to download');
      return;
    }
    const fileContents = `===================================

Relay Recovery Key

Recovery Key:
${key}

Keep this key safe.
If you lose it and forget your password,
your account CANNOT be recovered.

Do not share this key with anyone.

Generated: ${new Date().toLocaleString()}
===================================`;

    const fileUri = `${FileSystem.documentDirectory}relay_recovery_codes.txt`;
    try {
      await FileSystem.writeAsStringAsync(fileUri, fileContents);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { dialogTitle: 'Save Recovery Key (.txt)', mimeType: 'text/plain', UTI: 'public.plain-text' });
      } else {
        showAlert('Success', `Saved recovery key to:\n${fileUri}`);
      }
    } catch (err) {
      console.error('Save recovery key error:', err);
      showAlert('Error', err.message || 'Failed to save recovery key file');
    }
  };

  const handleDownloadPdf = async () => {
    if (!key) {
      showAlert('Error', 'No recovery key available to export');
      return;
    }
    try {
      const dateStr = new Date().toLocaleString();
      const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<<
  /Type /Page
  /Parent 2 0 R
  /Resources << /Font << /F1 4 0 R >> >>
  /MediaBox [0 0 612 792]
  /Contents 5 0 R
>>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>
endobj
5 0 obj
<< /Length 340 >>
stream
BT
/F1 22 Tf
50 720 Td
(RELAY RECOVERY KEY) Tj
/F1 14 Tf
0 -40 Td
(Official Account Emergency Recovery Document) Tj
/F1 16 Tf
0 -40 Td
(Recovery Key:) Tj
/F1 18 Tf
0 -30 Td
(${key}) Tj
/F1 12 Tf
0 -60 Td
(Keep this key safe. If you lose it and forget your password,) Tj
0 -18 Td
(your account CANNOT be recovered.) Tj
0 -40 Td
(Generated: ${dateStr}) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000318 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
700
%%EOF`;

      const fileUri = `${FileSystem.documentDirectory}relay_recovery_codes.pdf`;
      await FileSystem.writeAsStringAsync(fileUri, pdfContent);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { dialogTitle: 'Save Recovery Key (.pdf)', mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
      } else {
        showAlert('Success', `Saved PDF to:\n${fileUri}`);
      }
    } catch (err) {
      console.error('Save PDF error:', err);
      showAlert('Error', err.message || 'Failed to save PDF file');
    }
  };

  const handleContinue = async () => {
    if (pendingUser && pendingToken) {
      const { completeAuth } = useAuthStore.getState();
      await completeAuth(pendingUser, pendingToken);
      try {
        const { connectSocket } = require('../../services/socketService');
        connectSocket(pendingUser._id);
      } catch (_) {}
    } else {
      if (navigation?.canGoBack && navigation.canGoBack()) {
        navigation.goBack();
      } else if (navigation?.navigate) {
        navigation.navigate('Tabs');
      }
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
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Recovery Key</Text>
          <Text style={styles.desc}>
            We've generated a unique recovery key for your account. Store it in a safe place.
          </Text>
          <Text style={styles.desc2}>
            You will need this key if you ever forget your password. This key will only be shown once.
          </Text>

          <View style={styles.keyBox}>
            <Text style={styles.keyText} selectable>{key || 'NO KEY GENERATED'}</Text>
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleCopy}>
              <Ionicons name="copy-outline" size={18} color="#FFF" />
              <Text style={styles.actionBtnText}>Copy Key</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtn} onPress={handleDownloadTxt}>
              <Ionicons name="document-text-outline" size={18} color="#FFF" />
              <Text style={styles.actionBtnText}>Save .txt</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtn} onPress={handleDownloadPdf}>
              <Ionicons name="document-outline" size={18} color="#FFF" />
              <Text style={styles.actionBtnText}>Save .pdf</Text>
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
    marginBottom: 20,
  },
  keyText: { color: Colors.primary, fontSize: 19, fontWeight: '700', letterSpacing: 1, textAlign: 'center' },
  buttonRow: { flexDirection: 'row', gap: 8, marginBottom: 28 },
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
    gap: 6,
  },
  actionBtnText: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  warningCard: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 28,
  },
  warningHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  warningTitle: { color: '#EF4444', fontSize: 16, fontWeight: '700' },
  warningText: { color: '#EF4444', fontSize: 14, lineHeight: 22 },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 28 },
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
