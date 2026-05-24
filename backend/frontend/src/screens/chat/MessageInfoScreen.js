import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';

export default function MessageInfoScreen() {
  return <View style={styles.c}><Text style={{ color: Colors.dark.text }}>Message Info</Text></View>;
}
const styles = StyleSheet.create({ c: { flex: 1, backgroundColor: Colors.dark.bg, alignItems: 'center', justifyContent: 'center' } });
