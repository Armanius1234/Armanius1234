import { useLocalSearchParams } from 'expo-router';

import { useAuth } from '@/features/auth/AuthProvider';
import { useVehicle } from '@/features/garage/api';
import { VehicleFormScreen } from '@/features/garage/VehicleForm';
import { useI18n } from '@/i18n';
import { EmptyView, ErrorView, LoadingView } from '@/ui';

export default function EditVehicleScreen() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const uid = useAuth().session?.user.id;
  const vehicle = useVehicle(String(id));

  if (vehicle.isPending) return <LoadingView />;
  if (vehicle.isError) return <ErrorView onRetry={() => void vehicle.refetch()} retrying={vehicle.isFetching} />;
  if (!vehicle.data || vehicle.data.owner_id !== uid) {
    return <EmptyView icon="car-sport-outline" title={t('vehicle.notFound')} />;
  }
  return <VehicleFormScreen key={vehicle.data.id} vehicle={vehicle.data} />;
}
