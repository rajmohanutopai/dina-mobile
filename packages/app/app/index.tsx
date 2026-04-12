/**
 * Chat tab — main interaction screen.
 *
 * Placeholder that verifies cross-package imports work.
 */

import { View, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';

export default function ChatScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dina</Text>
      <Text style={styles.subtitle}>Your sovereign personal AI</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 32, fontWeight: 'bold' },
  subtitle: { fontSize: 16, color: '#666', marginTop: 8 },
});
