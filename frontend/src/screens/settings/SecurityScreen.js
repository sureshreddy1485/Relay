import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ScrollView, ActivityIndicator, Modal, Alert, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { Colors } from '../../theme/colors';
import api from '../../services/api';
import { useAlert } from '../../components/CustomAlert';
import useAuthStore from '../../store/useAuthStore';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDate = (iso) => {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const daysUntil = (iso) => {
  if (!iso) return 0;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
};

// ─── New Codes Display ───────────────────────────────────────────────────────

function NewCodesModal({ codes, onClose }) {
  const { showAlert } = useAlert();
  const currentUser = useAuthStore(s => s.user);

  const handleCopyAll = async () => {
    const text = codes.map((k, i) => `${i + 1}. ${k}`).join('\n');
    await Clipboard.setStringAsync(text);
    showAlert('Copied', '9 recovery codes copied to clipboard.');
  };

  const handleDownloadTxt = async () => {
    const account = currentUser?.email || currentUser?.username || 'relay_user';
    const dateStr = new Date().toLocaleString();
    const list = codes.map((k, i) => `Code ${i + 1}: ${k}`).join('\n');
    const content = `=====================================================
RELAY RECOVERY CODES
Official Account Security Backup
=====================================================

Account: ${account}
Date Generated: ${dateStr}

Notice: Keep these 9 one-time recovery codes confidential.
Each code can be used exactly once to regain access if you lose your password.

-----------------------------------------------------
YOUR RECOVERY CODES:
${list}
-----------------------------------------------------

Relay Messaging App • End-to-End Account Protection
=====================================================`;
    try {
      const uri = `${FileSystem.documentDirectory}relay_recovery_codes.txt`;
      await FileSystem.writeAsStringAsync(uri, content);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { dialogTitle: 'Save Recovery Codes (.txt)', mimeType: 'text/plain' });
      } else {
        showAlert('Saved', `Recovery codes saved to:\n${uri}`);
      }
    } catch (err) {
      showAlert('Error', err.message || 'Failed to save file');
    }
  };

  const handlePrintPdf = async () => {
    const account = currentUser?.email || currentUser?.username || 'relay_user';
    const dateStr = new Date().toLocaleString();
    const codesHtml = codes.map((k, i) => `
      <div class="code-box">
        <span class="code-idx">${i + 1}.</span>${k}
      </div>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body { background:#0B0E17; color:#FFF; font-family:sans-serif; padding:40px 30px; margin:0; }
      .title { color:#10B981; font-size:26px; font-weight:800; text-align:center; text-transform:uppercase; }
      .subtitle { color:#94A3B8; font-size:14px; text-align:center; margin-bottom:20px; }
      hr { border:none; height:2px; background:#10B981; margin:20px 0; }
      .card { background:#131A26; border:1px solid #1E293B; border-radius:14px; padding:24px; margin-bottom:24px; }
      .info { font-size:14px; color:#E2E8F0; margin-bottom:8px; }
      .notice { font-size:13px; color:#94A3B8; margin-top:12px; }
      .grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:20px; }
      .code-box { background:#0F172A; border:1px solid #1E293B; border-radius:10px; padding:14px 16px; font-family:monospace; font-size:15px; font-weight:700; color:#00E676; letter-spacing:1.5px; }
      .code-idx { color:#64748B; margin-right:8px; }
      .footer { text-align:center; color:#64748B; font-size:12px; margin-top:30px; }
    </style></head><body>
      <div class="title">RELAY RECOVERY CODES</div>
      <div class="subtitle">Official Account Security Backup</div>
      <hr/>
      <div class="card">
        <div class="info"><strong>Account:</strong> ${account}</div>
        <div class="info"><strong>Date Generated:</strong> ${dateStr}</div>
        <div class="notice"><strong>Notice:</strong> Keep these 9 one-time recovery codes confidential. Each code can be used exactly once.</div>
        <div class="grid">${codesHtml}</div>
      </div>
      <div class="footer">Relay Messaging App • End-to-End Account Protection</div>
    </body></html>`;

    try {
      const { uri } = await Print.printToFileAsync({ html });
      const target = `${FileSystem.documentDirectory}relay_recovery_codes.pdf`;
      await FileSystem.deleteAsync(target, { idempotent: true });
      await FileSystem.copyAsync({ from: uri, to: target });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(target, { dialogTitle: 'Save Recovery Codes (.pdf)', mimeType: 'application/pdf' });
      } else {
        showAlert('Saved', `PDF saved to:\n${target}`);
      }
    } catch (err) {
      showAlert('Error', err.message || 'Failed to generate PDF');
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.newCodesContainer}>
        <ScrollView contentContainerStyle={styles.newCodesScroll} showsVerticalScrollIndicator={false}>
          {/* Warning banner */}
          <View style={styles.newCodesBanner}>
            <Ionicons name="warning" size={22} color="#EF4444" />
            <Text style={styles.newCodesBannerText}>
              These codes will only be shown once. Save them somewhere secure.
            </Text>
          </View>

          <Text style={styles.newCodesTitle}>Your New Recovery Codes</Text>
          <Text style={styles.newCodesSub}>
            9 new single-use codes have been generated. Your previous codes have been permanently invalidated.
          </Text>

          <View style={styles.codesGrid}>
            {codes.map((k, i) => (
              <View key={i} style={styles.codeBadge}>
                <Text style={styles.codeBadgeIdx}>{i + 1}.</Text>
                <Text style={styles.codeBadgeText} selectable>{k}</Text>
              </View>
            ))}
          </View>

          {/* Action buttons */}
          <View style={styles.codeActions}>
            <TouchableOpacity style={styles.codeActionBtn} onPress={handleCopyAll}>
              <Ionicons name="copy-outline" size={18} color="#FFF" />
              <Text style={styles.codeActionText}>Copy All</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.codeActionBtn} onPress={handleDownloadTxt}>
              <Ionicons name="document-text-outline" size={18} color="#FFF" />
              <Text style={styles.codeActionText}>Download</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.codeActionBtn} onPress={handlePrintPdf}>
              <Ionicons name="print-outline" size={18} color="#FFF" />
              <Text style={styles.codeActionText}>Print PDF</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
            <Text style={styles.doneBtnText}>I've saved my codes — Done</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Main SecurityScreen ──────────────────────────────────────────────────────

