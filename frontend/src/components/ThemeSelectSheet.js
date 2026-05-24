import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Animated, Dimensions, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../theme/colors';

const { height: SCREEN_H } = Dimensions.get('window');

export const CHAT_THEMES = [
  { id: 'default', name: 'Default (Blue)', colors: [Colors.primary, Colors.primaryDark], bg: Colors.dark.bg },
  { id: 'midnight', name: 'Midnight', colors: ['#232526', '#414345'], bg: '#0F1011' },
  { id: 'sunset', name: 'Sunset', colors: ['#FF512F', '#F09819'], bg: '#1A0C05' },
  { id: 'ocean', name: 'Ocean', colors: ['#2193b0', '#6dd5ed'], bg: '#0A1A22' },
  { id: 'neon', name: 'Neon Purple', colors: ['#b92b27', '#1565C0'], bg: '#120516' },
  { id: 'forest', name: 'Forest', colors: ['#11998e', '#38ef7d'], bg: '#051811' },
  { id: 'rose', name: 'Rose', colors: ['#ff9966', '#ff5e62'], bg: '#1A0808' },
];

export const GROUP_THEMES = [
  { id: 'default', name: 'Default (Blue)', colors: [Colors.primary, Colors.primaryDark], bg: Colors.dark.bg },
  { id: 'ruby', name: 'Ruby', colors: ['#904e95', '#e96443'], bg: '#1A0C14' },
  { id: 'emerald', name: 'Emerald', colors: ['#047857', '#10B981'], bg: '#061A10' },
  { id: 'amethyst', name: 'Amethyst', colors: ['#4A00E0', '#8E2DE2'], bg: '#140C22' },
  { id: 'obsidian', name: 'Obsidian', colors: ['#434343', '#000000'], bg: '#080808' },
  { id: 'solar', name: 'Solar', colors: ['#F2C94C', '#F2994A'], bg: '#1A140A' },
  { id: 'cyberpunk', name: 'Cyberpunk', colors: ['#FF0080', '#7928CA'], bg: '#140510' },
];

export default function ThemeSelectSheet({ visible, currentThemeId, isGroup, onSelect, onClose }) {
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;
  const activeThemes = isGroup ? GROUP_THEMES : CHAT_THEMES;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: SCREEN_H, duration: 220, useNativeDriver: true }).start();
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.handle} />
        <Text style={styles.title}>Select Chat Theme</Text>
        
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {activeThemes.map((theme) => {
            const isSelected = (currentThemeId || 'default') === theme.id;
            return (
              <TouchableOpacity
                key={theme.id}
                style={styles.option}
                activeOpacity={0.7}
                onPress={() => {
                  onSelect(theme.id);
                  onClose();
                }}
              >
                <LinearGradient colors={theme.colors} style={styles.previewBubble} />
                <Text style={[styles.optionText, isSelected && styles.optionSelected]}>{theme.name}</Text>
                {isSelected && <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />}
              </TouchableOpacity>
            );
          })}
          <View style={{ height: 40 }} />
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.dark.bg,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: SCREEN_H * 0.7, paddingTop: 8,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.dark.border, alignSelf: 'center', marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: '700', color: '#FFF', textAlign: 'center', marginBottom: 16 },
  list: { paddingHorizontal: 20 },
  option: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 14,
    borderBottomWidth: 0.5, borderBottomColor: Colors.dark.border,
  },
  previewBubble: {
    width: 36, height: 36, borderRadius: 18, marginRight: 16,
  },
  optionText: { flex: 1, fontSize: 15, color: Colors.dark.text },
  optionSelected: { color: Colors.primary, fontWeight: '600' },
});
