/**
 * Settings screen — BYOK provider configuration.
 *
 * Users select an AI provider (OpenAI / Gemini), enter their API key,
 * and it's stored securely in the device keychain.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { colors, spacing, radius, shadows } from '../src/theme';
import {
  PROVIDERS, saveApiKey, getApiKey, removeApiKey, maskKey,
  validateKeyFormat, getConfiguredProviders,
} from '../src/ai/provider';
import { setActiveProvider, getActiveProvider } from '../src/ai/chat';
import { getMemoryCount } from '../src/ai/memory';
import type { ProviderType } from '../src/ai/provider';

interface ProviderState {
  configured: boolean;
  keyPreview: string | null;
  loading: boolean;
}

export default function SettingsScreen() {
  const [providerStates, setProviderStates] = useState<Record<ProviderType, ProviderState>>({
    openai: { configured: false, keyPreview: null, loading: true },
    gemini: { configured: false, keyPreview: null, loading: true },
  });
  const [editingProvider, setEditingProvider] = useState<ProviderType | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [active, setActive] = useState<ProviderType | null>(getActiveProvider());
  const memoryCount = getMemoryCount();

  const loadStates = useCallback(async () => {
    const states: Record<string, ProviderState> = {};
    for (const type of Object.keys(PROVIDERS) as ProviderType[]) {
      const key = await getApiKey(type);
      states[type] = {
        configured: !!key,
        keyPreview: key ? maskKey(key) : null,
        loading: false,
      };
    }
    setProviderStates(states as Record<ProviderType, ProviderState>);

    // Auto-select if none active
    if (!active) {
      const configured = await getConfiguredProviders();
      if (configured.length > 0) {
        setActive(configured[0]);
        setActiveProvider(configured[0]);
      }
    }
  }, [active]);

  useEffect(() => { loadStates(); }, [loadStates]);

  const handleSaveKey = async (provider: ProviderType) => {
    const error = validateKeyFormat(provider, keyInput);
    if (error) {
      Alert.alert('Invalid Key', error);
      return;
    }

    setSaving(true);
    try {
      await saveApiKey(provider, keyInput.trim());
      setActiveProvider(provider);
      setActive(provider);
      setKeyInput('');
      setEditingProvider(null);
      await loadStates();
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to save key');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveKey = (provider: ProviderType) => {
    Alert.alert(
      'Remove API Key',
      `Remove your ${PROVIDERS[provider].label} key? You can add it again later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await removeApiKey(provider);
            if (active === provider) {
              setActiveProvider(null);
              setActive(null);
            }
            await loadStates();
          },
        },
      ],
    );
  };

  const handleSelectActive = async (provider: ProviderType) => {
    setActiveProvider(provider);
    setActive(provider);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* LLM Providers */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AI PROVIDER</Text>
        <Text style={styles.sectionDesc}>
          Bring your own API key. Your key stays on this device.
        </Text>

        {(Object.keys(PROVIDERS) as ProviderType[]).map(type => {
          const info = PROVIDERS[type];
          const state = providerStates[type];
          const isActive = active === type;
          const isEditing = editingProvider === type;

          return (
            <View key={type} style={styles.providerCard}>
              <TouchableOpacity
                style={styles.providerHeader}
                onPress={() => {
                  if (state.configured) {
                    handleSelectActive(type);
                  } else {
                    setEditingProvider(isEditing ? null : type);
                    setKeyInput('');
                  }
                }}
                activeOpacity={0.7}
              >
                <View style={styles.providerInfo}>
                  <View style={styles.providerNameRow}>
                    <Text style={styles.providerName}>{info.label}</Text>
                    {isActive && (
                      <View style={styles.activeBadge}>
                        <Text style={styles.activeBadgeText}>ACTIVE</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.providerDesc}>{info.description}</Text>
                </View>
                {state.loading ? (
                  <ActivityIndicator size="small" color={colors.textMuted} />
                ) : state.configured ? (
                  <Text style={styles.keyPreview}>{state.keyPreview}</Text>
                ) : (
                  <Text style={styles.addKey}>Add key</Text>
                )}
              </TouchableOpacity>

              {/* Key input form */}
              {isEditing && !state.configured && (
                <View style={styles.keyForm}>
                  <TextInput
                    style={styles.keyInput}
                    value={keyInput}
                    onChangeText={setKeyInput}
                    placeholder={`Paste your ${info.label} API key`}
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                  />
                  <View style={styles.keyActions}>
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={() => { setEditingProvider(null); setKeyInput(''); }}
                    >
                      <Text style={styles.cancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                      onPress={() => handleSaveKey(type)}
                      disabled={saving || !keyInput.trim()}
                    >
                      {saving ? (
                        <ActivityIndicator size="small" color={colors.white} />
                      ) : (
                        <Text style={styles.saveText}>Save</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Configured — show remove option */}
              {state.configured && (
                <View style={styles.configuredActions}>
                  {!isActive && (
                    <TouchableOpacity
                      style={styles.useButton}
                      onPress={() => handleSelectActive(type)}
                    >
                      <Text style={styles.useText}>Use this provider</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleRemoveKey(type)}
                  >
                    <Text style={styles.removeText}>Remove key</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* Security */}
      <SettingsSection title="SECURITY">
        <SettingsRow label="Encryption" value="AES-256-GCM" />
        <SettingsRow label="Key derivation" value="SLIP-0010 + HKDF" />
        <SettingsRow label="Key storage" value="Device Keychain" />
      </SettingsSection>

      {/* Stats */}
      <SettingsSection title="DATA">
        <SettingsRow label="Memories" value={`${memoryCount}`} />
        <SettingsRow label="Storage" value="On device only" />
      </SettingsSection>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Dina v0.1.0</Text>
        <Text style={styles.footerSubtext}>Your data never leaves this device</Text>
      </View>
    </ScrollView>
  );
}

function SettingsRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  section: { marginBottom: spacing.lg },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1.5,
    color: colors.textMuted, marginBottom: spacing.sm, marginLeft: spacing.xs,
  },
  sectionDesc: {
    fontSize: 13, color: colors.textSecondary, marginBottom: spacing.md,
    marginLeft: spacing.xs, lineHeight: 18,
  },
  sectionCard: {
    backgroundColor: colors.bgSecondary, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadows.sm,
  },

  // Provider cards
  providerCard: {
    backgroundColor: colors.bgSecondary, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, marginBottom: 10,
    overflow: 'hidden', ...shadows.sm,
  },
  providerHeader: {
    flexDirection: 'row', alignItems: 'center',
    padding: spacing.md, justifyContent: 'space-between',
  },
  providerInfo: { flex: 1, marginRight: spacing.md },
  providerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  providerName: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  providerDesc: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  activeBadge: {
    backgroundColor: colors.accent, borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  activeBadgeText: {
    fontSize: 9, fontWeight: '700', color: colors.white, letterSpacing: 0.5,
  },
  keyPreview: { fontSize: 12, color: colors.textMuted, fontFamily: 'Menlo' },
  addKey: { fontSize: 14, color: colors.accent, fontWeight: '500' },

  // Key form
  keyForm: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  keyInput: {
    backgroundColor: colors.bgTertiary, borderRadius: radius.sm,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14,
    color: colors.textPrimary, borderWidth: 1, borderColor: colors.border,
  },
  keyActions: {
    flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10,
  },
  cancelButton: { paddingHorizontal: 16, paddingVertical: 10 },
  cancelText: { fontSize: 14, color: colors.textMuted, fontWeight: '500' },
  saveButton: {
    backgroundColor: colors.accent, borderRadius: radius.sm,
    paddingHorizontal: 20, paddingVertical: 10,
  },
  saveButtonDisabled: { opacity: 0.5 },
  saveText: { fontSize: 14, color: colors.white, fontWeight: '600' },

  // Configured actions
  configuredActions: {
    flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border,
  },
  useButton: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    borderRightWidth: 1, borderRightColor: colors.border,
  },
  useText: { fontSize: 13, color: colors.accent, fontWeight: '500' },
  removeButton: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  removeText: { fontSize: 13, color: colors.error, fontWeight: '500' },

  // Settings rows
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  rowLabel: { fontSize: 15, color: colors.textPrimary, fontWeight: '500' },
  rowValue: { fontSize: 14, color: colors.textMuted },

  footer: { alignItems: 'center', marginTop: spacing.xl, paddingVertical: spacing.lg },
  footerText: { fontSize: 13, fontWeight: '600', color: colors.textMuted, letterSpacing: 0.5 },
  footerSubtext: { fontSize: 12, color: colors.textMuted, marginTop: spacing.xs },
});
