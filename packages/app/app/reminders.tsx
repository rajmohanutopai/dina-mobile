import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { colors, spacing, radius, shadows } from '../src/theme';
import { getUpcomingReminders, type Memory } from '../src/ai/memory';

export default function RemindersScreen() {
  const [reminders, setReminders] = useState<Memory[]>([]);

  useFocusEffect(
    useCallback(() => {
      setReminders(getUpcomingReminders());
    }, [])
  );

  const renderReminder = ({ item }: { item: Memory }) => {
    const date = new Date(item.reminder_date! + 'T00:00:00');
    const dateStr = date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    const now = new Date();
    const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const relative = diffDays === 0 ? 'Today'
      : diffDays === 1 ? 'Tomorrow'
      : `In ${diffDays} days`;

    return (
      <View style={styles.reminderCard}>
        <View style={styles.dateColumn}>
          <Text style={styles.dateDay}>{date.getDate()}</Text>
          <Text style={styles.dateMonth}>{date.toLocaleDateString('en-US', { month: 'short' })}</Text>
        </View>
        <View style={styles.reminderContent}>
          <Text style={styles.reminderText}>{item.content}</Text>
          <Text style={styles.reminderMeta}>{relative} \u00B7 {dateStr}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {reminders.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.card}>
            <Text style={styles.icon}>{'\u25CB'}</Text>
            <Text style={styles.title}>Reminders</Text>
            <Text style={styles.subtitle}>Upcoming events and nudges</Text>
          </View>
          <View style={styles.emptyHint}>
            <Text style={styles.emptyText}>
              When you remember something with a date, Dina will automatically create a reminder for it.
            </Text>
          </View>
        </View>
      ) : (
        <FlatList
          data={reminders}
          keyExtractor={item => String(item.id)}
          renderItem={renderReminder}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={styles.listHeader}>
              {reminders.length} UPCOMING
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  // Empty state
  emptyState: {
    flex: 1,
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
  icon: { fontSize: 32, color: colors.textMuted, marginBottom: spacing.md },
  title: { fontSize: 22, fontWeight: '600', color: colors.textPrimary, letterSpacing: 0.3 },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: spacing.xs, lineHeight: 20 },
  emptyHint: {
    marginTop: spacing.lg,
    backgroundColor: colors.bgTertiary,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  emptyText: { fontSize: 14, color: colors.textSecondary, lineHeight: 22, textAlign: 'center' },

  // List
  listContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  listHeader: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1.5,
    color: colors.textMuted, marginBottom: spacing.md, marginLeft: spacing.xs,
  },

  // Reminder card
  reminderCard: {
    flexDirection: 'row',
    backgroundColor: colors.bgSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  dateColumn: {
    width: 48, alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.md,
  },
  dateDay: { fontSize: 24, fontWeight: '700', color: colors.textPrimary },
  dateMonth: { fontSize: 11, fontWeight: '600', color: colors.textMuted, letterSpacing: 0.5 },
  reminderContent: { flex: 1, justifyContent: 'center' },
  reminderText: { fontSize: 15, color: colors.textPrimary, lineHeight: 21 },
  reminderMeta: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
});
