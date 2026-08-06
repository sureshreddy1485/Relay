import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { Colors } from '../../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useAlert } from '../../components/CustomAlert';
import api from '../../services/api';
import useAuthStore from '../../store/useAuthStore';

export default function RecoveryKeyScreen({ navigation, route }) {
  const { recoveryKeys: initialKeys, recoveryKey: initialKey, isMigration, password, pendingUser, pendingToken } = route.params || {};
  
  // Ensure we have an array of 9 keys
  const parseKeys = (keys, single) => {
    if (Array.isArray(keys) && keys.length > 0) return keys;
    if (typeof single === 'string' && single.length > 0) return [single];
    return [];
  };

  const [keys, setKeys] = useState(parseKeys(initialKeys, initialKey));
  const [hasConfirmed, setHasConfirmed] = useState(false);
  const [loading, setLoading] = useState(isMigration && keys.length === 0);
  const { showAlert } = useAlert();
  const currentUser = useAuthStore(s => s.user);

  useEffect(() => {
    if (isMigration && keys.length === 0 && password) {
      generateKeysForMigration();
    }
  }, []);

  const generateKeysForMigration = async () => {
    try {
      setLoading(true);
      const headers = pendingToken ? { Authorization: `Bearer ${pendingToken}` } : undefined;
      const { data } = await api.post('/auth/generate-recovery-key', { currentPassword: password }, { headers });
      if (data?.recoveryKeys && Array.isArray(data.recoveryKeys)) {
        setKeys(data.recoveryKeys);
      } else if (data?.recoveryKey) {
        setKeys([data.recoveryKey]);
      } else {
        showAlert('Error', 'No recovery keys returned from server.');
      }
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'Failed to generate recovery keys');
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
    if (!keys || keys.length === 0) {
      showAlert('Error', 'No recovery keys available to copy');
      return;
    }
    const formattedText = keys.map((k, i) => `${i + 1}. ${k}`).join('\n');
    await Clipboard.setStringAsync(formattedText);
    showAlert('Success', `${keys.length} Recovery Codes copied to clipboard.`);
  };

  const handleDownloadTxt = async () => {
    if (!keys || keys.length === 0) {
      showAlert('Error', 'No recovery keys available to download');
      return;
    }
    const accountName = currentUser?.email || pendingUser?.email || currentUser?.username || pendingUser?.username || 'Relay User';
    const dateStr = new Date().toLocaleString();

    const formattedList = keys.map((k, i) => `Code ${i + 1}: ${k}`).join('\n');

    const fileContents = `=====================================================
RELAY RECOVERY CODES
Official Account Security Backup
=====================================================

Account: ${accountName}
Date Generated: ${dateStr}

Notice: Keep these ${keys.length} one-time recovery codes confidential.
Each code can be used exactly once to regain access if you lose your password.

-----------------------------------------------------
YOUR RECOVERY CODES:
${formattedList}
-----------------------------------------------------

Relay Messaging App • End-to-End Account Protection
=====================================================`;

    const fileUri = `${FileSystem.documentDirectory}relay_recovery_codes.txt`;
    try {
      await FileSystem.writeAsStringAsync(fileUri, fileContents);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { dialogTitle: 'Save Recovery Codes (.txt)', mimeType: 'text/plain', UTI: 'public.plain-text' });
      } else {
        showAlert('Success', `Saved recovery codes to:\n${fileUri}`);
      }
    } catch (err) {
      console.error('Save recovery codes error:', err);
      showAlert('Error', err.message || 'Failed to save TXT file');
    }
  };

  const handleDownloadPdf = async () => {
    if (!keys || keys.length === 0) {
      showAlert('Error', 'No recovery codes available to export');
      return;
    }
    try {
      const userEmail = currentUser?.email || pendingUser?.email || currentUser?.username || pendingUser?.username || 'relay_user@relay.app';
      const dateStr = new Date().toLocaleString();

      // Escape parentheses in text for PDF stream
      const cleanEmail = userEmail.replace(/\(/g, '\\(').replace(/\)/g, '\\)');
      const cleanDate = dateStr.replace(/\(/g, '\\(').replace(/\)/g, '\\)');

      // Format codes into PDF stream text positioning
      const codesStream = keys.map((c, i) => `(${i + 1}. ${c}) Tj\n0 -22 Td`).join('\n');

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
  /Resources << /Font << /F1 4 0 R /F2 6 0 R >> >>
  /MediaBox [0 0 612 792]
  /Contents 5 0 R
>>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>
endobj
6 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>
endobj
5 0 obj
<< /Length 850 >>
stream
q
0 0 612 792 re
0.04 0.05 0.09 rg fill
Q
BT
/F1 22 Tf
0 0.9 0.45 rg
170 725 Td
(RELAY RECOVERY CODES) Tj
/F1 12 Tf
0.58 0.64 0.72 rg
-25 -22 Td
(Official Account Security Backup) Tj
ET
q
0 0.9 0.45 RG
2 setlinewidth
40 665 m 572 665 l S
Q
q
0.07 0.1 0.15 rg
0.12 0.16 0.23 RG
1 setlinewidth
40 535 532 110 re f s
Q
BT
/F1 12 Tf
1 1 1 rg
56 618 Td
(Account: ${cleanEmail}) Tj
0 -20 Td
(Date Generated: ${cleanDate}) Tj
0 -20 Td
(Notice: Keep these ${keys.length} one-time recovery codes confidential. Each code can be used) Tj
0 -16 Td
(exactly once to regain access if you lose your password.) Tj
ET
q
0 0.9 0.45 RG
2 setlinewidth
40 505 m 572 505 l S
Q
BT
/F2 15 Tf
0 0.9 0.45 rg
60 465 Td
${codesStream}
ET
q
0.12 0.16 0.23 RG
1 setlinewidth
40 90 m 572 90 l S
Q
BT
/F1 11 Tf
0.39 0.45 0.55 rg
135 68 Td
(Relay Messaging App . End-to-End Account Protection) Tj
ET
endstream
endobj
xref
0 7
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000256 00000 n 
0000000395 00000 n 
0000000330 00000 n 
trailer
<< /Size 7 /Root 1 0 R >>
startxref
1250
%%EOF`;

      const fileUri = `${FileSystem.documentDirectory}relay_recovery_codes.pdf`;
      await FileSystem.writeAsStringAsync(fileUri, pdfContent);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { dialogTitle: 'Save Recovery Codes (.pdf)', mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
      } else {
        showAlert('Success', `Saved PDF to:\n${fileUri}`);
      }
    } catch (err) {
      console.error('Save PDF error:', err);
      showAlert('Error', err.message || 'Failed to save PDF file');
    }
  };

  const handleContinue = async () => {
    try {
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
    } catch (err) {
      console.error('handleContinue error:', err);
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
          <Text style={styles.loadingText}>Generating 9 secure Recovery Codes...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Recovery Codes</Text>
          <Text style={styles.desc}>
            We've generated 9 one-time recovery codes for your account. Store them in a safe place.
          </Text>
          <Text style={styles.desc2}>
            Each code can be used ONCE if you ever forget your password. These codes will only be shown once.
          </Text>

          <View style={styles.keysGrid}>
            {keys.map((k, i) => (
              <View key={i} style={styles.keyBadge}>
                <Text style={styles.keyBadgeIndex}>{i + 1}.</Text>
                <Text style={styles.keyBadgeText} selectable>{k}</Text>
              </View>
            ))}
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleCopy}>
              <Ionicons name="copy-outline" size={18} color="#FFF" />
              <Text style={styles.actionBtnText}>Copy Keys</Text>
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
              If you lose these recovery codes, there is NO way to recover your account.
              For your privacy and security, we do not store or display these codes again.
              Please save them before continuing.
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
              I understand that if I lose these recovery codes, my account cannot be recovered.
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
  keysGrid: {
    gap: 10,
    marginBottom: 20,
  },
  keyBadge: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  keyBadgeIndex: { color: Colors.dark.muted, fontSize: 14, fontWeight: '700', width: 24 },
  keyBadgeText: { color: '#00E676', fontSize: 16, fontWeight: '800', letterSpacing: 1.5, flex: 1, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
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
