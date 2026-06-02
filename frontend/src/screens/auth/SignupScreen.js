import React, { useState, useEffect, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  StatusBar, Image, Alert, Keyboard, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import useAuthStore from '../../store/useAuthStore';
import { Colors } from '../../theme/colors';
import { connectSocket } from '../../services/socketService';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function SignupScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState({
    username: '', email: '', displayName: '', password: '', confirmPassword: '', securityKey: '',
  });
  const [showPass, setShowPass] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [avatar, setAvatar] = useState(null);
  const [saveInfo, setSaveInfo] = useState(true);
  const { signup, isLoading, error, clearError } = useAuthStore();
  const scrollRef = useRef();
  const fieldYRef = useRef({});     // Y position of each field in the scroll view
  const fieldHeightRef = useRef({}); // Height of each field
  const keyboardHeightRef = useRef(0);
  const screenHeight = Dimensions.get('window').height;

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      keyboardHeightRef.current = e.endCoordinates.height;
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardHeightRef.current = 0;
    });
    return () => { show.remove(); hide.remove(); };
  }, []);

  const scrollToField = (key) => {
    const y = fieldYRef.current[key];
    const h = fieldHeightRef.current[key] || 56;
    const kbH = keyboardHeightRef.current || 300; // fallback estimate
    if (y !== undefined) {
      // Scroll so the bottom of the field sits ~16px above the keyboard
      const visibleHeight = screenHeight - kbH;
      const targetY = y + h - visibleHeight + 32;
      scrollRef.current?.scrollTo({ y: Math.max(0, targetY), animated: true });
    }
  };

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
    const usernameRegex = /^[a-zA-Z_][a-zA-Z0-9_.]*$/;
    if (!usernameRegex.test(username)) {
      Alert.alert('Error', 'Username must start with a letter or underscore and contain only letters, numbers, underscores, and dots.'); return;
    }
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email)) {
      Alert.alert('Error', 'Please provide a valid email address'); return;
    }
    const localPart = email.split('@')[0];
    if (localPart.length <= 4) {
      Alert.alert('Error', 'Email address username (before @) must be greater than 4 characters'); return;
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

      // Save credentials locally if user opted in
      if (saveInfo) {
        try {
          const raw = await AsyncStorage.getItem('relay_saved_logins');
          let accounts = raw ? JSON.parse(raw) : [];
          // Remove existing entry for same username
          accounts = accounts.filter(a => a.username !== username.toLowerCase().trim());
          // Prepend new entry; cap at 3
          accounts = [{ username: username.toLowerCase().trim(), email: email.toLowerCase().trim(), password }, ...accounts].slice(0, 3);
          await AsyncStorage.setItem('relay_saved_logins', JSON.stringify(accounts));
        } catch (_) {}
      }
    }
  };

  return (
    <LinearGradient colors={['#080F14', '#04070B']} style={[styles.container, { paddingTop: Math.max(insets.top, StatusBar.currentHeight || 0) }]}>
      <StatusBar barStyle="light-content" translucent />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'padding'} style={{ flex: 1 }}>
        <ScrollView 
          ref={scrollRef}
          contentContainerStyle={[
            styles.scroll, 
            { 
            paddingTop: 20, 
              paddingBottom: 120,
              paddingLeft: Math.max(insets.left, 24),
              paddingRight: Math.max(insets.right, 24)
            }
          ]} 
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
          </TouchableOpacity>

          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join the Relay community</Text>

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
          ].map(({ key, label, icon, placeholder, autocap, keyboard }) => (
            <View key={key} style={styles.inputGroup}
            onLayout={(e) => { fieldYRef.current[key] = e.nativeEvent.layout.y; fieldHeightRef.current[key] = e.nativeEvent.layout.height; }}
            >
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
                  onFocus={() => scrollToField(key)}
                />
              </View>
            </View>
          ))}

          {/* Password */}
          <View style={styles.inputGroup}
            onLayout={(e) => { fieldYRef.current['password'] = e.nativeEvent.layout.y; fieldHeightRef.current['password'] = e.nativeEvent.layout.height; }}
          >
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={20} color={Colors.dark.muted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Enter password"
                placeholderTextColor={Colors.dark.muted}
                value={form.password}
                onChangeText={v => update('password', v)}
                secureTextEntry={!showPass}
                onFocus={() => scrollToField('password')}
              />
              <TouchableOpacity onPress={() => setShowPass(!showPass)}>
                <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.dark.muted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.hint}>Password must contain 8+ chars, 1 uppercase, 1 number, and 1 special char.</Text>
          </View>

          <View style={styles.inputGroup}
            onLayout={(e) => { fieldYRef.current['confirmPassword'] = e.nativeEvent.layout.y; fieldHeightRef.current['confirmPassword'] = e.nativeEvent.layout.height; }}
          >
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
                onFocus={() => scrollToField('confirmPassword')}
              />
            </View>
          </View>

          {/* Security Key */}
          <View style={styles.inputGroup}
            onLayout={(e) => { fieldYRef.current['securityKey'] = e.nativeEvent.layout.y; fieldHeightRef.current['securityKey'] = e.nativeEvent.layout.height; }}
          >
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
                onFocus={() => scrollToField('securityKey')}
              />
              <TouchableOpacity onPress={() => setShowKey(!showKey)}>
                <Ionicons name={showKey ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.dark.muted} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Save Info toggle */}
          <TouchableOpacity
            onPress={() => setSaveInfo(v => !v)}
            style={styles.saveInfoRow}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, saveInfo && styles.checkboxActive]}>
              {saveInfo && <Ionicons name="checkmark" size={14} color="#FFF" />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.saveInfoLabel}>Save login info</Text>
              <Text style={styles.saveInfoHint}>Saves username, email & password on this device for quick login</Text>
            </View>
          </TouchableOpacity>

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
  scroll: { flexGrow: 1, paddingHorizontal: 24 },
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
  saveInfoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.dark.card, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.dark.border,
    padding: 14, marginBottom: 16,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: Colors.dark.muted,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  saveInfoLabel: { color: Colors.dark.text, fontSize: 14, fontWeight: '600', marginBottom: 2 },
  saveInfoHint: { color: Colors.dark.muted, fontSize: 12 },
});
