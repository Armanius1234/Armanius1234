import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import type {
  PlateClaim,
  QueueItem,
  SearchResult,
  Vehicle,
  VehicleImage,
  VehicleInsert,
  VehicleUpdate,
} from '@/lib/database.types';
import { pickImage, randomFileName, readBytes, UploadError } from '@/lib/images';
import { supabase } from '@/lib/supabase';
import type { PlateParts } from '@/shared/plate';

export const garageKeys = {
  vehicles: (ownerId: string | undefined) => ['vehicles', ownerId] as const,
  vehicle: (id: string) => ['vehicle', id] as const,
  claims: (uid: string | undefined) => ['claims', uid] as const,
  signed: (bucket: string, paths: string[]) => ['signed', bucket, ...paths] as const,
  admin: ['admin'] as const,
  queue: ['admin', 'queue'] as const,
};

export type VehicleWithImages = Vehicle & { vehicle_images: VehicleImage[] };

function useUid() {
  return useAuth().session?.user.id;
}

function sortImages<T extends { vehicle_images: VehicleImage[] }>(v: T): T {
  return {
    ...v,
    vehicle_images: [...v.vehicle_images].sort(
      (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at),
    ),
  };
}

// ------------------------------------------------------------------ vehicles

/** All vehicles of one owner that the viewer may see (RLS decides). */
export function useVehicles(ownerId: string | undefined) {
  return useQuery({
    queryKey: garageKeys.vehicles(ownerId),
    enabled: !!ownerId,
    queryFn: async (): Promise<VehicleWithImages[]> => {
      const { data, error } = await supabase
        .from('vehicles')
        .select('*, vehicle_images(*)')
        .eq('owner_id', ownerId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data as VehicleWithImages[]).map(sortImages);
    },
  });
}

export function useMyVehicles() {
  return useVehicles(useUid());
}

/** One vehicle; null when it does not exist or is not visible to you. */
export function useVehicle(id: string) {
  return useQuery({
    queryKey: garageKeys.vehicle(id),
    queryFn: async (): Promise<VehicleWithImages | null> => {
      const { data, error } = await supabase
        .from('vehicles')
        .select('*, vehicle_images(*)')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data ? sortImages(data as VehicleWithImages) : null;
    },
  });
}

function useInvalidateGarage() {
  const qc = useQueryClient();
  const uid = useUid();
  return (vehicleId?: string) => {
    void qc.invalidateQueries({ queryKey: garageKeys.vehicles(uid) });
    if (vehicleId) void qc.invalidateQueries({ queryKey: garageKeys.vehicle(vehicleId) });
  };
}

export type VehicleInput = Omit<VehicleInsert, 'owner_id'>;

