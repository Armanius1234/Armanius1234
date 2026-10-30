import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useSignedUrls } from '@/features/garage/api';
import { VehicleCard } from '@/features/garage/components';
import { FollowButton } from '@/features/social/components';
import { useI18n } from '@/i18n';
import type { PersonResult, Suggestion } from '@/lib/database.types';
import { avatarUrl } from '@/lib/supabase';
import { colors, radius, spacing } from '@/theme/tokens';
import { AppText, Avatar, EmptyView, LoadingView, TextField } from '@/ui';

import { cleanQuery, useDebounced, usePeopleSearch, useSuggestedPeople, useVehicleSearch } from './api';

const openProfile = (username: string) => router.push({ pathname: '/user/[username]', params: { username } });

// ------------------------------------------------------------------ people --

export function PersonRow({ person }: { person: PersonResult }) {
  const { t } = useI18n();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${person.display_name}, @${person.username}`}
      onPress={() => openProfile(person.username)}
      style={({ pressed }) => [styles.person, pressed && styles.pressed]}
    >
      <Avatar uri={avatarUrl(person.avatar_path)} name={person.display_name} size={44} />
      <View style={styles.flex}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {person.display_name}
        </AppText>
        <AppText variant="caption" color="textSecondary" numberOfLines={1}>
          @{person.username}
          {person.i_follow ? ` · ${t('search.following')}` : person.is_private ? ` · ${t('search.privateAccount')}` : ''}
        </AppText>
      </View>
      {person.is_private ? <Ionicons name="lock-closed-outline" size={16} color={colors.textSecondary} /> : null}
      <Ionicons name="chevron-forward" size={18} color={colors.textDisabled} />
    </Pressable>
  );
}

export function PeopleSearchPanel() {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query);
  const results = usePeopleSearch(debounced);
  const ready = cleanQuery(debounced).length >= 2;

  return (
    <View style={styles.panel}>
      <TextField
        label={t('search.peopleField')}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
      {!ready ? (
        <AppText variant="caption" color="textSecondary">
          {t('search.peopleHint')}
        </AppText>
      ) : results.isPending ? (
        <LoadingView />
      ) : results.data?.length ? (
        results.data.map((p) => <PersonRow key={p.user_id} person={p} />)
      ) : (
        <EmptyView icon="person-outline" title={t('search.peopleEmpty')} />
      )}
    </View>
  );
}

// -------------------------------------------------------------------- cars --

export function CarSearchPanel() {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query);
  const results = useVehicleSearch(debounced);
  const covers = useSignedUrls(
    'vehicle-photos',
    (results.data ?? []).map((v) => v.cover_path).filter((p): p is string => !!p),
  );
  const ready = debounced.trim().length >= 2;

  return (
    <View style={styles.panel}>
      <TextField
        label={t('search.carsField')}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        returnKeyType="search"
      />
      {!ready ? (
        <AppText variant="caption" color="textSecondary">
          {t('search.carsHint')}
        </AppText>
      ) : results.isPending ? (
        <LoadingView />
      ) : results.data?.length ? (
        results.data.map((v) => (
          <VehicleCard
            key={v.vehicle_id}
            vehicle={v}
            coverUrl={v.cover_path ? covers.data?.[v.cover_path] : null}
            coverPath={v.cover_path}
            onPress={() => router.push({ pathname: '/vehicle/[id]', params: { id: v.vehicle_id } })}
            footer={
              <AppText variant="caption" color="textSecondary">
                {t('search.ownedBy', { username: v.owner_username })}
              </AppText>
            }
          />
        ))
      ) : (
        <EmptyView icon="car-sport-outline" title={t('search.carsEmpty')} />
      )}
    </View>
  );
}

// -------------------------------------------------------------- suggestions --

function reasonText(t: ReturnType<typeof useI18n>['t'], s: Suggestion): string {
  if (s.reason === 'followed_by' && s.mutual_example) {
    return s.mutual_count > 1
      ? t('feed.reason_followed_by_more', { name: s.mutual_example, n: s.mutual_count - 1 })
      : t('feed.reason_followed_by', { name: s.mutual_example });
  }
  if (s.reason === 'same_make' && s.shared_make) return t('feed.reason_same_make', { make: s.shared_make });
  return t('feed.reason_popular');
}

/** "Suggested for you" strip on Discover. Hidden when there is nobody to suggest. */
export function SuggestedPeople() {
  const { t } = useI18n();
  const suggestions = useSuggestedPeople();
  if (!suggestions.data?.length) return null;
  return (
    <View style={styles.suggestions}>
      <AppText variant="overline" color="textSecondary">
        {t('feed.suggestions').toUpperCase()}
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionRow}>
        {suggestions.data.map((s) => (
          <View key={s.user_id} style={styles.suggestionCard}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${s.display_name}, @${s.username}. ${reasonText(t, s)}`}
              onPress={() => openProfile(s.username)}
              style={styles.suggestionTop}
            >
              <Avatar uri={avatarUrl(s.avatar_path)} name={s.display_name} size={56} />
              <AppText variant="bodyStrong" numberOfLines={1} center>
                {s.display_name}
              </AppText>
              <AppText variant="caption" color="textSecondary" numberOfLines={2} center>
                {reasonText(t, s)}
              </AppText>
            </Pressable>
            <FollowButton profile={{ id: s.user_id, username: s.username }} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  panel: { gap: spacing.sm },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.85 },
  suggestions: { gap: spacing.xs, paddingTop: spacing.sm },
  suggestionRow: { gap: spacing.sm, paddingRight: spacing.md },
  suggestionCard: {
    width: 164,
    gap: spacing.xs,
    // Same height for all cards, Follow buttons lined up at the bottom.
    justifyContent: 'space-between',
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  suggestionTop: { alignItems: 'center', gap: spacing.xxs },
});
