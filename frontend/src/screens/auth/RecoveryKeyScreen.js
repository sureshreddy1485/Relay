import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { Colors } from '../../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { useAlert } from '../../components/CustomAlert';
import api from '../../services/api';
import useAuthStore from '../../store/useAuthStore';

export default function RecoveryKeyScreen({ navigation, route }) {
  const { recoveryKeys: initialKeys, recoveryKey: initialKey, isMigration, password, pendingUser, pendingToken } = route.params || {};

  // Server always provides exactly 9 codes — use them directly
  const parseKeys = (keysArr, singleKey) => {
    if (Array.isArray(keysArr) && keysArr.length > 0) return keysArr.slice(0, 9);
    if (typeof singleKey === 'string' && singleKey.length > 0) return [singleKey];
    return [];
  };

  const [keys, setKeys] = useState(parseKeys(initialKeys, initialKey));
  const [hasConfirmed, setHasConfirmed] = useState(false);
  const [loading, setLoading] = useState(isMigration && keys.length === 0);
  const { showAlert } = useAlert();
  const currentUser = useAuthStore(s => s.user);

  useEffect(() => {
    if (isMigration && password) {
      generateKeysForMigration();
    }
  }, []);

  const generateKeysForMigration = async () => {
    try {
      setLoading(true);
      const headers = pendingToken ? { Authorization: `Bearer ${pendingToken}` } : undefined;
      const { data } = await api.post('/auth/generate-recovery-key', { currentPassword: password }, { headers });
      if (data?.recoveryKeys && Array.isArray(data.recoveryKeys)) {
        setKeys(parseKeys(data.recoveryKeys, data.recoveryKey));
      } else if (data?.recoveryKey) {
        setKeys(parseKeys([], data.recoveryKey));
      }
    } catch (e) {
      showAlert('Error', e.response?.data?.message || 'Failed to generate recovery keys');
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
      console.error('Save TXT error:', err);
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

      const codesHtml = keys.map((k, i) => `
        <div class="code-box">
          <span class="code-idx">${i + 1}.</span>${k}
        </div>
      `).join('');

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              background-color: #0B0E17;
              color: #FFFFFF;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              padding: 40px 30px;
              margin: 0;
            }
            .header {
              text-align: center;
              margin-bottom: 24px;
            }
            .title {
              color: #10B981;
              font-size: 26px;
              font-weight: 800;
              letter-spacing: 1px;
              margin: 0 0 6px 0;
              text-transform: uppercase;
            }
            .subtitle {
              color: #94A3B8;
              font-size: 14px;
              margin: 0;
            }
            .divider-green {
              border: none;
              height: 2px;
              background-color: #10B981;
              margin: 20px 0 28px 0;
            }
            .card {
              background-color: #131A26;
              border: 1px solid #1E293B;
              border-radius: 14px;
              padding: 24px;
              margin-bottom: 24px;
            }
            .info-line {
              font-size: 14px;
              color: #E2E8F0;
              margin-bottom: 10px;
              line-height: 1.5;
            }
            .info-line strong {
              color: #FFFFFF;
            }
            .notice {
              font-size: 13px;
              color: #94A3B8;
              margin-top: 14px;
              line-height: 1.6;
            }
            .codes-container {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 12px;
              margin-top: 24px;
            }
            .code-box {
              background-color: #0F172A;
              border: 1px solid #1E293B;
              border-radius: 10px;
              padding: 14px 16px;
              font-family: 'Courier New', Courier, monospace;
              font-size: 15px;
              font-weight: 700;
              color: #00E676;
              letter-spacing: 1.5px;
            }
            .code-idx {
              color: #64748B;
              margin-right: 8px;
              font-weight: 600;
            }
            .divider-dark {
              border: none;
              height: 1px;
              background-color: #1E293B;
              margin: 40px 0 20px 0;
            }
            .footer {
              text-align: center;
              color: #64748B;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 class="title">RELAY RECOVERY CODES</h1>
            <p class="subtitle">Official Account Security Backup</p>
          </div>

          <hr class="divider-green" />

          <div class="card">
            <div class="info-line"><strong>Account:</strong> ${userEmail}</div>
            <div class="info-line"><strong>Date Generated:</strong> ${dateStr}</div>
            <div class="notice">
              <strong>Notice:</strong> Keep these ${keys.length} one-time recovery codes confidential. Each code can be used exactly once to regain access if you lose your password.
            </div>

            <div class="codes-container">
              ${codesHtml}
            </div>
          </div>

          <hr class="divider-dark" />

          <div class="footer">
            Relay Messaging App &bull; End-to-End Account Protection
          </div>
        </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      const targetPdfUri = `${FileSystem.documentDirectory}relay_recovery_codes.pdf`;

      try {
        await FileSystem.deleteAsync(targetPdfUri, { idempotent: true });
      } catch (_) { }

      await FileSystem.copyAsync({ from: uri, to: targetPdfUri });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(targetPdfUri, { dialogTitle: 'Save Recovery Codes (.pdf)', mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
      } else {
        showAlert('Success', `Saved PDF to:\n${targetPdfUri}`);
      }
    } catch (err) {
      console.error('Save PDF error:', err);
      showAlert('Error', err.message || 'Failed to generate PDF file');
    }
  };

  const [continuing, setContinuing] = useState(false);
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated && continuing) {
      setContinuing(false);
    }
  }, [isAuthenticated]); // Do NOT add 'continuing' to deps, otherwise it immediately resets on click

  const handleContinue = async () => {
    if (continuing) return;
    // completeAuth sets isAuthenticated=true in Zustand → RootNavigator swaps
    // AuthNavigator for MainNavigator, unmounting this screen automatically.
    // App.js handles connectSocket reactively when isAuthenticated becomes true.
    if (pendingUser && pendingToken) {
      setContinuing(true);
      try {
        await useAuthStore.getState().completeAuth(pendingUser, pendingToken);
        // Component is now unmounted — return immediately.
        return;
      } catch (err) {
        setContinuing(false);
        console.error('completeAuth failed:', err);
        showAlert('Error', err?.message || 'Failed to complete sign-up. Please try again.');
      }
      return;
    }
    // If no pending credentials (e.g., opened from Settings), just go back.
    if (navigation?.canGoBack && navigation.canGoBack()) {
      navigation.goBack();
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
            style={[styles.continueBtn, (!hasConfirmed || continuing) && styles.continueBtnDisabled]}
            disabled={!hasConfirmed || continuing}
            onPress={handleContinue}
          >
            {continuing
              ? <ActivityIndicator size="small" color="#FFF" />
              : <Text style={styles.continueBtnText}>Continue</Text>}
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
