import React, { useState, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, StatusBar, Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';
import api from '../../services/api';
import useAuthStore from '../../store/useAuthStore';

export default function ChangePasswordScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const user = useAuthStore(state => state.user);
  
  // Mode selection: null (show prompt modal), 'remembered' (normal pass change), 'forgot' (recovery code reset)
  const [mode, setMode] = useState('remembered');
  const [promptModalVisible, setPromptModalVisible] = useState(true);
  const [securityStatus, setSecurityStatus] = useState(null);

  useEffect(() => {
    api.get('/auth/security-status')
      .then(({ data }) => setSecurityStatus(data))
      .catch(() => {});
  }, []);

  // Form states
  const [form, setForm] = useState({
    currentPassword: '',
    recoveryKey: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [show, setShow] = useState({ curr: false, rec: false, new: false });
  const [isLoading, setIsLoading] = useState(false);

  const update = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const toggleShow = (key) => setShow(s => ({ ...s, [key]: !s[key] }));

  const handleChangePassword = async () => {
    if (mode === 'remembered') {
      if (!form.currentPassword || !form.newPassword || !form.confirmPassword) {
        Alert.alert('Error', 'All fields are required');
        return;
      }
      if (form.newPassword !== form.confirmPassword) {
        Alert.alert('Error', 'New passwords do not match');
        return;
      }
      if (form.newPassword.length < 6) {
        Alert.alert('Error', 'New password must be at least 6 characters');
        return;
      }

      setIsLoading(true);
      try {
        await api.put('/auth/change-password', {
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        });
        Alert.alert('Success', 'Password changed successfully!', [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      } catch (e) {
        Alert.alert('Error', e.response?.data?.message || e.message || 'Password change failed');
      } finally {
        setIsLoading(false);
      }
    } else {
      // Forgot old password -> reset using recovery code
      if (!form.recoveryKey || !form.newPassword || !form.confirmPassword) {
        Alert.alert('Error', 'Please enter your recovery key and new password fields');
        return;
      }
      if (form.newPassword !== form.confirmPassword) {
        Alert.alert('Error', 'New passwords do not match');
        return;
      }
      if (form.newPassword.length < 6) {
        Alert.alert('Error', 'New password must be at least 6 characters');
        return;
      }

      const identifier = user?.email || user?.username;
      if (!identifier) {
        Alert.alert('Error', 'User identifier not found. Please log in again.');
        return;
      }

      setIsLoading(true);
      try {
        await api.post('/auth/forgot-password', {
          identifier,
          recoveryKey: form.recoveryKey.trim(),
          newPassword: form.newPassword,
        });
        Alert.alert('Success', 'Password reset successfully using recovery key!', [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      } catch (e) {
        Alert.alert('Error', e.response?.data?.message || e.message || 'Password reset failed');
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.dark.bg }}>
      <StatusBar barStyle="light-content" />

      {/* Initial Prompt Modal asking if user remembers or forgot old password */}
      <Modal
        visible={promptModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPromptModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconWrap}>
              <Ionicons name="key-outline" size={32} color={Colors.primary} />
            </View>
            <Text style={styles.modalTitle}>Change Password</Text>
            <Text style={styles.modalSub}>Do you remember your old password?</Text>

            <TouchableOpacity
              style={styles.modalOptionBtn}
              activeOpacity={0.8}
              onPress={() => {
                setMode('remembered');
                setPromptModalVisible(false);
              }}
            >
              <Ionicons name="checkmark-circle-outline" size={22} color="#10B981" />
              <View style={{ flex: 1 }}>
                <Text style={styles.modalOptionTitle}>Yes, I Remember</Text>
                <Text style={styles.modalOptionSub}>Change password using current password</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalOptionBtn, { borderColor: Colors.accentGreen + '50' }]}
              activeOpacity={0.8}
              onPress={() => {
                setMode('forgot');
                setPromptModalVisible(false);
              }}
            >
              <Ionicons name="shield-checkmark-outline" size={22} color={Colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.modalOptionTitle}>No, I Forgot</Text>
                <Text style={styles.modalOptionSub}>Reset password using Recovery Key code</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => {
                setPromptModalVisible(false);
                navigation.goBack();
              }}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Only show the form after user has made their choice */}
      {!promptModalVisible && (
        <>
          {/* Header */}
      <View style={[styles.header, { paddingTop: (insets.top || StatusBar.currentHeight || 0) + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {mode === 'remembered' ? 'Change Password' : 'Reset with Recovery Key'}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets showsVerticalScrollIndicator={false}>

        {mode === 'remembered' ? (
          <>
            {/* Security actions remaining banner */}
            {securityStatus && (
              <View style={[
                styles.infoBox,
                securityStatus.securityActionsRemaining === 0
                  ? { backgroundColor: '#EF444415', borderColor: '#EF444430' }
                  : { backgroundColor: '#10B98115', borderColor: '#10B98130' }
              ]}>
                <Ionicons
                  name={securityStatus.securityActionsRemaining === 0 ? 'ban-outline' : 'shield-checkmark-outline'}
                  size={20}
                  color={securityStatus.securityActionsRemaining === 0 ? '#EF4444' : '#10B981'}
                />
                <Text style={[styles.infoText, { color: securityStatus.securityActionsRemaining === 0 ? '#EF4444' : Colors.dark.text }]}>
                  {securityStatus.securityActionsRemaining === 0
                    ? "You've reached your security-change limit. Please try again after the 30-day window resets."
                    : `Security changes remaining: ${securityStatus.securityActionsRemaining} of ${securityStatus.securityActionsLimit}`}
                </Text>
              </View>
            )}

            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={20} color={Colors.primary} />
              <Text style={styles.infoText}>Enter your current password to update your password.</Text>
            </View>

            {/* Current Password */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Current Password</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="lock-closed-outline" size={20} color={Colors.dark.muted} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={form.currentPassword}
                  onChangeText={v => update('currentPassword', v)}
                  placeholder="Enter current password"
                  placeholderTextColor={Colors.dark.muted}
                  secureTextEntry={!show.curr}
                  autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => toggleShow('curr')}>
                  <Ionicons name={show.curr ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.dark.muted} />
                </TouchableOpacity>
              </View>
            </View>
          </>
        ) : (
          <>
            <View style={[styles.infoBox, { backgroundColor: Colors.primary + '15', borderColor: Colors.primary + '30' }]}>
              <Ionicons name="shield-checkmark-outline" size={20} color={Colors.primary} />
              <Text style={styles.infoText}>
                Enter your saved Recovery Key to reset your password without your old password.
              </Text>
            </View>

            {/* Recovery Key Code */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Recovery Code (Key)</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="shield-outline" size={20} color={Colors.primary} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={form.recoveryKey}
                  onChangeText={v => update('recoveryKey', v)}
                  placeholder="e.g. RELAY-XXXX-XXXX-XXXX"
                  placeholderTextColor={Colors.dark.muted}
                  secureTextEntry={!show.rec}
                  autoCapitalize="characters"
                />
                <TouchableOpacity onPress={() => toggleShow('rec')}>
                  <Ionicons name={show.rec ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.dark.muted} />
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        {/* New Password */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>New Password</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="key-outline" size={20} color={Colors.dark.muted} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={form.newPassword}
              onChangeText={v => update('newPassword', v)}
              placeholder="Minimum 6 characters"
              placeholderTextColor={Colors.dark.muted}
              secureTextEntry={!show.new}
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => toggleShow('new')}>
              <Ionicons name={show.new ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.dark.muted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Confirm New Password */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Confirm New Password</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="key-outline" size={20} color={Colors.dark.muted} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={form.confirmPassword}
              onChangeText={v => update('confirmPassword', v)}
              placeholder="Re-enter new password"
              placeholderTextColor={Colors.dark.muted}
              secureTextEntry={!show.new}
              autoCapitalize="none"
            />
          </View>
        </View>

        <TouchableOpacity onPress={handleChangePassword} disabled={isLoading} style={{ marginTop: 24 }}>
          <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.changeBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            {isLoading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.changeBtnText}>
                {mode === 'remembered' ? 'Change Password' : 'Reset Password with Recovery Code'}
              </Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: Colors.dark.card,
    borderBottomWidth: 1, borderBottomColor: Colors.dark.border,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.dark.text },
  scroll: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40 },
  infoBox: {
    flexDirection: 'row', gap: 10, backgroundColor: Colors.primary + '15',
    borderRadius: 14, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: Colors.primary + '30',
    alignItems: 'center',
  },
  infoText: { flex: 1, color: Colors.dark.text, fontSize: 13, lineHeight: 20 },
  inputGroup: { gap: 6, marginBottom: 16 },
  label: { color: Colors.dark.textSecondary, fontSize: 13, fontWeight: '600', marginLeft: 4 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.dark.input, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.dark.border, paddingHorizontal: 14,
  },
  inputIcon: { marginRight: 10 },
  input: { color: Colors.dark.text, fontSize: 15, paddingVertical: 16 },
  changeBtn: { borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  changeBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: Colors.dark.card,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: 'center',
  },
  modalIconWrap: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: Colors.primary + '20',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 22, fontWeight: '800', color: '#FFF', marginBottom: 6 },
  modalSub: { fontSize: 14, color: Colors.dark.textSecondary, textAlign: 'center', marginBottom: 24 },
  modalOptionBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.bg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  modalOptionTitle: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  modalOptionSub: { fontSize: 12, color: Colors.dark.muted, marginTop: 2 },
  modalCancelBtn: { marginTop: 8, paddingVertical: 12 },
  modalCancelText: { color: Colors.dark.muted, fontSize: 15, fontWeight: '600' },
});
