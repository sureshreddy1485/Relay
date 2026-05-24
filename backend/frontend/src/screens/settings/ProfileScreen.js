import React, { useState } from 'react';
import {
  View, Text, Image, StyleSheet, ScrollView,
  TouchableOpacity, StatusBar, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import useAuthStore from '../../store/useAuthStore';
import { Colors } from '../../theme/colors';
import { uploadApi } from '../../services/api';
import { HEADER_TOP } from '../../components/TabHeader';

const COVER_HEIGHT = 170;

export default function ProfileScreen({ navigation }) {
  const { user, updateUser } = useAuthStore();
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover]   = useState(false);

  // ── Helpers ─────────────────────────────────────────────────────────
  const pickAndUpload = async (field) => {
    const isAvatar = field === 'profilePicture';
    const setter   = isAvatar ? setUploadingAvatar : setUploadingCover;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: isAvatar ? [1, 1] : [16, 9],
      quality: 0.85,
    });
    if (result.canceled) return;

    setter(true);
    try {
      const file     = result.assets[0];
      const formData = new FormData();
      formData.append(field, { uri: file.uri, name: `${field}.jpg`, type: 'image/jpeg' });

      const { data } = await uploadApi.put('/users/profile', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      updateUser(data.user);
    } catch (e) {
      Alert.alert('Upload failed', e.message || 'Try again');
    } finally {
      setter(false);
    }
  };

  const stats = [
    { label: 'Friends', value: user?.friends?.length || 0 },
    { label: 'Groups',  value: '—' },
    { label: 'Stories', value: '—' },
  ];

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Floating Back Button */}
      <TouchableOpacity
        style={styles.backBtnWrap}
        onPress={() => navigation.goBack()}
        activeOpacity={0.7}
      >
        <Ionicons name="arrow-back" size={24} color="#FFF" />
      </TouchableOpacity>

      {/* ── Cover Photo ─────────────────────────────────────────── */}
      <TouchableOpacity activeOpacity={0.85} onPress={() => pickAndUpload('coverPhoto')} style={styles.coverWrap}>
        {user?.coverPhoto ? (
          <Image source={{ uri: user.coverPhoto }} style={styles.cover} resizeMode="cover" />
        ) : (
          <View style={styles.coverPlaceholder}>
            <Ionicons name="image-outline" size={32} color={Colors.dark.muted} />
            <Text style={styles.coverHint}>Tap to set cover photo</Text>
          </View>
        )}

        {/* Change-cover badge */}
        <View style={styles.coverBadge}>
          {uploadingCover
            ? <ActivityIndicator size="small" color="#FFF" />
            : <Ionicons name="camera" size={16} color="#FFF" />}
        </View>

        {/* Tinted overlay so the badge always reads well */}
        <View style={styles.coverOverlay} pointerEvents="none" />
      </TouchableOpacity>

      {/* ── Avatar ──────────────────────────────────────────────── */}
      <View style={styles.avatarRow}>
        <TouchableOpacity onPress={() => pickAndUpload('profilePicture')} style={styles.avatarWrap}>
          {user?.profilePicture ? (
            <Image source={{ uri: user.profilePicture }} style={styles.avatar} />
          ) : (
            <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.avatar}>
              <Text style={styles.avatarInitial}>{user?.username?.charAt(0).toUpperCase()}</Text>
            </LinearGradient>
          )}
          <View style={styles.avatarBadge}>
            {uploadingAvatar
              ? <ActivityIndicator size="small" color="#FFF" />
              : <Ionicons name="camera" size={14} color="#FFF" />}
          </View>
        </TouchableOpacity>

        {/* Action buttons aligned to the right */}
        <View style={styles.actionBtns}>
          <TouchableOpacity onPress={() => navigation.navigate('EditProfile')}>
            <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.editBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Ionicons name="pencil" size={16} color="#FFF" />
              <Text style={styles.editBtnText}>Edit</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingsBtn} onPress={() => navigation.navigate('Settings')}>
            <Ionicons name="settings-outline" size={22} color={Colors.dark.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Name & Bio ──────────────────────────────────────────── */}
      <View style={styles.info}>
        <Text style={styles.name}>{user?.displayName || user?.username}</Text>
        <Text style={styles.username}>@{user?.username}</Text>
        {user?.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}
      </View>

      {/* ── Stats ───────────────────────────────────────────────── */}
      <View style={styles.statsRow}>
        {stats.map(({ label, value }) => (
          <View key={label} style={styles.stat}>
            <Text style={styles.statValue}>{value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
          </View>
        ))}
      </View>

      {/* ── Details ─────────────────────────────────────────────── */}
      <View style={styles.details}>
        {[
          { icon: 'mail-outline',          value: user?.email },
          { icon: 'person-circle-outline', value: user?.isOnline ? 'Currently Online' : 'Offline' },
        ].map(({ icon, value }) => (
          <View key={icon} style={styles.detailRow}>
            <Ionicons name={icon} size={18} color={Colors.primary} />
            <Text style={styles.detailValue}>{value}</Text>
          </View>
        ))}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.bg },

  // Cover
  coverWrap: {
    width: '100%', height: COVER_HEIGHT,
    backgroundColor: Colors.dark.card,
    paddingTop: HEADER_TOP,               // status bar space
    overflow: 'hidden',
  },
  cover: { width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 },
  coverPlaceholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  coverHint: { color: Colors.dark.muted, fontSize: 13 },
  coverOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  coverBadge: {
    position: 'absolute', bottom: 10, right: 12,
    backgroundColor: Colors.primary,
    borderRadius: 20, width: 32, height: 32,
    alignItems: 'center', justifyContent: 'center',
  },

  // Avatar row
  avatarRow: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    paddingHorizontal: 16, marginTop: -44,
  },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 90, height: 90, borderRadius: 45,
    borderWidth: 3, borderColor: Colors.dark.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { fontSize: 36, fontWeight: '800', color: '#FFF' },
  avatarBadge: {
    position: 'absolute', bottom: 2, right: 2,
    backgroundColor: Colors.primary,
    borderRadius: 14, width: 26, height: 26,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.dark.bg,
  },

  // Action buttons
  actionBtns: { flexDirection: 'row', gap: 10, paddingBottom: 4 },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 12, paddingVertical: 10, paddingHorizontal: 18,
  },
  editBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  settingsBtn: {
    backgroundColor: Colors.dark.card, borderRadius: 12,
    width: 42, height: 42, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.dark.border,
  },

  // Info
  info: { paddingHorizontal: 16, marginTop: 12, marginBottom: 20 },
  name: { fontSize: 22, fontWeight: '800', color: '#FFF' },
  username: { fontSize: 14, color: Colors.primary, marginTop: 2 },
  bio: { fontSize: 14, color: Colors.dark.textSecondary, marginTop: 8, lineHeight: 20 },

  // Stats
  statsRow: {
    flexDirection: 'row', justifyContent: 'space-around',
    backgroundColor: Colors.dark.card, marginHorizontal: 16, borderRadius: 16,
    paddingVertical: 16, marginBottom: 16, borderWidth: 1, borderColor: Colors.dark.border,
  },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '800', color: '#FFF' },
  statLabel: { fontSize: 12, color: Colors.dark.muted, marginTop: 2 },

  // Details
  details: {
    marginHorizontal: 16, backgroundColor: Colors.dark.card, borderRadius: 16,
    padding: 16, gap: 14, borderWidth: 1, borderColor: Colors.dark.border,
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  detailValue: { fontSize: 14, color: Colors.dark.text },

  // Floating Back Button
  backBtnWrap: {
    position: 'absolute',
    top: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 12 : 58,
    left: 16,
    zIndex: 99,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
});
