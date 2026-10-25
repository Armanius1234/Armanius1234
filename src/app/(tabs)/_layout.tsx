import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import { StyleSheet, View, type ColorValue } from 'react-native';

import { useMessagesRealtime, useUnreadCount } from '@/features/messaging/api';
import { useFollowRequests } from '@/features/social/api';
import { useI18n } from '@/i18n';
import { colors, fonts } from '@/theme/tokens';

type IconName = ComponentProps<typeof Ionicons>['name'];

function icon(active: IconName, inactive: IconName) {
  return function TabIcon({ focused, color, size }: { focused: boolean; color: ColorValue; size: number }) {
    return <Ionicons name={focused ? active : inactive} size={size} color={typeof color === 'string' ? color : undefined} />;
  };
}

/** The centre tab is the PL8 signature feature, so it gets a highlighted button. */
function SearchIcon({ focused }: { focused: boolean }) {
  return (
    <View style={[styles.searchIcon, focused && styles.searchIconActive]}>
      <Ionicons name="search" size={22} color="#fff" />
    </View>
  );
}

export default function TabsLayout() {
  const { t } = useI18n();
  useMessagesRealtime();
  const { unread, requests } = useUnreadCount();
  const followRequests = useFollowRequests().data?.length ?? 0;
  const messageBadge = unread + requests;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.bgSecondary,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.home'), tabBarIcon: icon('home', 'home-outline') }} />
      <Tabs.Screen
        name="discover"
        options={{ title: t('tabs.discover'), tabBarIcon: icon('compass', 'compass-outline') }}
      />
      <Tabs.Screen
        name="search"
        options={{ title: t('tabs.search'), tabBarIcon: ({ focused }) => <SearchIcon focused={focused} /> }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t('tabs.messages'),
          tabBarIcon: icon('chatbubbles', 'chatbubbles-outline'),
          tabBarBadge: messageBadge > 0 ? (messageBadge > 99 ? '99+' : messageBadge) : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.accent, color: '#fff', fontFamily: fonts.semibold, fontSize: 11 },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: icon('person-circle', 'person-circle-outline'),
          tabBarBadge: followRequests > 0 ? followRequests : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.accent, color: '#fff', fontFamily: fonts.semibold, fontSize: 11 },
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  searchIcon: {
    width: 40,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIconActive: { backgroundColor: colors.accent, borderColor: colors.accent },
});
