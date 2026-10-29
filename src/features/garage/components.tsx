import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useRef, type ComponentRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useI18n, type TKey } from '@/i18n';
import type { ClaimStatus } from '@/lib/database.types';
import { formatPlate, plateInputFilters, type PlateParts, type PlateSuffix } from '@/shared/plate';
import { vehicleTitle } from '@/shared/vehicle';
import { colors, fonts, hitSize, radius, spacing } from '@/theme/tokens';
import { AppText } from '@/ui';

// ---------------------------------------------------------------- plate UI --

const PLATE_BLUE = '#003399';
const PLATE_TEXT = '#111111';

function EuStrip({ height }: { height: number }) {
  return (
    <View style={[styles.euStrip, { height }]}>
      <AppText style={[styles.euStars, { fontSize: height * 0.18 }]}>★</AppText>
      <AppText style={[styles.euCountry, { fontSize: height * 0.32 }]}>D</AppText>
    </View>
  );
}

/** Read-only plate as it looks on the car (e.g. "WI-FA 480"). */
export function PlateBadge({ plate, size = 'md' }: { plate: string; size?: 'sm' | 'md' | 'lg' }) {
  const height = size === 'sm' ? 28 : size === 'lg' ? 56 : 40;
  return (
    <View style={[styles.plate, { height }]} accessibilityRole="text" accessibilityLabel={formatPlate(plate)}>
      <EuStrip height={height} />
      <AppText style={[styles.plateText, { fontSize: height * 0.55, lineHeight: height * 0.8 }]} numberOfLines={1}>
        {formatPlate(plate)}
      </AppText>
    </View>
  );
}

type PlateInputProps = {
  value: PlateParts;
  onChange: (next: PlateParts) => void;
  onSubmit?: () => void;
  error?: string;
  disabled?: boolean;
};

/**
 * Plate-shaped input with separate fields for district, letters and numbers,
 * because the separator changes the meaning ("F-AB" ≠ "FA-B").
 */
