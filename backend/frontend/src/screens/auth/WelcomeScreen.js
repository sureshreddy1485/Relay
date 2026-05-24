import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Animated, Dimensions, TouchableOpacity, StatusBar, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../theme/colors';

export default function WelcomeScreen({ navigation }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const logoAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(logoAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  return (
    <LinearGradient colors={['#080F14', '#04070B']} style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Decorative circles */}
      <View style={[styles.circle, { top: -60, right: -60, backgroundColor: Colors.primary + '20' }]} />
      <View style={[styles.circle, { bottom: 200, left: -80, backgroundColor: Colors.primary + '10', width: 200, height: 200 }]} />

      {/* Logo */}
      <Animated.View style={[styles.logoContainer, { opacity: logoAnim, transform: [{ scale: logoAnim }] }]}>
        <Image 
          source={require('../../../assets/icon.png')} 
          style={styles.logoImage} 
          resizeMode="contain"
        />
        <Text style={styles.appName}>Nexo</Text>
        <Text style={styles.tagline}>Next-gen messaging platform</Text>
      </Animated.View>

      {/* Feature pills */}
      <Animated.View style={[styles.features, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        {['🔒 End-to-End Encrypted', '⚡ Realtime Messaging', '🌍 Communities & Channels'].map((f, i) => (
          <View key={i} style={styles.featurePill}>
            <Text style={styles.featureText}>{f}</Text>
          </View>
        ))}
      </Animated.View>

      {/* CTA Buttons */}
      <Animated.View style={[styles.buttons, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <TouchableOpacity onPress={() => navigation.navigate('Signup')} activeOpacity={0.85}>
          <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.primaryBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            <Text style={styles.primaryBtnText}>Get Started</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => navigation.navigate('Login')}
          activeOpacity={0.8}
        >
          <Text style={styles.secondaryBtnText}>I already have an account</Text>
        </TouchableOpacity>
      </Animated.View>

      <Text style={styles.footer}>By continuing, you agree to our Terms & Privacy Policy</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  circle: { position: 'absolute', width: 250, height: 250, borderRadius: 125 },
  logoContainer: { alignItems: 'center', marginBottom: 48 },
  logoImage: {
    width: 100, height: 100, borderRadius: 32, marginBottom: 20,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 20,
  },
  appName: { fontSize: 42, fontWeight: '900', color: '#FFF', letterSpacing: 1 },
  tagline: { fontSize: 15, color: Colors.dark.textSecondary, marginTop: 6, letterSpacing: 0.5 },
  features: { marginBottom: 40, gap: 10, width: '100%' },
  featurePill: {
    backgroundColor: Colors.dark.surface + 'CC', borderRadius: 50,
    paddingHorizontal: 20, paddingVertical: 12, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  featureText: { color: Colors.dark.text, fontSize: 14, fontWeight: '500' },
  buttons: { width: '100%', gap: 14 },
  primaryBtn: {
    borderRadius: 16, paddingVertical: 18, alignItems: 'center',
    elevation: 10, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 12,
  },
  primaryBtnText: { color: '#FFF', fontSize: 17, fontWeight: '700', letterSpacing: 0.5 },
  secondaryBtn: {
    borderRadius: 16, paddingVertical: 16, alignItems: 'center',
    borderWidth: 1.5, borderColor: Colors.dark.border, backgroundColor: Colors.dark.card + 'AA',
  },
  secondaryBtnText: { color: Colors.dark.text, fontSize: 16, fontWeight: '600' },
  footer: { position: 'absolute', bottom: 36, color: Colors.dark.muted, fontSize: 11, textAlign: 'center' },
});
