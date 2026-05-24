import React from 'react';
import { View, Text, StyleSheet, StatusBar, Platform } from 'react-native';
import { Colors } from '../theme/colors';

// Shared top padding so all tab headers start from the same position
export const HEADER_TOP =
  Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 6 : 44;

/**
 * TabHeader — consistent header for all main tab screens.
 *
 * Props:
 *   title        – screen title (displayed in cyan)
 *   right        – optional JSX rendered on the right side (icons, etc.)
 */
export default function TabHeader({ title, right }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: HEADER_TOP,
    paddingBottom: 12,
    backgroundColor: Colors.dark.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: Colors.primary,   // cyan
    letterSpacing: 0.3,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