export default function SecurityScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { showAlert } = useAlert();

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [newCodes, setNewCodes] = useState(null);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/auth/security-status');
      setStatus(data);
    } catch (err) {
      showAlert('Error', err.response?.data?.message || 'Failed to load security status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleRegenerate = async () => {
    if (!password.trim()) {
      showAlert('Required', 'Please enter your current password to confirm.');
      return;
    }
    try {
      setRegenerating(true);
      const { data } = await api.post('/auth/generate-recovery-key', {
        currentPassword: password,
      });
      setConfirmVisible(false);
      setPassword('');
      setNewCodes(data.recoveryKeys);
      await fetchStatus();
    } catch (err) {
      showAlert('Error', err.response?.data?.message || 'Failed to generate new codes');
    } finally {
      setRegenerating(false);
    }
  };

  // ── Derived display values ─────────────────────────────────────────────────

  const remaining = status?.recoveryCodesRemaining ?? 0;
  const total = status?.recoveryCodesTotal ?? 9;
  const used = total - remaining;
  const canRegen = status?.canRegenerate ?? false;
  const daysLeft = status?.regenerationAvailableAt ? daysUntil(status.regenerationAvailableAt) : 0;
  const actionsUsed = status?.securityActionsUsed ?? 0;
  const actionsRemaining = status?.securityActionsRemaining ?? 5;
  const actionsLimit = status?.securityActionsLimit ?? 5;
  const resetAt = status?.securityActionsResetAt ? formatDate(status.securityActionsResetAt) : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: Colors.dark.bg }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: (insets.top || 0) + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Security</Text>
        <TouchableOpacity onPress={fetchStatus} style={{ padding: 4 }}>
          <Ionicons name="refresh-outline" size={22} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading security status…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* ── Recovery Codes Card ──────────────────────────────────────── */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.cardIconWrap, { backgroundColor: '#10B98120' }]}>
                <Ionicons name="shield-checkmark-outline" size={22} color="#10B981" />
              </View>
              <Text style={styles.cardTitle}>Recovery Codes</Text>
            </View>

            {/* Count display */}
            <View style={styles.countRow}>
              <Text style={styles.countBig}>{remaining}</Text>
              <Text style={styles.countOf}>of {total} remaining</Text>
            </View>
            <Text style={styles.countSub}>
              {used} code{used !== 1 ? 's' : ''} used · {remaining} remaining
            </Text>

            {/* Progress bar */}
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${(remaining / total) * 100}%`, backgroundColor: remaining <= 2 ? '#EF4444' : '#10B981' },
                ]}
              />
            </View>

            {/* Regeneration status */}
            <View style={[styles.regenStatus, canRegen ? styles.regenAvailable : styles.regenLocked]}>
              <Ionicons
                name={canRegen ? 'checkmark-circle-outline' : 'time-outline'}
                size={16}
                color={canRegen ? '#10B981' : Colors.dark.muted}
              />
              <Text style={[styles.regenStatusText, canRegen ? { color: '#10B981' } : {}]}>
                {remaining === 0
                  ? 'All recovery codes have been used. You can generate a new set now.'
                  : canRegen
                    ? 'Your recovery-code set is eligible for replacement.'
                    : `New recovery codes available in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`}
              </Text>
            </View>

            {/* Generate button */}
            <TouchableOpacity
              style={[styles.regenBtn, !canRegen && styles.regenBtnDisabled]}
              disabled={!canRegen}
              onPress={() => setConfirmVisible(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="key-outline" size={18} color={canRegen ? '#000' : Colors.dark.muted} />
              <Text style={[styles.regenBtnText, !canRegen && { color: Colors.dark.muted }]}>
                Generate new recovery codes
              </Text>
            </TouchableOpacity>

            {!canRegen && (
              <Text style={styles.regenNote}>
                Regeneration is available when all 9 codes are used or the set is 30+ days old.
              </Text>
            )}
          </View>

          {/* ── Security Actions Card ────────────────────────────────────── */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.cardIconWrap, { backgroundColor: Colors.primary + '20' }]}>
                <Ionicons name="lock-closed-outline" size={22} color={Colors.primary} />
              </View>
              <Text style={styles.cardTitle}>Security Changes</Text>
            </View>

            <View style={styles.countRow}>
              <Text style={[styles.countBig, actionsRemaining === 0 && { color: '#EF4444' }]}>
                {actionsRemaining}
              </Text>
              <Text style={styles.countOf}>of {actionsLimit} remaining</Text>
            </View>

            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${(actionsRemaining / actionsLimit) * 100}%`,
                    backgroundColor: actionsRemaining === 0 ? '#EF4444' : actionsRemaining <= 1 ? '#F59E0B' : Colors.primary,
                  },
                ]}
              />
            </View>

            {actionsRemaining === 0 ? (
              <View style={[styles.regenStatus, styles.regenLocked, { borderColor: '#EF444440' }]}>
                <Ionicons name="ban-outline" size={16} color="#EF4444" />
                <Text style={[styles.regenStatusText, { color: '#EF4444' }]}>
                  You've reached your security-change limit. Please try again after the 30-day window resets.
                </Text>
              </View>
            ) : (
              <View style={[styles.regenStatus, styles.regenLocked]}>
                <Ionicons name="information-circle-outline" size={16} color={Colors.dark.muted} />
                <Text style={styles.regenStatusText}>
                  {actionsUsed === 0
                    ? 'No security changes made in the last 30 days.'
                    : resetAt
                      ? `Limit resets as early as ${resetAt}.`
                      : 'Limit resets on a rolling 30-day basis.'}
                </Text>
              </View>
            )}

            {/* What counts */}
            <Text style={styles.actionsLabel}>The following count toward your limit:</Text>
            {['Password changes', 'Password resets using recovery codes', 'Recovery-code regeneration'].map(item => (
              <View key={item} style={styles.bulletRow}>
                <Ionicons name="ellipse" size={6} color={Colors.dark.muted} style={{ marginTop: 5 }} />
                <Text style={styles.bulletText}>{item}</Text>
              </View>
            ))}
          </View>

          {/* ── Password Change Shortcut ─────────────────────────────────── */}
          <TouchableOpacity
            style={styles.shortcutRow}
            onPress={() => navigation.navigate('ChangePassword')}
            activeOpacity={0.8}
          >
            <View style={[styles.cardIconWrap, { backgroundColor: '#6366F120', marginRight: 14 }]}>
              <Ionicons name="lock-open-outline" size={20} color="#6366F1" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.shortcutTitle}>Change Password</Text>
              <Text style={styles.shortcutSub}>
                {actionsRemaining > 0 ? `${actionsRemaining} change${actionsRemaining !== 1 ? 's' : ''} remaining` : 'Limit reached'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.dark.muted} />
          </TouchableOpacity>

        </ScrollView>
      )}

      {/* ── Regeneration confirmation modal ─────────────────────────────── */}
      <Modal visible={confirmVisible} transparent animationType="fade" onRequestClose={() => setConfirmVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={[styles.cardIconWrap, { backgroundColor: '#EF444420', width: 56, height: 56, borderRadius: 28, alignSelf: 'center', marginBottom: 16 }]}>
              <Ionicons name="warning-outline" size={28} color="#EF4444" />
            </View>
            <Text style={styles.modalTitle}>Generate New Recovery Codes?</Text>
            <Text style={styles.modalBody}>
              This will immediately invalidate all of your existing recovery codes and create 9 new codes.{'\n\n'}
              Make sure you save the new codes securely.
            </Text>

            {/* Password confirmation */}
            <Text style={styles.modalLabel}>Enter your password to confirm:</Text>
            <View style={styles.modalInputWrap}>
              <Ionicons name="lock-closed-outline" size={18} color={Colors.dark.muted} />
              <TextInput
                style={styles.modalInput}
                value={password}
                onChangeText={setPassword}
                placeholder="Current password"
                placeholderTextColor={Colors.dark.muted}
                secureTextEntry={!passwordVisible}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setPasswordVisible(v => !v)}>
                <Ionicons name={passwordVisible ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.dark.muted} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalCancelBtn]}
                onPress={() => { setConfirmVisible(false); setPassword(''); }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalConfirmBtn]}
                onPress={handleRegenerate}
                disabled={regenerating}
              >
                {regenerating
                  ? <ActivityIndicator size="small" color="#000" />
                  : <Text style={styles.modalConfirmText}>Generate new codes</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── New codes display (shown once after generation) ──────────────── */}
      {newCodes && (
        <NewCodesModal
          codes={newCodes}
          onClose={() => setNewCodes(null)}
        />
      )}
    </View>
  );
}

