import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { colors, spacing, radius, shadows } from '../src/theme';
import { getAllMemories, getMemoryCount, type Memory } from '../src/ai/memory';

export default function VaultScreen() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [count, setCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setMemories(getAllMemories());
      setCount(getMemoryCount());
    }, [])
  );

  const renderMemory = ({ item }: { item: Memory }) => {
    const date = new Date(item.created_at);
    const dateStr = date.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric',
    });
    const timeStr = date.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit',
    });

    return (
      <View style={styles.memoryCard}>
        <Text style={styles.memoryText}>{item.content}</Text>
        <View style={styles.memoryMeta}>
          <Text style={styles.memoryDate}>{dateStr} at {timeStr}</Text>
          {item.reminder_date && (
            <View style={styles.reminderBadge}>
              <Text style={styles.reminderBadgeText}>Reminder set</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {count === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.card}>
            <Text style={styles.icon}>{'\u229E'}</Text>
            <Text style={styles.title}>Vault</Text>
            <Text style={styles.subtitle}>Your memories, encrypted and private</Text>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>0</Text>
              <Text style={styles.statLabel}>MEMORIES</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>0</Text>
              <Text style={styles.statLabel}>REMINDERS</Text>
            </View>
          </View>
        </View>
      ) : (
        <FlatList
          data={memories}
          keyExtractor={item => String(item.id)}
          renderItem={renderMemory}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.headerStats}>
              <Text style={styles.headerCount}>{count}</Text>
              <Text style={styles.headerLabel}>
                {count === 1 ? 'MEMORY' : 'MEMORIES'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },

  // Empty state
  emptyState: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },
  card: {
    backgroundColor: colors.bgSecondary, borderRadius: radius.lg,
    padding: spacing.xl, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border, ...shadows.sm,
  },
  icon: { fontSize: 32, color: colors.textMuted, marginBottom: spacing.md },
  title: { fontSize: 22, fontWeight: '600', color: colors.textPrimary, letterSpacing: 0.3 },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: spacing.xs, lineHeight: 20 },
  statsRow: { flexDirection: 'row', gap: 12, marginTop: spacing.md },
  statCard: {
    flex: 1, backgroundColor: colors.bgSecondary, borderRadius: radius.md,
    padding: spacing.lg, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border, ...shadows.sm,
  },
  statValue: { fontSize: 28, fontWeight: '700', color: colors.textPrimary },
  statLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 1, color: colors.textMuted, marginTop: spacing.xs },

  // List
  listContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  headerStats: {
    alignItems: 'center', marginBottom: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerCount: { fontSize: 36, fontWeight: '700', color: colors.textPrimary },
  headerLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, color: colors.textMuted, marginTop: 2 },

  // Memory card
  memoryCard: {
    backgroundColor: colors.bgSecondary, borderRadius: radius.md,
    padding: spacing.md, marginBottom: 10,
    borderWidth: 1, borderColor: colors.border, ...shadows.sm,
  },
  memoryText: { fontSize: 15, color: colors.textPrimary, lineHeight: 22 },
  memoryMeta: {
    flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8,
  },
  memoryDate: { fontSize: 12, color: colors.textMuted },
  reminderBadge: {
    backgroundColor: colors.bgTertiary, borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  reminderBadgeText: { fontSize: 10, fontWeight: '600', color: colors.textSecondary },
});
