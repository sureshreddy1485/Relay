import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';

export default function MediaViewerScreen() {
  return <View style={styles.c}><Text style={{ color: '#FFF' }}>Media Viewer</Text></View>;
}
const styles = StyleSheet.create({ c: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' } });