// ─── Need TextInput import ────────────────────────────────────────────────────
import { TextInput } from 'react-native';

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: Colors.dark.card,
    borderBottomWidth: 1, borderBottomColor: Colors.dark.border,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.dark.text },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: Colors.dark.muted, fontSize: 15 },
  scroll: { padding: 16, paddingBottom: 40 },

  // Card
  card: {
    backgroundColor: Colors.dark.card,
    borderRadius: 18, borderWidth: 1, borderColor: Colors.dark.border,
    padding: 20, marginBottom: 16,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  cardIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { fontSize: 17, fontWeight: '700', color: Colors.dark.text },

  // Count
  countRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 4 },
  countBig: { fontSize: 40, fontWeight: '900', color: '#10B981' },
  countOf: { fontSize: 16, color: Colors.dark.muted, fontWeight: '600' },
  countSub: { fontSize: 13, color: Colors.dark.muted, marginBottom: 14 },

  // Progress bar
  progressTrack: {
    height: 6, backgroundColor: Colors.dark.border, borderRadius: 3, marginBottom: 16, overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3 },

  // Regen status chip
  regenStatus: {
    flexDirection: 'row', gap: 8, borderRadius: 12, padding: 12,
    borderWidth: 1, marginBottom: 14, alignItems: 'flex-start',
  },
  regenAvailable: { backgroundColor: '#10B98115', borderColor: '#10B98140' },
  regenLocked: { backgroundColor: Colors.dark.bg, borderColor: Colors.dark.border },
  regenStatusText: { flex: 1, color: Colors.dark.muted, fontSize: 13, lineHeight: 19 },

  // Regen button
  regenBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: '#10B981', borderRadius: 14, paddingVertical: 14,
  },
  regenBtnDisabled: { backgroundColor: Colors.dark.border },
  regenBtnText: { color: '#000', fontWeight: '700', fontSize: 15 },
  regenNote: { color: Colors.dark.muted, fontSize: 12, textAlign: 'center', marginTop: 10, lineHeight: 17 },

  // Security actions
  actionsLabel: { fontSize: 13, fontWeight: '600', color: Colors.dark.textSecondary, marginBottom: 8, marginTop: 4 },
  bulletRow: { flexDirection: 'row', gap: 8, marginBottom: 5, alignItems: 'flex-start' },
  bulletText: { flex: 1, color: Colors.dark.muted, fontSize: 13, lineHeight: 19 },

  // Shortcut row
  shortcutRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.dark.card, borderRadius: 18,
    borderWidth: 1, borderColor: Colors.dark.border,
    padding: 16, marginBottom: 16,
  },
  shortcutTitle: { fontSize: 15, fontWeight: '600', color: Colors.dark.text, marginBottom: 2 },
  shortcutSub: { fontSize: 13, color: Colors.dark.muted },

  // Confirmation modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalCard: {
    width: '100%', backgroundColor: Colors.dark.card,
    borderRadius: 22, padding: 24,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  modalTitle: { fontSize: 19, fontWeight: '800', color: '#FFF', textAlign: 'center', marginBottom: 12 },
  modalBody: { color: Colors.dark.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 20 },
  modalLabel: { color: Colors.dark.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 8 },
  modalInputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.dark.input, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.dark.border,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 20,
  },
  modalInput: { flex: 1, color: Colors.dark.text, fontSize: 15 },
  modalBtns: { flexDirection: 'row', gap: 12 },
  modalBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  modalCancelBtn: { backgroundColor: Colors.dark.border },
  modalCancelText: { color: Colors.dark.text, fontWeight: '600', fontSize: 15 },
  modalConfirmBtn: { backgroundColor: '#EF4444' },
  modalConfirmText: { color: '#FFF', fontWeight: '700', fontSize: 15 },

  // New codes display modal
  newCodesContainer: { flex: 1, backgroundColor: Colors.dark.bg },
  newCodesScroll: { padding: 24, paddingBottom: 48 },
  newCodesBanner: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: '#EF444415', borderWidth: 1, borderColor: '#EF444440',
    borderRadius: 14, padding: 14, marginBottom: 24,
  },
  newCodesBannerText: { flex: 1, color: '#EF4444', fontSize: 14, lineHeight: 20 },
  newCodesTitle: { fontSize: 24, fontWeight: '800', color: '#FFF', marginBottom: 8 },
  newCodesSub: { color: Colors.dark.muted, fontSize: 14, lineHeight: 21, marginBottom: 24 },
  codesGrid: { gap: 10, marginBottom: 24 },
  codeBadge: {
    backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#1E293B',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  codeBadgeIdx: { color: Colors.dark.muted, fontSize: 14, fontWeight: '700', width: 24 },
  codeBadgeText: {
    color: '#00E676', fontSize: 16, fontWeight: '800',
    letterSpacing: 1.5, flex: 1,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  codeActions: { flexDirection: 'row', gap: 8, marginBottom: 28 },
  codeActionBtn: {
    flex: 1, backgroundColor: Colors.dark.card,
    borderWidth: 1, borderColor: Colors.dark.border, borderRadius: 12,
    paddingVertical: 14, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6,
  },
  codeActionText: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  doneBtn: {
    backgroundColor: '#10B981', borderRadius: 14, paddingVertical: 16, alignItems: 'center',
  },
  doneBtnText: { color: '#000', fontSize: 16, fontWeight: '700' },
});