export function useCreateVehicle() {
  const uid = useUid();
  const invalidate = useInvalidateGarage();
  return useMutation({
    mutationFn: async (input: VehicleInput): Promise<Vehicle> => {
      if (!uid) throw new Error('Not signed in');
      const { data, error } = await supabase
        .from('vehicles')
        .insert({ ...input, owner_id: uid })
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidate(),
  });
}

export function useUpdateVehicle(vehicleId: string) {
  const invalidate = useInvalidateGarage();
  return useMutation({
    mutationFn: async (patch: VehicleUpdate) => {
      const { error } = await supabase.from('vehicles').update(patch).eq('id', vehicleId);
      if (error) throw error;
    },
    onSuccess: () => invalidate(vehicleId),
  });
}

/**
 * Deletes a vehicle. Its photos and any unreviewed verification photos are
 * removed from storage first, so no files are left behind.
 */
export function useDeleteVehicle() {
  const uid = useUid();
  const qc = useQueryClient();
  const invalidate = useInvalidateGarage();
  return useMutation({
    mutationFn: async (vehicle: VehicleWithImages) => {
      if (!uid) throw new Error('Not signed in');
      const claims = qc.getQueryData<PlateClaim[]>(garageKeys.claims(uid)) ?? [];
      for (const c of claims.filter((x) => x.vehicle_id === vehicle.id && x.request_id)) {
        const folder = `${uid}/${c.request_id}`;
        const { data } = await supabase.storage.from('verification-evidence').list(folder);
        if (data?.length) {
          await supabase.storage.from('verification-evidence').remove(data.map((f) => `${folder}/${f.name}`));
        }
      }
      const paths = vehicle.vehicle_images.map((i) => i.storage_path);
      if (paths.length) await supabase.storage.from('vehicle-photos').remove(paths);
      const { error } = await supabase.from('vehicles').delete().eq('id', vehicle.id);
      if (error) throw error;
    },
    onSuccess: (_d, vehicle) => {
      invalidate(vehicle.id);
      void qc.invalidateQueries({ queryKey: garageKeys.claims(uid) });
    },
  });
}

/** Pick (or shoot) a photo, upload it and attach it to the vehicle. */
export function useAddVehiclePhoto(vehicleId: string) {
  const invalidate = useInvalidateGarage();
  return useMutation({
    mutationFn: async ({ source, position }: { source: 'library' | 'camera'; position: number }) => {
      const image = await pickImage({ source, maxSize: 1600 });
      if (!image) return null;
      const path = `${vehicleId}/${randomFileName()}.jpg`;
      try {
        const { error } = await supabase.storage
          .from('vehicle-photos')
          .upload(path, await readBytes(image.uri), { contentType: 'image/jpeg', upsert: false });
        if (error) throw error;
      } catch (e) {
        throw new UploadError(e);
      }
      const { error } = await supabase.from('vehicle_images').insert({
        vehicle_id: vehicleId,
        storage_path: path,
        position,
        width: image.width,
        height: image.height,
      });
      if (error) {
        await supabase.storage.from('vehicle-photos').remove([path]);
        throw error;
      }
      return path;
    },
    onSuccess: () => invalidate(vehicleId),
  });
}

export function useRemoveVehiclePhoto(vehicleId: string) {
  const invalidate = useInvalidateGarage();
  return useMutation({
    mutationFn: async (image: VehicleImage) => {
      const { error } = await supabase.from('vehicle_images').delete().eq('id', image.id);
      if (error) throw error;
      await supabase.storage.from('vehicle-photos').remove([image.storage_path]);
    },
    onSuccess: () => invalidate(vehicleId),
  });
}

/** Moves a photo to the front so it becomes the cover. */
export function useMakeCover(vehicleId: string) {
  const invalidate = useInvalidateGarage();
  return useMutation({
    mutationFn: async ({ images, coverId }: { images: VehicleImage[]; coverId: string }) => {
      const ordered = [images.find((i) => i.id === coverId)!, ...images.filter((i) => i.id !== coverId)];
      for (const [index, img] of ordered.entries()) {
        if (img.position !== index) {
          const { error } = await supabase.from('vehicle_images').update({ position: index }).eq('id', img.id);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => invalidate(vehicleId),
  });
}

/** Short-lived links for photos in private buckets (1 hour). */
export function useSignedUrls(bucket: 'vehicle-photos' | 'verification-evidence', paths: string[]) {
  return useQuery({
    queryKey: garageKeys.signed(bucket, paths),
    enabled: paths.length > 0,
    staleTime: 50 * 60 * 1000,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, 3600);
      if (error) throw error;
      const out: Record<string, string> = {};
      for (const item of data) {
        if (item.path && item.signedUrl) out[item.path] = item.signedUrl;
      }
      return out;
    },
  });
}

// -------------------------------------------------------------------- plates

export function useMyClaims() {
  const uid = useUid();
  return useQuery({
    queryKey: garageKeys.claims(uid),
    enabled: !!uid,
    queryFn: async (): Promise<PlateClaim[]> => {
      const { data, error } = await supabase.rpc('my_plate_claims');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Latest claim per vehicle (the one the UI shows). */
export function latestClaimFor(claims: PlateClaim[] | undefined, vehicleId: string): PlateClaim | undefined {
  return claims?.find((c) => c.vehicle_id === vehicleId);
}

function useInvalidateClaims() {
  const qc = useQueryClient();
  const uid = useUid();
  return (vehicleId?: string) => {
    void qc.invalidateQueries({ queryKey: garageKeys.claims(uid) });
    void qc.invalidateQueries({ queryKey: garageKeys.vehicles(uid) });
    if (vehicleId) void qc.invalidateQueries({ queryKey: garageKeys.vehicle(vehicleId) });
  };
}

export function useClaimPlate(vehicleId: string) {
  const invalidate = useInvalidateClaims();
  return useMutation({
    mutationFn: async (plate: PlateParts) => {
      const { data, error } = await supabase.rpc('claim_plate', {
        p_vehicle_id: vehicleId,
        p_country: 'DE',
        p_district: plate.district,
        p_letters: plate.letters,
        p_digits: plate.digits,
        p_suffix: plate.suffix,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidate(vehicleId),
  });
}

export function useSetPlateSettings(vehicleId: string) {
  const invalidate = useInvalidateClaims();
  return useMutation({
    mutationFn: async (input: { claimId: string; discoverable: boolean; showOwner: boolean }) => {
      const { error } = await supabase.rpc('set_plate_settings', {
        p_claim_id: input.claimId,
        p_discoverable: input.discoverable,
        p_show_owner: input.showOwner,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidate(vehicleId),
  });
}

export function useReleasePlate(vehicleId: string) {
  const invalidate = useInvalidateClaims();
  return useMutation({
    mutationFn: async (claimId: string) => {
      const { error } = await supabase.rpc('release_plate', { p_claim_id: claimId });
      if (error) throw error;
    },
    onSuccess: () => invalidate(vehicleId),
  });
}

export function useStartVerification() {
  const invalidate = useInvalidateClaims();
  return useMutation({
    mutationFn: async (claimId: string) => {
      const { data, error } = await supabase.rpc('start_verification', { p_claim_id: claimId });
      if (error) throw error;
      const row = data?.[0];
      if (!row) throw new Error('No verification request returned');
      return row;
    },
    onSuccess: () => invalidate(),
  });
}

/** Evidence photos already uploaded for a request (owner's own folder). */
export function useEvidenceFiles(requestId: string | null | undefined) {
  const uid = useUid();
  return useQuery({
    queryKey: ['evidence', uid, requestId],
    enabled: !!uid && !!requestId,
    queryFn: async (): Promise<string[]> => {
      const folder = `${uid}/${requestId}`;
      const { data, error } = await supabase.storage.from('verification-evidence').list(folder);
      if (error) throw error;
      return (data ?? []).filter((f) => f.name.endsWith('.jpg')).map((f) => `${folder}/${f.name}`);
    },
  });
}

export function useAddEvidence(requestId: string) {
  const uid = useUid();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // Live photos only: the camera, never the gallery.
      const image = await pickImage({ source: 'camera', maxSize: 1600 });
      if (!image) return null;
      const path = `${uid}/${requestId}/${randomFileName()}.jpg`;
      try {
        const { error } = await supabase.storage
          .from('verification-evidence')
          .upload(path, await readBytes(image.uri), { contentType: 'image/jpeg', upsert: false });
        if (error) throw error;
      } catch (e) {
        throw new UploadError(e);
      }
      return path;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['evidence', uid, requestId] }),
  });
}

export function useRemoveEvidence(requestId: string) {
  const uid = useUid();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (path: string) => {
      const { error } = await supabase.storage.from('verification-evidence').remove([path]);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['evidence', uid, requestId] }),
  });
}

export function useSubmitVerification() {
  const invalidate = useInvalidateClaims();
  return useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase.rpc('submit_verification', { p_request_id: requestId });
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });
}

// -------------------------------------------------------------------- search

export function useSearchPlate() {
  return useMutation({
    mutationFn: async (plate: PlateParts): Promise<SearchResult | null> => {
      const { data, error } = await supabase.rpc('search_plate', {
        p_country: 'DE',
        p_district: plate.district,
        p_letters: plate.letters,
        p_digits: plate.digits,
        p_suffix: plate.suffix,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}

// --------------------------------------------------------------------- admin

/** UI hint only. Every admin action is checked again on the server. */
export function useIsAdmin() {
  const uid = useUid();
  return useQuery({
    queryKey: [...garageKeys.admin, uid],
    enabled: !!uid,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('am_i_admin');
      if (error) throw error;
      return data === true;
    },
  });
}

export function useVerificationQueue(enabled: boolean) {
  return useQuery({
    queryKey: garageKeys.queue,
    enabled,
    queryFn: async (): Promise<QueueItem[]> => {
      const { data, error } = await supabase.rpc('admin_verification_queue');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Approve or reject, then delete the evidence photos straight away
 * (retention rule: evidence is kept only until the decision).
 */
export function useDecideVerification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { requestId: string; approve: boolean; note: string }) => {
      const { data: paths, error } = await supabase.rpc('admin_decide_verification', {
        p_request_id: input.requestId,
        p_approve: input.approve,
        p_note: input.note || null,
      });
      if (error) throw error;
      await purgeEvidence(input.requestId, paths ?? []);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: garageKeys.admin }),
  });
}

async function purgeEvidence(requestId: string, paths: string[]) {
  if (paths.length) {
    const { error } = await supabase.storage.from('verification-evidence').remove(paths);
    if (error) throw error;
  }
  const { error } = await supabase.rpc('admin_mark_evidence_purged', { p_request_id: requestId });
  if (error) throw error;
}

/** Retries evidence deletion that failed earlier (e.g. lost connection). */
export function useEvidenceCleanup(enabled: boolean) {
  const qc = useQueryClient();
  const pending = useQuery({
    queryKey: [...garageKeys.admin, 'cleanup'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_pending_evidence_cleanup');
      if (error) throw error;
      return data ?? [];
    },
  });
  const run = useMutation({
    mutationFn: async () => {
      for (const item of pending.data ?? []) {
        if (item.evidence_paths.length) {
          const { error } = await supabase.storage.from('verification-evidence').remove(item.evidence_paths);
          if (error) throw error;
        }
        // Expired requests have no decision to record; ignore that error.
        await supabase.rpc('admin_mark_evidence_purged', { p_request_id: item.request_id });
      }
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: garageKeys.admin }),
  });
  return { pending, run };
}
