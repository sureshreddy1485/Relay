import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Platform, ActivityIndicator, Alert, StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';
import api from '../../services/api';

export default function ChangePasswordScreen({ navigation }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '', securityKey: '' });
  const [show, setShow] = useState({ curr: false, new: false, key: false });
  const [isLoading, setIsLoading] = useState(false);

  const update = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const toggleShow = (key) => setShow(s => ({ ...s, [key]: !s[key] }));

  const handleChange = async () => {
    if (!form.currentPassword || !form.newPassword || !form.securityKey) {
      Alert.alert('Error', 'All fields are required'); return;
    }
    if (form.newPassword !== form.confirmPassword) {
      Alert.alert('Error', 'New passwords do not match'); return;
    }
    if (form.newPassword.length < 6) {
      Alert.alert('Error', 'New password must be at least 6 characters'); return;
    }

    setIsLoading(true);
    try {
      await api.put('/auth/change-password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
        securityKey: form.securityKey,
      });
      Alert.alert('Success', 'Password changed successfully!', [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || e.message || 'Change failed');
    } finally {
      setIsLoading(false);
    }
  };

  const fields = [
    { key: 'currentPassword', label: 'Current Password', showKey: 'curr', placeholder: 'Enter current password' },
    { key: 'newPassword', label: 'New Password', showKey: 'new', placeholder: 'Minimum 6 characters' },
    { key: 'confirmPassword', label: 'Confirm New Password', showKey: 'new', placeholder: 'Re-enter new password' },
    { key: 'securityKey', label: 'Security Key', showKey: 'key', placeholder: 'Enter your security key', isKey: true },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: Colors.dark.bg }}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Change Password</Text>
        <View style={{ width: 36 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View style={styles.infoBox}>
            <Ionicons name="shield-checkmark" size={20} color={Colors.accentGreen} />
            <Text style={styles.infoText}>Your security key is required to change your password. This ensures only you can modify your account.</Text>
          </View>

          {fields.map(({ key, label, showKey, placeholder, isKey }) => (
            <View key={key} style={styles.inputGroup}>
              <Text style={styles.label}>{label}</Text>
              <View style={styles.inputWrap}>
                <Ionicons
                  name={isKey ? 'shield-outline' : 'lock-closed-outline'}
                  size={20}
                  color={isKey ? Colors.accentGreen : Colors.dark.muted}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={form[key]}
                  onChangeText={v => update(key, v)}
                  placeholder={placeholder}
                  placeholderTextColor={Colors.dark.muted}
                  secureTextEntry={!show[showKey]}
                  autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => toggleShow(showKey)}>
                  <Ionicons name={show[showKey] ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.dark.muted} />
                </TouchableOpacity>
              </View>
            </View>
          ))}

          <TouchableOpacity onPress={handleChange} disabled={isLoading} style={{ marginTop: 16 }}>
            <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.changeBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              {isLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.changeBtnText}>Change Password</Text>}
            </LinearGradient>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 8 : 54,
    paddingBottom: 12,
    backgroundColor: Colors.dark.card,
    borderBottomWidth: 1, borderBottomColor: Colors.dark.border,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.dark.text },
  scroll: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 },
  infoBox: {
    flexDirection: 'row', gap: 12, backgroundColor: Colors.accentGreen + '15',
    borderRadius: 14, padding: 14, marginBottom: 24, borderWidth: 1, borderColor: Colors.accentGreen + '30',
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
  changeBtnText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
});