export function PlateInput({ value, onChange, onSubmit, error, disabled }: PlateInputProps) {
  const { t } = useI18n();
  const lettersRef = useRef<ComponentRef<typeof TextInput>>(null);
  const digitsRef = useRef<ComponentRef<typeof TextInput>>(null);

  const field = (key: 'district' | 'letters' | 'digits') => (text: string) => {
    const filtered = plateInputFilters[key](text);
    onChange({ ...value, [key]: filtered });
    if (key === 'district' && filtered.length === 3) lettersRef.current?.focus();
    if (key === 'letters' && filtered.length === 2) digitsRef.current?.focus();
  };

  const suffixes: { v: PlateSuffix; label: TKey }[] = [
    { v: '', label: 'plate.suffixNone' },
    { v: 'E', label: 'plate.suffixE' },
    { v: 'H', label: 'plate.suffixH' },
  ];

  return (
    <View style={styles.inputWrap}>
      <View style={[styles.plate, styles.plateInput, !!error && styles.plateError]}>
        <EuStrip height={64} />
        <TextInput
          accessibilityLabel={t('plate.district')}
          placeholder="WI"
          placeholderTextColor="#B0B0B0"
          value={value.district}
          onChangeText={field('district')}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!disabled}
          maxLength={3}
          style={[styles.plateField, styles.fieldDistrict]}
          returnKeyType="next"
          onSubmitEditing={() => lettersRef.current?.focus()}
        />
        <View style={styles.seals}>
          <View style={styles.seal} />
          <View style={styles.seal} />
        </View>
        <TextInput
          ref={lettersRef}
          accessibilityLabel={t('plate.letters')}
          placeholder="FA"
          placeholderTextColor="#B0B0B0"
          value={value.letters}
          onChangeText={field('letters')}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!disabled}
          maxLength={2}
          style={[styles.plateField, styles.fieldLetters]}
          returnKeyType="next"
          onSubmitEditing={() => digitsRef.current?.focus()}
        />
        <TextInput
          ref={digitsRef}
          accessibilityLabel={t('plate.digits')}
          placeholder="480"
          placeholderTextColor="#B0B0B0"
          value={value.digits}
          onChangeText={field('digits')}
          keyboardType="number-pad"
          editable={!disabled}
          maxLength={4}
          style={[styles.plateField, styles.fieldDigits]}
          returnKeyType="search"
          onSubmitEditing={onSubmit}
        />
        {value.suffix ? <AppText style={styles.suffixText}>{value.suffix}</AppText> : null}
      </View>
      <View style={styles.labels}>
        <AppText variant="caption" color="textSecondary" style={styles.labelDistrict}>
          {t('plate.district')}
        </AppText>
        <AppText variant="caption" color="textSecondary" style={styles.labelLetters}>
          {t('plate.letters')}
        </AppText>
        <AppText variant="caption" color="textSecondary" style={styles.labelDigits}>
          {t('plate.digits')}
        </AppText>
      </View>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={t('plate.suffix')}>
        {suffixes.map((s) => {
          const selected = value.suffix === s.v;
          return (
            <Pressable
              key={s.v || 'none'}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={t(s.label)}
              disabled={disabled}
              onPress={() => onChange({ ...value, suffix: s.v })}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <AppText variant="callout" color={selected ? 'textPrimary' : 'textSecondary'}>
                {t(s.label)}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <AppText variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

// ------------------------------------------------------------ status / badge --

const STATUS: Record<ClaimStatus, { label: TKey; color: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  not_verified: { label: 'plate.statusNotVerified', color: colors.textSecondary, icon: 'ellipse-outline' },
  pending: { label: 'plate.statusPending', color: colors.warning, icon: 'time-outline' },
  verified: { label: 'plate.statusVerified', color: colors.success, icon: 'checkmark-circle' },
  rejected: { label: 'plate.statusRejected', color: colors.danger, icon: 'close-circle-outline' },
  revoked: { label: 'plate.statusRevoked', color: colors.textSecondary, icon: 'remove-circle-outline' },
};

export function StatusPill({ status }: { status: ClaimStatus }) {
  const { t } = useI18n();
  const s = STATUS[status];
  return (
    <View style={[styles.pill, { borderColor: s.color }]}>
      <Ionicons name={s.icon} size={14} color={s.color} />
      <AppText variant="caption" style={{ color: s.color }}>
        {t(s.label)}
      </AppText>
    </View>
  );
}

export function VerifiedBadge({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <View style={styles.verified}>
      <Ionicons name="checkmark-circle" size={14} color={colors.accent} />
      <AppText variant="caption" color="accent">
        {label ?? t('garage.verified')}
      </AppText>
    </View>
  );
}

// -------------------------------------------------------------- vehicle card --

type CardVehicle = {
  make: string;
  model: string;
  generation: string | null;
  model_year: number;
  is_verified?: boolean;
  visibility?: 'public' | 'private';
};

export function VehicleCard({
  vehicle,
  coverUrl,
  coverPath,
  onPress,
  footer,
}: {
  vehicle: CardVehicle;
  coverUrl: string | null | undefined;
  /** Storage path of the cover: the cache key, so new signed links don't re-download it. */
  coverPath?: string | null;
  onPress?: () => void;
  footer?: React.ReactNode;
}) {
  const { t } = useI18n();
  const content = (
    <>
      <View style={styles.cover}>
        {coverUrl ? (
          <Image
            source={{ uri: coverUrl, cacheKey: coverPath ?? undefined }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <Ionicons name="car-sport-outline" size={40} color={colors.textDisabled} />
        )}
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardTitleRow}>
          <AppText variant="bodyStrong" numberOfLines={1} style={styles.flex}>
            {vehicleTitle(vehicle)}
          </AppText>
          {vehicle.is_verified ? <VerifiedBadge /> : null}
        </View>
        <View style={styles.cardMeta}>
          <AppText variant="callout" color="textSecondary">
            {vehicle.model_year}
          </AppText>
          {vehicle.visibility === 'private' ? (
            <View style={styles.inline}>
              <Ionicons name="lock-closed" size={12} color={colors.textSecondary} />
              <AppText variant="caption" color="textSecondary">
                {t('garage.private')}
              </AppText>
            </View>
          ) : null}
        </View>
        {footer}
      </View>
    </>
  );
  if (!onPress) return <View style={styles.card}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={vehicleTitle(vehicle)}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  // plate
  plate: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 2,
    borderColor: PLATE_TEXT,
    overflow: 'hidden',
    paddingRight: spacing.sm,
  },
  plateInput: { alignSelf: 'stretch', paddingRight: spacing.xs },
  plateError: { borderColor: colors.danger },
  euStrip: {
    width: 26,
    backgroundColor: PLATE_BLUE,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 4,
    marginRight: spacing.xs,
  },
  euStars: { color: '#FFCC00', lineHeight: 14 },
  euCountry: { color: '#FFFFFF', fontFamily: fonts.bold, lineHeight: 22 },
  plateText: { fontFamily: fonts.bold, color: PLATE_TEXT, letterSpacing: 1 },
  plateField: {
    height: 64,
    fontFamily: fonts.bold,
    fontSize: 30,
    color: PLATE_TEXT,
    textAlign: 'center',
    paddingHorizontal: 0,
  },
  fieldDistrict: { flex: 3, minWidth: 0 },
  fieldLetters: { flex: 2.2, minWidth: 0 },
  fieldDigits: { flex: 3.4, minWidth: 0 },
  seals: { gap: 4, marginHorizontal: 2 },
  seal: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#D9D9D9', borderWidth: 1, borderColor: '#BDBDBD' },
  suffixText: { fontFamily: fonts.bold, fontSize: 28, color: PLATE_TEXT },
  inputWrap: { gap: spacing.xs },
  labels: { flexDirection: 'row', paddingLeft: 34 },
  labelDistrict: { flex: 3, textAlign: 'center' },
  labelLetters: { flex: 2.6, textAlign: 'center' },
  labelDigits: { flex: 3.4, textAlign: 'center' },
  chips: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  chip: {
    minHeight: hitSize - 8,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  chipSelected: { borderColor: colors.accent, backgroundColor: colors.accentSubtle },
  // status
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  // card
  card: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cardPressed: { opacity: 0.85 },
  cover: {
    aspectRatio: 16 / 9,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { padding: spacing.sm, gap: spacing.xxs },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
