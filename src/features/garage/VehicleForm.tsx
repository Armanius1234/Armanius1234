import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useI18n } from '@/i18n';
import type { Vehicle } from '@/lib/database.types';
import { errorKey } from '@/lib/errors';
import { EMPTY_VEHICLE_FORM, POPULAR_MAKES, vehicleSchema, type VehicleErrorKey, type VehicleForm } from '@/shared/vehicle';
import { colors, radius, spacing } from '@/theme/tokens';
import { AppText, Button, FormMessage, Screen, Section, SwitchRow, TextField } from '@/ui';

import {
  useAddVehiclePhoto,
  useCreateVehicle,
  useDeleteVehicle,
  useMakeCover,
  useRemoveVehiclePhoto,
  useSignedUrls,
  useUpdateVehicle,
  type VehicleWithImages,
} from './api';

type Field = keyof VehicleForm;

function toForm(v: Vehicle): VehicleForm {
  return {
    make: v.make,
    model: v.model,
    generation: v.generation ?? '',
    color: v.color ?? '',
    model_year: String(v.model_year),
    horsepower: v.horsepower ? String(v.horsepower) : '',
    modifications: v.modifications,
    description: v.description,
    visibility: v.visibility,
  };
}

/** Add (no vehicle) or edit (with vehicle) a car. */
export function VehicleFormScreen({ vehicle }: { vehicle?: VehicleWithImages }) {
  const { t } = useI18n();
  const create = useCreateVehicle();
  const update = useUpdateVehicle(vehicle?.id ?? '');
  const remove = useDeleteVehicle();

  const [form, setForm] = useState<VehicleForm>(vehicle ? toForm(vehicle) : EMPTY_VEHICLE_FORM);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const set = (field: Field) => (value: string) => setForm((f) => ({ ...f, [field]: value }));

  async function save() {
    setFormError(null);
    const parsed = vehicleSchema().safeParse(form);
    if (!parsed.success) {
      const next: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) {
        const f = issue.path[0] as Field;
        if (!next[f]) next[f] = t(`errors.${issue.message as VehicleErrorKey}`);
      }
      setErrors(next);
      return;
    }
    setErrors({});
    try {
      if (vehicle) {
        await update.mutateAsync(parsed.data);
        router.back();
      } else {
        const created = await create.mutateAsync(parsed.data);
        // Continue straight to photos.
        router.replace({ pathname: '/vehicle/[id]/edit', params: { id: created.id } });
      }
    } catch (e) {
      setFormError(t(errorKey(e)));
    }
  }

  function confirmDelete() {
    if (!vehicle) return;
    Alert.alert(t('vehicle.deleteTitle'), t('vehicle.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('vehicle.delete'),
        style: 'destructive',
        onPress: () =>
          remove.mutate(vehicle, {
            onSuccess: () => router.dismissTo('/profile'),
            onError: (e) => setFormError(t(errorKey(e))),
          }),
      },
    ]);
  }

  const busy = create.isPending || update.isPending;

  return (
    <Screen
      scroll
      edges={['bottom']}
      contentStyle={styles.content}
      footer={<Button label={t('common.save')} onPress={save} loading={busy} disabled={remove.isPending} />}
    >
      {vehicle ? (
        <PhotoManager vehicle={vehicle} onError={(e) => setFormError(t(errorKey(e)))} />
      ) : (
        <AppText variant="caption" color="textSecondary">
          {t('vehicle.photosAfterSave')}
        </AppText>
      )}

      <View style={styles.makeBlock}>
        <TextField
          label={t('vehicle.make')}
          value={form.make}
          onChangeText={set('make')}
          maxLength={40}
          autoCapitalize="words"
          error={errors.make}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.makeChips}>
          {POPULAR_MAKES.map((m) => (
            <Pressable
              key={m}
              accessibilityRole="button"
              accessibilityLabel={m}
              onPress={() => set('make')(m)}
              style={[styles.chip, form.make === m && styles.chipSelected]}
            >
              <AppText variant="callout" color={form.make === m ? 'textPrimary' : 'textSecondary'}>
                {m}
              </AppText>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <TextField label={t('vehicle.model')} value={form.model} onChangeText={set('model')} maxLength={60} error={errors.model} />
      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField
            label={`${t('vehicle.generation')} (${t('common.optional')})`}
            value={form.generation}
            onChangeText={set('generation')}
            maxLength={40}
            autoCapitalize="characters"
            hint={t('vehicle.generationHint')}
            error={errors.generation}
          />
        </View>
        <View style={styles.year}>
          <TextField
            label={t('vehicle.year')}
            value={form.model_year}
            onChangeText={(v) => set('model_year')(v.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            maxLength={4}
            error={errors.model_year}
          />
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField
            label={`${t('vehicle.color')} (${t('common.optional')})`}
            value={form.color}
            onChangeText={set('color')}
            maxLength={30}
            error={errors.color}
          />
        </View>
        <View style={styles.year}>
          <TextField
            label={`${t('vehicle.horsepower')}`}
            value={form.horsepower}
            onChangeText={(v) => set('horsepower')(v.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            maxLength={4}
            error={errors.horsepower}
          />
        </View>
      </View>
      <TextField
        label={`${t('vehicle.modifications')} (${t('common.optional')})`}
        value={form.modifications}
        onChangeText={set('modifications')}
        placeholder={t('vehicle.modificationsPlaceholder')}
        multiline
        maxLength={2000}
        error={errors.modifications}
      />
      <TextField
        label={`${t('vehicle.description')} (${t('common.optional')})`}
        value={form.description}
        onChangeText={set('description')}
        multiline
        maxLength={1000}
        error={errors.description}
      />
      <Section>
        <SwitchRow
          label={t('vehicle.showOnProfile')}
          hint={t('vehicle.showOnProfileHint')}
          value={form.visibility === 'public'}
          onChange={(on) => setForm((f) => ({ ...f, visibility: on ? 'public' : 'private' }))}
        />
      </Section>
      <FormMessage message={formError} />
      {vehicle ? (
        <Button label={t('vehicle.delete')} variant="ghost" onPress={confirmDelete} loading={remove.isPending} />
      ) : null}
    </Screen>
  );
}

function PhotoManager({ vehicle, onError }: { vehicle: VehicleWithImages; onError: (e: unknown) => void }) {
  const { t } = useI18n();
  const images = vehicle.vehicle_images;
  const urls = useSignedUrls(
    'vehicle-photos',
    images.map((i) => i.storage_path),
  );
  const add = useAddVehiclePhoto(vehicle.id);
  const removePhoto = useRemoveVehiclePhoto(vehicle.id);
  const makeCover = useMakeCover(vehicle.id);

  function addPhoto() {
    const position = Math.min(9, images.length ? Math.max(...images.map((i) => i.position)) + 1 : 0);
    Alert.alert(t('vehicle.photos'), undefined, [
      { text: t('vehicle.takePhoto'), onPress: () => add.mutate({ source: 'camera', position }, { onError }) },
      { text: t('vehicle.fromLibrary'), onPress: () => add.mutate({ source: 'library', position }, { onError }) },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  function photoOptions(imageId: string) {
    const image = images.find((i) => i.id === imageId);
    if (!image) return;
    Alert.alert(t('vehicle.photos'), undefined, [
      ...(images[0]?.id !== imageId
        ? [{ text: t('vehicle.makeCover'), onPress: () => makeCover.mutate({ images, coverId: imageId }, { onError }) }]
        : []),
      {
        text: t('vehicle.removePhoto'),
        style: 'destructive' as const,
        onPress: () => removePhoto.mutate(image, { onError }),
      },
      { text: t('common.cancel'), style: 'cancel' as const },
    ]);
  }

  return (
    <View style={styles.photos}>
      <AppText variant="heading">{t('vehicle.photos')}</AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
        {images.map((img, i) => (
          <Pressable
            key={img.id}
            accessibilityRole="button"
            accessibilityLabel={`${t('vehicle.photos')} ${i + 1}`}
            onPress={() => photoOptions(img.id)}
            style={styles.thumb}
          >
            {urls.data?.[img.storage_path] ? (
              <Image
                source={{ uri: urls.data[img.storage_path], cacheKey: img.storage_path }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
            ) : (
              <ActivityIndicator color={colors.textSecondary} />
            )}
            {i === 0 ? (
              <View style={styles.coverTag}>
                <AppText variant="caption">{t('vehicle.cover')}</AppText>
              </View>
            ) : null}
          </Pressable>
        ))}
        {images.length < 10 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('vehicle.takePhoto')}
            onPress={addPhoto}
            disabled={add.isPending}
            style={[styles.thumb, styles.addThumb]}
          >
            {add.isPending ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Ionicons name="camera-outline" size={28} color={colors.accent} />
            )}
          </Pressable>
        ) : null}
      </ScrollView>
      <AppText variant="caption" color="textSecondary">
        {t('vehicle.photosHint')}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, gap: spacing.md },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: spacing.sm },
  year: { width: 120 },
  makeBlock: { gap: spacing.xs },
  makeChips: { gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: { borderColor: colors.accent, backgroundColor: colors.accentSubtle },
  photos: { gap: spacing.xs },
  photoRow: { gap: spacing.xs },
  thumb: {
    width: 120,
    height: 90,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addThumb: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.accent, backgroundColor: colors.accentSubtle },
  coverTag: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.overlay,
  },
});
