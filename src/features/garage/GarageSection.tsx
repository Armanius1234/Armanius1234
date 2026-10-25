import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '@/i18n';
import { colors, spacing } from '@/theme/tokens';
import { AppText, Button, EmptyView, ErrorView, Skeleton } from '@/ui';

import { useSignedUrls, useVehicles } from './api';
import { VehicleCard } from './components';

/** The garage on a profile: your own (with "Add vehicle") or someone else's. */
export function GarageSection({ ownerId, isMe }: { ownerId: string; isMe: boolean }) {
  const { t } = useI18n();
  const vehicles = useVehicles(ownerId);
  const coverPaths = (vehicles.data ?? []).flatMap((v) => (v.vehicle_images[0] ? [v.vehicle_images[0].storage_path] : []));
  const covers = useSignedUrls('vehicle-photos', coverPaths);

  const count = vehicles.data?.length ?? 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <AppText variant="overline" color="textSecondary">
          {t('garage.title').toUpperCase()}
        </AppText>
        {isMe && count > 0 ? (
          <AppText variant="caption" color="textSecondary">
            {t('garage.count', { n: count })}
          </AppText>
        ) : null}
      </View>

      {vehicles.isPending ? (
        <Skeleton style={styles.skeleton} />
      ) : vehicles.isError ? (
        <View style={styles.box}>
          <ErrorView onRetry={() => void vehicles.refetch()} retrying={vehicles.isFetching} />
        </View>
      ) : count === 0 ? (
        <View style={styles.box}>
          {isMe ? (
            <EmptyView icon="car-sport-outline" title={t('garage.empty')} body={t('garage.emptyBody')} />
          ) : (
            <EmptyView icon="car-sport-outline" title={t('garage.emptyOther')} />
          )}
        </View>
      ) : (
        vehicles.data.map((v) => {
          const cover = v.vehicle_images[0]?.storage_path;
          return (
            <VehicleCard
              key={v.id}
              vehicle={v}
              coverUrl={cover ? covers.data?.[cover] : null}
              onPress={() => router.push({ pathname: '/vehicle/[id]', params: { id: v.id } })}
            />
          );
        })
      )}

      {isMe && count < 10 ? (
        <Button
          label={t('garage.add')}
          variant={count === 0 ? 'primary' : 'secondary'}
          icon={<Ionicons name="add" size={20} color={colors.textPrimary} />}
          onPress={() => router.push('/vehicle/new')}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  skeleton: { height: 220 },
  box: { minHeight: 200 },
});
