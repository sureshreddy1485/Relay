import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  StatusBar, Image, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import useAuthStore from '../../store/useAuthStore';
import { Colors } from '../../theme/colors';
import { connectSocket } from '../../services/socketService';

export default function SignupScreen({ navigation }) {
  const [form, setForm] = useState({
    username: '', email: '', displayName: '', password: '', confirmPassword: '', securityKey: '',
  });
  const [showPass, setShowPass] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [avatar, setAvatar] = useState(null);
  const { signup, isLoading, error, clearError } = useAuthStore();

  const update = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const pickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow photo library access.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true, aspect: [1, 1], quality: 0.8,
    });
    if (!result.canceled) setAvatar(result.assets[0]);
  };

  const handleSignup = async () => {
    clearError();
    const { username, email, password, confirmPassword, securityKey, displayName } = form;
    if (!username || !email || !password || !securityKey) {
      Alert.alert('Error', 'All fields are required'); return;
    }
    if (username.length < 6 || username.length > 16) {
      Alert.alert('Error', 'Username must be between 6 and 16 characters'); return;
    }
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email)) {
      Alert.alert('Error', 'Please provide a valid email address'); return;
    }
    if (password !== confirmPassword) { Alert.alert('Error', 'Passwords do not match'); return; }
    if (password.length < 8) { Alert.alert('Error', 'Password must be at least 8 characters'); return; }
    const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&^#_]).{8,}$/;
    if (!passwordRegex.test(password)) {
      Alert.alert('Error', 'Password must contain at least one uppercase letter, one number, and one special character'); return;
    }
    if (securityKey.length < 6) { Alert.alert('Error', 'Security key must be at least 6 characters'); return; }

    const formData = new FormData();
    formData.append('username', username.toLowerCase().trim());
    formData.append('email', email.toLowerCase().trim());
    formData.append('password', password);
    formData.append('securityKey', securityKey);
    formData.append('displayName', displayName || username);
    if (avatar) {
      formData.append('profilePicture', { uri: avatar.uri, name: 'profile.jpg', type: 'image/jpeg' });
    }

    const result = await signup(formData);
    if (result.success) {
      const user = useAuthStore.getState().user;
      connectSocket(user._id);
    }
  };

  return (
    <LinearGradient colors={['#080F14', '#04070B']} style={styles.container}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
          </TouchableOpacity>

          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join the Nexo community</Text>

          {/* Avatar picker */}
          <TouchableOpacity style={styles.avatarWrap} onPress={pickAvatar}>
            {avatar ? (
              <Image source={{ uri: avatar.uri }} style={styles.avatar} />
            ) : (
              <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.avatar}>
                <Ionicons name="camera" size={28} color="#FFF" />
              </LinearGradient>
            )}
            <View style={styles.avatarBadge}>
              <Ionicons name="add" size={16} color="#FFF" />
            </View>
          </TouchableOpacity>

          {error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={Colors.camera} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {[
            { key: 'username', label: 'Username', icon: 'at', placeholder: 'unique_username', autocap: 'none' },
            { key: 'email', label: 'Email', icon: 'mail-outline', placeholder: 'you@email.com', autocap: 'none', keyboard: 'email-address' },
            { key: 'displayName', label: 'Display Name (optional)', icon: 'person-outline', placeholder: 'Your Name' },
          ].map(({ key, label, icon, placeholder, autocap, keyboard }) => (
            <View key={key} style={styles.inputGroup}>
              <Text style={styles.label}>{label}</Text>
              <View style={styles.inputWrap}>
                <Ionicons name={icon} size={20} color={Colors.dark.muted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder={placeholder}
                  placeholderTextColor={Colors.dark.muted}
                  value={form[key]}
                  onChangeText={v => update(key, v)}
                  autoCapitalize={autocap || 'words'}
                  keyboardType={keyboard || 'default'}
                />
              </View>
            </View>
          ))}

          {/* Password */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={20} color={Colors.dark.muted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Min 8 chars, 1 Capital, 1 Num, 1 Spec"
                placeholderTextColor={Colors.dark.muted}
                value={form.password}
                onChangeText={v => update('password', v)}
                secureTextEntry={!showPass}
              />
              <TouchableOpacity onPress={() => setShowPass(!showPass)}>
                <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.dark.muted} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Confirm Password</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={20} color={Colors.dark.muted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Re-enter password"
                placeholderTextColor={Colors.dark.muted}
                value={form.confirmPassword}
                onChangeText={v => update('confirmPassword', v)}
                secureTextEntry={!showPass}
              />
            </View>
          </View>

          {/* Security Key */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Security Key</Text>
            <Text style={styles.hint}>🔐 Required for password recovery. Store it safely!</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="shield-checkmark-outline" size={20} color={Colors.accentGreen} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Create a secret security key"
                placeholderTextColor={Colors.dark.muted}
                value={form.securityKey}
                onChangeText={v => update('securityKey', v)}
                secureTextEntry={!showKey}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowKey(!showKey)}>
                <Ionicons name={showKey ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.dark.muted} />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity onPress={handleSignup} disabled={isLoading} activeOpacity={0.85} style={{ marginTop: 8 }}>
            <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.signupBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              {isLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.signupBtnText}>Create Account</Text>}
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.loginRow}>
            <Text style={styles.loginText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.loginLink}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 60, paddingBottom: 40 },
  backBtn: { marginBottom: 20 },
  title: { fontSize: 30, fontWeight: '800', color: '#FFF', marginBottom: 6 },
  subtitle: { fontSize: 15, color: Colors.dark.textSecondary, marginBottom: 30 },
  avatarWrap: { alignSelf: 'center', marginBottom: 24, position: 'relative' },
  avatar: { width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center' },
  avatarBadge: {
    position: 'absolute', bottom: 0, right: 0,
    backgroundColor: Colors.primary, borderRadius: 12, width: 24, height: 24,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.dark.card,
  },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.camera + '20', borderRadius: 12,
    padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.camera + '40',
  },
  errorText: { color: Colors.camera, fontSize: 13, flex: 1 },
  inputGroup: { gap: 6, marginBottom: 12 },
  label: { color: Colors.dark.textSecondary, fontSize: 13, fontWeight: '600', marginLeft: 4 },
  hint: { color: Colors.accentGreen, fontSize: 12, marginLeft: 4 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.dark.input, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.dark.border, paddingHorizontal: 14,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, color: Colors.dark.text, fontSize: 15, paddingVertical: 16 },
  signupBtn: { borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  signupBtnText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  loginRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  loginText: { color: Colors.dark.textSecondary, fontSize: 14 },
  loginLink: { color: Colors.primary, fontSize: 14, fontWeight: '700' },
});
