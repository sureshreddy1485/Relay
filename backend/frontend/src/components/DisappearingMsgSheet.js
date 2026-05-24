import React, { useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  Animated, Dimensions, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';

const { height: SCREEN_H } = Dimensions.get('window');

// Maps seconds → option config
export const DISAPPEAR_OPTIONS = [
  {
    key: 'off',
    seconds: 0,
    label: 'Off',
    icon: 'close-circle-outline',
    iconColor: Colors.primary,
  },
  {
    key: '5s',
    seconds: 5,
    label: '5 seconds',
    icon: 'time-outline',
    iconColor: Colors.dark.text,
  },
  {
    key: '10s',
    seconds: 10,
    label: '10 seconds',
    icon: 'time-outline',
    iconColor: Colors.dark.text,
  },
  {
    key: '20s',
    seconds: 20,
    label: '20 seconds',
    icon: 'time-outline',
    iconColor: Colors.dark.text,
  },
  {
    key: '30s',
    seconds: 30,
    label: '30 seconds',
    icon: 'time-outline',
    iconColor: Colors.dark.text,
  },
  {
    key: '24h',
    seconds: 86400,
    label: '24 hours',
    icon: 'hourglass-outline',
    iconColor: Colors.dark.text,
  },
];

export function secondsToLabel(s) {
  const opt = DISAPPEAR_OPTIONS.find(o => o.seconds === s);
  return opt ? opt.label : 'Off';
}

export default function DisappearingMsgSheet({ visible, currentSeconds = 0, onSelect, onClose }) {
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0, useNativeDriver: true, bounciness: 3,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SCREEN_H, duration: 220, useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const handleSelect = (seconds) => {
    onSelect?.(seconds);
    onClose?.();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        {/* Handle */}
        <View style={styles.handle} />

        {/* Title */}
        <Text style={styles.title}>Disappearing Messages</Text>

        {/* Options */}
        <View style={styles.optionsList}>
          {DISAPPEAR_OPTIONS.map((opt, idx) => {
            const isSelected = currentSeconds === opt.seconds;
            const isFirst    = idx === 0;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.option,
                  isFirst && styles.optionFirst,
                  !isFirst && styles.optionNormal,
                ]}
                onPress={() => handleSelect(opt.seconds)}
                activeOpacity={0.7}
              >
                {/* Icon */}
                <View style={[styles.iconWrap, isFirst && styles.iconWrapActive]}>
                  <Ionicons
                    name={opt.icon}
                    size={22}
                    color={isFirst ? Colors.primary : Colors.dark.muted}
                  />
                </View>

                {/* Label */}
                <Text style={[styles.optionLabel, isFirst && styles.optionLabelActive]}>
                  {opt.label}
                </Text>

                {/* Checkmark if selected */}
                {isSelected && (
                  <View style={styles.checkWrap}>
                    <Ionicons name="checkmark" size={16} color="#FFF" />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Cancel button */}
        <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.8}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: '#1A1A2E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 28,
    paddingTop: 8,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.dark.border,
    alignSelf: 'center', marginBottom: 18,
  },
  title: {
    fontSize: 17, fontWeight: '700', color: '#FFF',
    textAlign: 'center', marginBottom: 18,
    paddingHorizontal: 20,
  },
  optionsList: {
    marginHorizontal: 16,
    backgroundColor: Colors.dark.card,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginBottom: 12,
  },

  // First option (Off) — slightly highlighted
  optionFirst: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 18, paddingVertical: 16, gap: 14,
    borderBottomWidth: 0.5, borderBottomColor: Colors.dark.border,
    backgroundColor: Colors.primary + '0D', // 5% opacity highlight
  },
  // Normal options
  optionNormal: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 18, paddingVertical: 16, gap: 14,
    borderBottomWidth: 0.5, borderBottomColor: Colors.dark.border,
  },
  // Shared (applied via conditional above)
  option: {},

  iconWrap: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: Colors.primary + '20',
  },

  optionLabel: {
    flex: 1, fontSize: 16, color: Colors.dark.text, fontWeight: '500',
  },
  optionLabelActive: {
    color: Colors.primary, fontWeight: '700',
  },

  checkWrap: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },

  // Cancel
  cancelBtn: {
    marginHorizontal: 16,
    backgroundColor: Colors.dark.card,
    borderRadius: 14, paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  cancelText: { fontSize: 16, fontWeight: '600', color: Colors.dark.text },
});
