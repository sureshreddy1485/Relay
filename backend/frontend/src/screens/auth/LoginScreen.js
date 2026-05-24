import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  StatusBar, Animated, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import useAuthStore from '../../store/useAuthStore';
import { Colors } from '../../theme/colors';
import { connectSocket } from '../../services/socketService';

export default function LoginScreen({ navigation }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const { login, isLoading, error, clearError } = useAuthStore();
  const shakeAnim = useRef(new Animated.Value(0)).current;

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
    if (!identifier.trim() || !password.trim()) return shake();
    const result = await login(identifier.trim(), password);
    if (result.success) {
      const user = useAuthStore.getState().user;
      connectSocket(user._id);
    } else {
      shake();
    }
  };

  return (
    <LinearGradient colors={['#080F14', '#04070B']} style={styles.container}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
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

            <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')} style={styles.forgotBtn}>
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>

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
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 60, paddingBottom: 40 },
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
  forgotBtn: { alignSelf: 'flex-end' },
  forgotText: { color: Colors.primary, fontSize: 13, fontWeight: '600' },
  loginBtn: { borderRadius: 16, paddingVertical: 18, alignItems: 'center', marginTop: 8 },
  loginBtnText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  signupRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
  signupText: { color: Colors.dark.textSecondary, fontSize: 14 },
  signupLink: { color: Colors.primary, fontSize: 14, fontWeight: '700' },
});
