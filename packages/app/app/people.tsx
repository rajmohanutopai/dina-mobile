import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, shadows } from '../src/theme';

export default function PeopleScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.icon}>{'\u2302'}</Text>
        <Text style={styles.title}>People</Text>
        <Text style={styles.subtitle}>Your trusted contacts and connections</Text>
      </View>
      <View style={styles.emptyHint}>
        <Text style={styles.emptyText}>
          Contacts you share memories with will appear here.
          Each connection is end-to-end encrypted.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },
  card: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  icon: {
    fontSize: 32,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.textPrimary,
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 20,
  },
  emptyHint: {
    marginTop: spacing.lg,
    backgroundColor: colors.bgTertiary,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 22,
    textAlign: 'center',
  },
});
