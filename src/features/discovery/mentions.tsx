import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { useI18n } from '@/i18n';
import { avatarUrl } from '@/lib/supabase';
import { colors, radius, spacing } from '@/theme/tokens';
import { AppText, Avatar } from '@/ui';

import { completeMention, mentionInProgress, splitMentions, useDebounced, usePeopleSearch } from './api';

const openProfile = (username: string) => router.push({ pathname: '/user/[username]', params: { username } });

/** Text with tappable @names (captions and comments). Use inside an AppText. */
export function MentionText({ text }: { text: string }) {
  return (
    <>
      {splitMentions(text).map((part, i) =>
        part.mention ? (
          <AppText
            key={i}
            color="accent"
            accessibilityRole="link"
            onPress={() => openProfile(part.mention!)}
          >
            {part.text}
          </AppText>
        ) : (
          part.text
        ),
      )}
    </>
  );
}

/** While someone types "@na…", shows matching people to tap. */
export function MentionSuggestions({ text, onPick }: { text: string; onPick: (next: string) => void }) {
  const { t } = useI18n();
  const typing = mentionInProgress(text);
  const debounced = useDebounced(typing ?? '', 200);
  const people = usePeopleSearch(typing && typing.length >= 2 ? debounced : '', 5);
  if (!typing || typing.length < 2 || !people.data?.length) return null;
  return (
    <ScrollView
      horizontal
      keyboardShouldPersistTaps="always"
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={t('feed.mentionSuggestions')}
      contentContainerStyle={styles.chips}
    >
      {people.data.map((p) => (
        <Pressable
          key={p.user_id}
          accessibilityRole="button"
          accessibilityLabel={`@${p.username}`}
          onPress={() => onPick(completeMention(text, p.username))}
          style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
        >
          <Avatar uri={avatarUrl(p.avatar_path)} name={p.display_name} size={24} />
          <AppText variant="callout">@{p.username}</AppText>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85 },
  chips: { gap: spacing.xs, paddingVertical: spacing.xxs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    minHeight: 36,
    borderRadius: radius.full,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
