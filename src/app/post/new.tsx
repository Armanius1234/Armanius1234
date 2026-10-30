import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { MentionSuggestions } from '@/features/discovery/mentions';
import { useMyVehicles } from '@/features/garage/api';
import { useCreatePost } from '@/features/social/api';
import { useI18n } from '@/i18n';
import { errorKey } from '@/lib/errors';
import { pickImage, pickImages, type PreparedImage } from '@/lib/images';
import { vehicleTitle } from '@/shared/vehicle';
import { colors, radius, spacing } from '@/theme/tokens';
import { AppText, Button, FormMessage, Screen, TextField } from '@/ui';

const MAX = 10;

export default function NewPostScreen() {
  const { t } = useI18n();
  const vehicles = useMyVehicles();
  const create = useCreatePost();
  const [images, setImages] = useState<PreparedImage[]>([]);
  const [caption, setCaption] = useState('');
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  async function add(source: 'library' | 'camera') {
    setFormError(null);
    setPicking(true);
    try {
      const room = MAX - images.length;
      const picked =
        source === 'library'
          ? await pickImages(room, 1600)
          : await pickImage({ source: 'camera', maxSize: 1600 }).then((i) => (i ? [i] : []));
      setImages((cur) => [...cur, ...picked].slice(0, MAX));
    } catch (e) {
      setFormError(t(errorKey(e)));
    } finally {
      setPicking(false);
    }
  }

  async function publish() {
    setFormError(null);
    if (images.length === 0) {
      setFormError(t('errors.media_required'));
      return;
    }
    if (caption.length > 2200) return;
    try {
      const id = await create.mutateAsync({ images, caption, vehicleId });
      router.replace({ pathname: '/post/[id]', params: { id } });
    } catch (e) {
      setFormError(t(errorKey(e)));
    }
  }

  return (
    <Screen
      scroll
      edges={['bottom']}
      contentStyle={styles.content}
      footer={
        <Button
          label={t('post.publish')}
          onPress={publish}
          loading={create.isPending}
          disabled={picking || images.length === 0}
        />
      }
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
        {images.map((img, i) => (
          <Pressable
            key={img.uri}
            accessibilityRole="button"
            accessibilityLabel={t('vehicle.removePhoto')}
            onPress={() =>
              Alert.alert(t('vehicle.removePhoto'), undefined, [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('vehicle.removePhoto'),
                  style: 'destructive',
                  onPress: () => setImages((cur) => cur.filter((_, j) => j !== i)),
                },
              ])
            }
            disabled={create.isPending}
            style={styles.thumb}
          >
            <Image source={{ uri: img.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
            {i === 0 ? (
              <View style={styles.coverTag}>
                <AppText variant="caption">{t('vehicle.cover')}</AppText>
              </View>
            ) : null}
          </Pressable>
        ))}
        {images.length < MAX ? (
          <View style={styles.addColumn}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('post.choosePhotos')}
              onPress={() => void add('library')}
              disabled={picking || create.isPending}
              style={[styles.addTile]}
            >
              <Ionicons name="images-outline" size={24} color={colors.accent} />
              <AppText variant="caption" color="accent">
                {t('post.choosePhotos')}
              </AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('post.takePhoto')}
              onPress={() => void add('camera')}
              disabled={picking || create.isPending}
              style={[styles.addTile]}
            >
              <Ionicons name="camera-outline" size={24} color={colors.accent} />
              <AppText variant="caption" color="accent">
                {t('post.takePhoto')}
              </AppText>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
      <AppText variant="caption" color="textSecondary">
        {t('post.photosHint')}
      </AppText>

      <TextField
        label={t('post.caption')}
        value={caption}
        onChangeText={setCaption}
        placeholder={t('post.captionPlaceholder')}
        multiline
        maxLength={2200}
        editable={!create.isPending}
      />
      <MentionSuggestions text={caption} onPick={setCaption} />

      {vehicles.data && vehicles.data.length > 0 ? (
        <View style={styles.vehicles}>
          <AppText variant="caption" color="textSecondary">
            {t('post.tagVehicle')}
          </AppText>
          <View style={styles.chips}>
            {[{ id: null as string | null, label: t('post.noVehicle') }, ...vehicles.data.map((v) => ({ id: v.id, label: vehicleTitle(v) }))].map(
              (option) => {
                const selected = vehicleId === option.id;
                return (
                  <Pressable
                    key={option.id ?? 'none'}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={option.label}
                    onPress={() => setVehicleId(option.id)}
                    style={[styles.chip, selected && styles.chipSelected]}
                  >
                    <AppText variant="callout" color={selected ? 'textPrimary' : 'textSecondary'}>
                      {option.label}
                    </AppText>
                  </Pressable>
                );
              },
            )}
          </View>
        </View>
      ) : null}

      <FormMessage message={formError} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, gap: spacing.md },
  thumbs: { gap: spacing.xs },
  thumb: { width: 140, height: 140, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.bgElevated },
  addColumn: { gap: spacing.xs },
  addTile: {
    width: 140,
    height: 66,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.accent,
    backgroundColor: colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  coverTag: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.overlay,
  },
  vehicles: { gap: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: { borderColor: colors.accent, backgroundColor: colors.accentSubtle },
});
