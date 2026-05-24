import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  StatusBar, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';
import api from '../../services/api';

const STEPS = ['identify', 'verify', 'reset', 'success'];

export default function ForgotPasswordScreen({ navigation }) {
  const [step, setStep] = useState(0);
  const [identifier, setIdentifier] = useState('');
  const [securityKey, setSecurityKey] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleReset = async () => {
    setError('');
    if (!identifier.trim()) { setError('Enter your email or username'); return; }
    if (!securityKey.trim()) { setError('Enter your security key'); return; }
    if (!newPassword.trim() || newPassword.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }

    setIsLoading(true);
    try {
      await api.post('/auth/forgot-password', {
        identifier: identifier.trim(),
        securityKey: securityKey.trim(),
        newPassword,
      });
      setStep(3);
    } catch (err) {
      setError(err.response?.data?.message || 'Reset failed. Check your security key.');
    } finally {
      setIsLoading(false);
    }
  };

  if (step === 3) {
    return (
      <LinearGradient colors={['#0A0A0F', '#1A1A2E']} style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.successContainer}>
          <LinearGradient colors={[Colors.primary, Colors.accentGreen]} style={styles.successIcon}>
            <Ionicons name="checkmark" size={48} color="#FFF" />
          </LinearGradient>
          <Text style={styles.successTitle}>Password Reset!</Text>
          <Text style={styles.successText}>Your password has been successfully changed. You can now sign in.</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.successBtn}>
              <Text style={styles.successBtnText}>Sign In Now</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#0A0A0F', '#1A1A2E']} style={styles.container}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
          </TouchableOpacity>

          <View style={styles.header}>
            <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.logoGrad}>
              <Ionicons name="shield-checkmark" size={32} color="#FFF" />
            </LinearGradient>
            <Text style={styles.title}>Reset Password</Text>
            <Text style={styles.subtitle}>Enter your security key to reset your password</Text>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={Colors.camera} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Info box */}
          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={20} color={Colors.primary} />
            <Text style={styles.infoText}>
              You'll need the Security Key you set during registration to reset your password.
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email or Username</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="person-outline" size={20} color={Colors.dark.muted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Enter email or username"
                placeholderTextColor={Colors.dark.muted}
                value={identifier}
                onChangeText={setIdentifier}
                autoCapitalize="none"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Security Key</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="shield-outline" size={20} color={Colors.accentGreen} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Enter your security key"
                placeholderTextColor={Colors.dark.muted}
                value={securityKey}
                onChangeText={setSecurityKey}
                secureTextEntry={!showKey}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowKey(!showKey)}>
                <Ionicons name={showKey ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.dark.muted} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>New Password</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={20} color={Colors.dark.muted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Minimum 6 characters"
                placeholderTextColor={Colors.dark.muted}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!showPass}
              />
              <TouchableOpacity onPress={() => setShowPass(!showPass)}>
                <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.dark.muted} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Confirm New Password</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={20} color={Colors.dark.muted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Re-enter new password"
                placeholderTextColor={Colors.dark.muted}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPass}
              />
            </View>
          </View>

          <TouchableOpacity onPress={handleReset} disabled={isLoading} activeOpacity={0.85} style={{ marginTop: 8 }}>
            <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.resetBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              {isLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.resetBtnText}>Reset Password</Text>}
            </LinearGradient>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 60, paddingBottom: 40 },
  backBtn: { marginBottom: 20 },
  header: { alignItems: 'center', marginBottom: 32 },
  logoGrad: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 28, fontWeight: '800', color: '#FFF', marginBottom: 6 },
  subtitle: { fontSize: 14, color: Colors.dark.textSecondary, textAlign: 'center' },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.camera + '20', borderRadius: 12,
    padding: 12, marginBottom: 16, borderWidth: 1, borderColor: Colors.camera + '40',
  },
  errorText: { color: Colors.camera, fontSize: 13, flex: 1 },
  infoBox: {
    flexDirection: 'row', gap: 10, backgroundColor: Colors.primary + '15',
    borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: Colors.primary + '30',
  },
  infoText: { color: Colors.dark.text, fontSize: 13, flex: 1, lineHeight: 20 },
  inputGroup: { gap: 6, marginBottom: 16 },
  label: { color: Colors.dark.textSecondary, fontSize: 13, fontWeight: '600', marginLeft: 4 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.dark.input, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.dark.border, paddingHorizontal: 14,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, color: Colors.dark.text, fontSize: 15, paddingVertical: 16 },
  resetBtn: { borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  resetBtnText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  successIcon: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  successTitle: { fontSize: 30, fontWeight: '800', color: '#FFF', marginBottom: 12 },
  successText: { fontSize: 15, color: Colors.dark.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  successBtn: { borderRadius: 16, paddingVertical: 18, paddingHorizontal: 48, alignItems: 'center' },
  successBtnText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
});
