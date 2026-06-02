import React, { useState, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  StatusBar, Animated, Image, Switch
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import useAuthStore from '../../store/useAuthStore';
import { Colors } from '../../theme/colors';
import { connectSocket } from '../../services/socketService';

export default function LoginScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [securityKey, setSecurityKey] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [saveLogin, setSaveLogin] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState([]);
  const { login, isLoading, error, clearError } = useAuthStore();
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef();

  React.useEffect(() => {
    const loadSavedCredentials = async () => {
      try {
        const savedArr = await AsyncStorage.getItem('relay_saved_logins');
        if (savedArr) {
          const accounts = JSON.parse(savedArr);
          if (Array.isArray(accounts)) setSavedAccounts(accounts);
        } else {
          const saved = await AsyncStorage.getItem('relay_saved_login');
          if (saved) {
            const { savedIdentifier, savedPassword } = JSON.parse(saved);
            setIdentifier(savedIdentifier);
            setPassword(savedPassword);
            setSaveLogin(true);
          }
        }
      } catch (e) {}
    };
    loadSavedCredentials();
  }, []);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const handleLogin = async () => {
    clearError();
    if (!identifier.trim() || !password.trim() || !securityKey.trim()) return shake();
    
    const result = await login(identifier.trim(), password, securityKey.trim());
    if (result.success) {
      const user = useAuthStore.getState().user;
      
      let newAccounts = [...savedAccounts];
      newAccounts = newAccounts.filter(a => a.identifier !== identifier.trim() && a.userId !== user._id);
      
      if (saveLogin) {
        newAccounts.unshift({
          userId: user._id,
          identifier: identifier.trim(),
          password,
          name: user.displayName || user.username,
          avatar: user.profilePicture
        });
        if (newAccounts.length > 3) newAccounts = newAccounts.slice(0, 3);
      }
      await AsyncStorage.setItem('relay_saved_logins', JSON.stringify(newAccounts));
      
      connectSocket(user._id);
    } else {
      shake();
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
              paddingBottom: 20,
              paddingLeft: Math.max(insets.left, 24),
              paddingRight: Math.max(insets.right, 24)
            }
          ]} 
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
          </TouchableOpacity>

          <View style={styles.header}>
            <Image 
              source={require('../../../assets/icon.png')} 
              style={{ width: 84, height: 84, borderRadius: 24, marginBottom: 16 }} 
              resizeMode="contain"
            />
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Sign in to continue</Text>
          </View>

          {savedAccounts.length > 0 && (
            <View style={{ marginBottom: 20 }}>
              <Text style={{ color: Colors.dark.muted, fontSize: 13, marginBottom: 10, textAlign: 'center' }}>Saved Accounts</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 12 }}>
                {savedAccounts.map((acc, idx) => (
                  <TouchableOpacity 
                    key={idx} 
                    style={{ alignItems: 'center', backgroundColor: Colors.dark.card, padding: 12, borderRadius: 16, width: 90, borderWidth: 1, borderColor: identifier === acc.identifier ? Colors.primary : Colors.dark.border }}
                    onPress={() => {
                      setIdentifier(acc.identifier);
                      setPassword(acc.password);
                      setSaveLogin(true);
                    }}
                  >
                    {acc.avatar ? (
                      <Image source={{ uri: acc.avatar }} style={{ width: 44, height: 44, borderRadius: 22, marginBottom: 8 }} />
                    ) : (
                      <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={{ width: 44, height: 44, borderRadius: 22, marginBottom: 8, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 18 }}>{acc.name?.charAt(0).toUpperCase()}</Text>
                      </LinearGradient>
                    )}
                    <Text style={{ color: Colors.dark.text, fontSize: 12, fontWeight: '600', textAlign: 'center' }} numberOfLines={1}>{acc.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          <Animated.View style={[styles.form, { transform: [{ translateX: shakeAnim }] }]}>
            {/* Error */}
            {error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color={Colors.camera} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

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
                  autoCorrect={false}
                  keyboardType="email-address"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="lock-closed-outline" size={20} color={Colors.dark.muted} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Enter password"
                  placeholderTextColor={Colors.dark.muted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPass}
                />
                <TouchableOpacity onPress={() => setShowPass(!showPass)} style={styles.eyeBtn}>
                  <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.dark.muted} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Security Key</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="key-outline" size={20} color={Colors.dark.muted} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Master security key"
                  placeholderTextColor={Colors.dark.muted}
                  value={securityKey}
                  onChangeText={setSecurityKey}
                  secureTextEntry={!showKey}
                  onFocus={() => {
                    setTimeout(() => {
                      scrollRef.current?.scrollToEnd({ animated: true });
                    }, 100);
                  }}
                />
                <TouchableOpacity onPress={() => setShowKey(!showKey)} style={styles.eyeBtn}>
                  <Ionicons name={showKey ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.dark.muted} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.optionsRow}>
              <View style={styles.saveLoginRow}>
                <Switch
                  value={saveLogin}
                  onValueChange={setSaveLogin}
                  trackColor={{ false: Colors.dark.border, true: Colors.primary }}
                  thumbColor="#FFF"
                  style={{ transform: [{ scale: 0.8 }] }}
                />
                <Text style={styles.saveLoginText}>Save details</Text>
              </View>
              <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')} style={styles.forgotBtn}>
                <Text style={styles.forgotText}>Forgot Password?</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={handleLogin} disabled={isLoading} activeOpacity={0.85}>
              <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.loginBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                {isLoading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.loginBtnText}>Sign In</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.signupRow}>
              <Text style={styles.signupText}>Don't have an account? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
                <Text style={styles.signupLink}>Sign Up</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 24 },
  backBtn: { marginBottom: 20 },
  header: { alignItems: 'center', marginBottom: 40 },
  logoGrad: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 30, fontWeight: '800', color: '#FFF', marginBottom: 6 },
  subtitle: { fontSize: 15, color: Colors.dark.textSecondary },
  form: { gap: 16 },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.camera + '20', borderRadius: 12,
    padding: 12, borderWidth: 1, borderColor: Colors.camera + '40',
  },
  errorText: { color: Colors.camera, fontSize: 13, flex: 1 },
  inputGroup: { gap: 8 },
  label: { color: Colors.dark.textSecondary, fontSize: 13, fontWeight: '600', marginLeft: 4 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.dark.input, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.dark.border, paddingHorizontal: 14,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, color: Colors.dark.text, fontSize: 15, paddingVertical: 16 },
  eyeBtn: { padding: 4 },
  optionsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  saveLoginRow: { flexDirection: 'row', alignItems: 'center' },
  saveLoginText: { color: Colors.dark.textSecondary, fontSize: 13, marginLeft: 4 },
  forgotBtn: { alignSelf: 'flex-end' },
  forgotText: { color: Colors.primary, fontSize: 13, fontWeight: '600' },
  loginBtn: { borderRadius: 16, paddingVertical: 18, alignItems: 'center', marginTop: 8 },
  loginBtnText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  signupRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
  signupText: { color: Colors.dark.textSecondary, fontSize: 14 },
  signupLink: { color: Colors.primary, fontSize: 14, fontWeight: '700' },
});
