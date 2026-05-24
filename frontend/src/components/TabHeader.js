import React from 'react';
import { View, Text, StyleSheet, StatusBar, Platform, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../theme/colors';

// Legacy export kept to prevent undefined errors, but the component uses dynamic safe area now
export const HEADER_TOP = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 6 : 44;

const { width } = Dimensions.get('window');
const isSmall = width <= 380;

/**
 * TabHeader — consistent header for all main tab screens.
 * Props:
 *   title        – screen title (displayed in cyan)
 *   right        – optional JSX rendered on the right side (icons, etc.)
 */
export default function TabHeader({ title, right, left }) {
  const insets = useSafeAreaInsets();
  
  return (
    <View style={[styles.header, { paddingTop: (insets.top || StatusBar.currentHeight || 0) }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {left ? <View style={styles.left}>{left}</View> : null}
        {title === 'Relay' ? (
          <Text style={[styles.title, { color: Colors.primary }]}>Relay</Text>
        ) : (
          <Text style={styles.title}>{title}</Text>
        )}
      </View>
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
    paddingBottom: 12,
    backgroundColor: Colors.dark.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  title: {
    fontSize: isSmall ? 22 : 26,
    fontWeight: '900',
    color: Colors.primary,
    letterSpacing: 0.3,
  },
  left: {
    marginRight: 10,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
