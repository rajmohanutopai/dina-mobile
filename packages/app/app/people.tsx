import { View, Text, StyleSheet } from 'react-native';

export default function PeopleScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>People</Text>
      <Text style={styles.subtitle}>Your contacts</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: 'bold' },
  subtitle: { fontSize: 14, color: '#666', marginTop: 4 },
});
