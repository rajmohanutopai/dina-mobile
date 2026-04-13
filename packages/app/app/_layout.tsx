/**
 * Root layout — Expo Router file-based routing.
 *
 * Tab navigator: Chat, Vault, People, Reminders, Settings
 * Styled with Dina warm design system.
 */

import '../src/polyfills';
import React from 'react';
import { Tabs } from 'expo-router';
import { Platform, View, Text, StyleSheet } from 'react-native';
import { colors, fonts } from '../src/theme';

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Chat: '\u2726',       // sparkle
    Vault: '\u229E',      // squared plus (vault)
    People: '\u2603',     // placeholder — will swap
    Reminders: '\u25CB',  // circle
    Settings: '\u2699',   // gear
  };

  // Simple icon mapping using SF Symbols-like unicode
  const iconMap: Record<string, string> = {
    Chat: 'chat',
    Vault: 'vault',
    People: 'people',
    Reminders: 'bell',
    Settings: 'gear',
  };

  return (
    <View style={tabIconStyles.container}>
      <View style={[
        tabIconStyles.dot,
        focused && tabIconStyles.dotActive,
      ]} />
    </View>
  );
}

const tabIconStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 2,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'transparent',
    marginBottom: 2,
  },
  dotActive: {
    backgroundColor: colors.accent,
  },
});

export default function RootLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: colors.bgPrimary,
          ...(Platform.OS === 'ios' ? { shadowOpacity: 0 } : { elevation: 0 }),
        },
        headerTitleStyle: {
          fontWeight: '600',
          fontSize: 17,
          color: colors.textPrimary,
          letterSpacing: 0.3,
        },
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: colors.bgPrimary,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingTop: 8,
          height: Platform.OS === 'ios' ? 88 : 64,
        },
        tabBarActiveTintColor: colors.tabActive,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
          letterSpacing: 0.2,
          marginTop: 2,
        },
        tabBarIcon: ({ focused }) => null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Chat',
          tabBarIcon: ({ focused }) => <TabIcon name="Chat" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="vault"
        options={{
          title: 'Vault',
          tabBarIcon: ({ focused }) => <TabIcon name="Vault" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="people"
        options={{
          title: 'People',
          tabBarIcon: ({ focused }) => <TabIcon name="People" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="reminders"
        options={{
          title: 'Reminders',
          tabBarIcon: ({ focused }) => <TabIcon name="Reminders" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused }) => <TabIcon name="Settings" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
