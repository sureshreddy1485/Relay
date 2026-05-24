import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Platform, ActivityIndicator, Alert, Image, StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import useAuthStore from '../../store/useAuthStore';
import { Colors } from '../../theme/colors';
import { uploadApi } from '../../services/api';

export default function EditProfileScreen({ navigation }) {
  const { user, updateUser } = useAuthStore();
  const [form, setForm] = useState({
    displayName: user?.displayName || '',
    bio: user?.bio || '',
  });
  const [avatar, setAvatar] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const update = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const pickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) setAvatar(result.assets[0]);
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('displayName', form.displayName);
      formData.append('bio', form.bio);
      if (avatar) {
        formData.append('profilePicture', {
          uri: avatar.uri,
          name: 'profilePicture.jpg',
          type: 'image/jpeg',
        });
      }
      const { data } = await uploadApi.put('/users/profile', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      updateUser(data.user);
      Alert.alert('✅ Success', 'Profile updated!');
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', e.message || 'Update failed');
    } finally {
      setIsLoading(false);
    }
  };

  const currentAvatar = avatar?.uri || user?.profilePicture;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={{ width: 36 }} />
      </View>

      {/*
        No KeyboardAvoidingView — it causes jumping on Android with multiline inputs.
        automaticallyAdjustKeyboardInsets handles it correctly on both platforms.
      */}
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar */}
        <TouchableOpacity style={styles.avatarWrap} onPress={pickAvatar} activeOpacity={0.8}>
          {currentAvatar ? (
            <Image source={{ uri: currentAvatar }} style={styles.avatar} />
          ) : (
            <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.avatar}>
              <Text style={styles.avatarInitial}>{user?.username?.charAt(0).toUpperCase()}</Text>
            </LinearGradient>
          )}
          <View style={styles.cameraBadge}>
            <Ionicons name="camera" size={16} color="#FFF" />
          </View>
        </TouchableOpacity>
        <Text style={styles.changePhotoText}>Tap to change photo</Text>

        <View style={styles.form}>
          {/* Display Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Display Name</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                value={form.displayName}
                onChangeText={v => update('displayName', v)}
                placeholder="Your display name"
                placeholderTextColor={Colors.dark.muted}
                returnKeyType="next"
              />
            </View>
          </View>

          {/* Bio — fixed tap area */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Bio</Text>
            {/* 
              Key fixes:
              1. textAlignVertical="top" so cursor starts at top
              2. width: '100%' so entire box is tappable
              3. No fixed height wrapper — minHeight on input instead
            */}
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.bioInput}
                value={form.bio}
                onChangeText={v => update('bio', v)}
                placeholder="Tell people about yourself..."
                placeholderTextColor={Colors.dark.muted}
                multiline
                maxLength={200}
                textAlignVertical="top"
              />
            </View>
            <Text style={styles.charCount}>{form.bio.length}/200</Text>
          </View>

          {/* Username (read-only) */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Username</Text>
            <View style={[styles.inputWrap, { opacity: 0.5 }]}>
              <TextInput
                style={styles.input}
                value={`@${user?.username}`}
                editable={false}
                placeholderTextColor={Colors.dark.muted}
              />
            </View>
            <Text style={styles.hint}>Username cannot be changed</Text>
          </View>

          <TouchableOpacity onPress={handleSave} disabled={isLoading} style={{ marginTop: 8 }}>
            <LinearGradient
              colors={[Colors.primary, Colors.primaryDark]}
              style={styles.saveBtn}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            >
              {isLoading
                ? <ActivityIndicator color="#FFF" />
                : <Text style={styles.saveBtnText}>Save Changes</Text>}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 8 : 54,
    paddingBottom: 12,
    backgroundColor: Colors.dark.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.primary },
  scroll: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 60 },
  avatarWrap: { alignSelf: 'center', marginBottom: 8, position: 'relative' },
  avatar: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 40, fontWeight: '800', color: '#FFF' },
  cameraBadge: {
    position: 'absolute', bottom: 0, right: 0,
    backgroundColor: Colors.primary, borderRadius: 16, width: 32, height: 32,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.dark.bg,
  },
  changePhotoText: { textAlign: 'center', color: Colors.primary, fontSize: 13, marginBottom: 28 },
  form: { gap: 4 },
  inputGroup: { gap: 6, marginBottom: 16 },
  label: { color: Colors.dark.textSecondary, fontSize: 13, fontWeight: '600', marginLeft: 4 },
  inputWrap: {
    backgroundColor: Colors.dark.input, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.dark.border,
    paddingHorizontal: 16,
  },
  input: { color: Colors.dark.text, fontSize: 15, paddingVertical: 14, width: '100%' },
  // Bio specific — full width, auto-grows, top-aligned
  bioInput: {
    color: Colors.dark.text,
    fontSize: 15,
    paddingVertical: 14,
    width: '100%',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  charCount: { alignSelf: 'flex-end', fontSize: 12, color: Colors.dark.muted },
  hint: { fontSize: 12, color: Colors.dark.muted, marginLeft: 4 },
  saveBtn: { borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  saveBtnText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
});
